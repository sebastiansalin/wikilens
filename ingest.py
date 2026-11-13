"""Download one verified M shard and import a small deterministic real-data sample."""
import argparse
import hashlib
import json
import re
import urllib.request
from collections import Counter, defaultdict
from datetime import timedelta
from pathlib import Path
import pyarrow.parquet as pq
import pyarrow as pa
from db import connect, SCHEMA
from scoring import detect_reverts

RELEASE = 'https://github.com/MariaDB/mariadb-wikipedia-datasets/releases/download/m-2026-10/'
ROOT = Path(__file__).parent


def links(text):
    return {m.split('|')[0].split('#')[0].strip().replace('_', ' ')
            for m in re.findall(r'\[\[([^\[\]]+)\]\]', text)
            if ':' not in m.split('|')[0] and m.split('|')[0].strip()}


def ingest(path, limit):
    parquet = pq.ParquetFile(path)
    meta = parquet.read(columns=['page_id', 'title']).to_pylist()
    counts = Counter(r['page_id'] for r in meta)
    # Mix heavily edited and moderate/quiet pages; not a representative population sample.
    ranked = sorted(counts, key=lambda p: (-counts[p], p))
    heavy = ranked[:max(1, limit * 2 // 3)]
    remaining = ranked[len(heavy):]
    stride = max(1, len(remaining) // max(1, limit-len(heavy)))
    chosen = set((heavy + remaining[::stride])[:limit])
    db = connect(False)
    with db.cursor() as cur:
        cur.execute('CREATE DATABASE IF NOT EXISTS wikilens CHARACTER SET utf8mb4')
        cur.execute('USE wikilens')
        for sql in SCHEMA:
            cur.execute(sql)
        cur.execute('SELECT COUNT(*) AS n FROM article FOR SYSTEM_TIME ALL')
        if cur.fetchone()['n']:
            raise SystemExit('Database already contains revisions; refusing duplicate import. Use a fresh database.')
        cur.execute('SET system_versioning_insert_history=1')
    total = 0
    all_events = 0
    current = None
    buffer = []
    pages = []

    def flush(rows):
        nonlocal total, all_events
        if not rows:
            return
        rows.sort(key=lambda r: (r['timestamp'], r['rev_id']))
        # Preserve source ordering when Wikipedia saved several edits in one second.
        for i in range(1, len(rows)):
            if rows[i]['timestamp'] <= rows[i-1]['timestamp']:
                rows[i]['timestamp'] = rows[i-1]['timestamp'] + timedelta(microseconds=1)
        db.begin()
        try:
            with db.cursor() as cur:
                for i, r in enumerate(rows):
                    start = r['timestamp'].replace(tzinfo=None)
                    end = rows[i+1]['timestamp'].replace(tzinfo=None) if i+1 < len(rows) else None
                    args = (r['page_id'], r['title'], r['rev_id'], r['parent_id'], r['user'],
                            r['comment'], r['sha1'], r['bytes'], r['text'] or '', start)
                    columns = 'page_id,title,rev_id,parent_id,editor,comment,sha1,bytes,text,row_start'
                    if end:
                        cur.execute(f'INSERT INTO article ({columns},row_end) VALUES ({",".join(["%s"]*11)})', args+(end,))
                    else:
                        cur.execute(f'INSERT INTO article ({columns}) VALUES ({",".join(["%s"]*10)})', args)
                    cur.execute('INSERT INTO revision_meta VALUES (%s,%s,%s,%s)',
                                (r['page_id'],r['rev_id'],r['user'],start))
                events = detect_reverts(rows)
                for e in events:
                    cur.execute('INSERT INTO reversal VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',
                        (rows[0]['page_id'],e['rev_id'],e['reverted_rev_id'],e['restored_rev_id'],
                         e['timestamp'].replace(tzinfo=None),e['actor'],e['target'],e['comment']))
            db.commit()
        except Exception:
            db.rollback()
            raise
        total += len(rows)
        all_events += len(events)
        pages.append((rows[-1]['page_id'],rows[-1]['title'],links(rows[-1]['text'] or '')))
        print(f'Imported {rows[-1]["page_id"]}: {len(rows)} revisions, {len(events)} restorations', flush=True)

    for batch in parquet.iter_batches(batch_size=128):
        ids = batch.column('page_id').to_pylist()
        selected_indices = [i for i, pid in enumerate(ids) if pid in chosen]
        if not selected_indices:
            continue
        selected=batch.take(selected_indices)
        # Parquet timestamps are UTC. Remove timezone metadata after preserving
        # the epoch values, so Windows does not need an external timezone DB.
        idx=selected.schema.get_field_index('timestamp')
        selected=selected.set_column(idx,'timestamp',selected.column(idx).cast(pa.timestamp('ms')))
        for r in selected.to_pylist():
            if current is not None and r['page_id'] != current:
                flush(buffer)
                buffer = []
            current = r['page_id']
            buffer.append(r)
    flush(buffer)
    title_ids = {title: pid for pid,title,_ in pages}
    with db.cursor() as cur:
        for pid,_,targets in pages:
            for title in targets:
                if title in title_ids and title_ids[title] != pid:
                    cur.execute('INSERT IGNORE INTO article_link VALUES (%s,%s)',(pid,title_ids[title]))
        info = {'dataset':'M', 'shard':path.name, 'snapshot':'2026-10-01',
                'pages':len(pages),'revisions':total,'restorations':all_events,
                'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                'selection':'Most edited two-thirds plus deterministic spread of remaining pages; not representative.',
                'source':'https://github.com/MariaDB/mariadb-wikipedia-datasets/releases/tag/m-2026-10'}
        cur.execute('REPLACE INTO metadata VALUES (%s,%s)',('dataset',json.dumps(info)))
    db.close()
    print(json.dumps(info), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--file', type=Path)
    parser.add_argument('--limit',type=int,default=36)
    args = parser.parse_args()
    path = args.file or ROOT/'data'/'versions-01.parquet'
    if not path.exists():
        path.parent.mkdir(parents=True,exist_ok=True)
        urllib.request.urlretrieve(RELEASE+path.name,path)
    sums = urllib.request.urlopen(RELEASE+'SHA256SUMS').read().decode()
    expected = next(line.split()[0] for line in sums.splitlines() if line.endswith('  '+path.name))
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if expected != actual:
        raise SystemExit('Dataset checksum mismatch')
    if not 2 <= args.limit <= 100:
        raise SystemExit('--limit must be between 2 and 100 for this prototype')
    ingest(path,args.limit)
