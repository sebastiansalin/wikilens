"""Download, verify and select complete article histories from the official M release.
Raw dumps and editor names stay local. The public aggregate omits editor names.
Requires pyarrow; install with `python -m pip install -r pipeline/requirements.txt`.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import urllib.request

BASE = 'https://github.com/MariaDB/mariadb-wikipedia-datasets/releases/download/m-2026-10/'
SOURCE = 'https://github.com/MariaDB/mariadb-wikipedia-datasets/releases/tag/m-2026-10'

def download(name, folder):
    target = folder / name
    if not target.exists():
        request = urllib.request.Request(BASE + name, headers={'User-Agent': 'WikiLens-research/1.0'})
        temporary = target.with_suffix(target.suffix + '.part')
        with urllib.request.urlopen(request, timeout=60) as response, temporary.open('wb') as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        temporary.replace(target)
    return target

def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()

def utc_rows(batch):
    """Preserve UTC epoch values without requiring Windows' absent IANA database."""
    import pyarrow as pa
    index = batch.schema.get_field_index('timestamp')
    if index < 0:
        raise ValueError('The M partition has no timestamp column')
    field = batch.schema.field(index)
    if not pa.types.is_timestamp(field.type) or field.type.tz not in ('UTC', 'Etc/UTC'):
        raise ValueError(f'Expected a UTC Arrow timestamp, received {field.type}')
    # Casting removes only the UTC metadata, never shifts the epoch values.
    batch = batch.set_column(index, 'timestamp', batch.column(index).cast(pa.timestamp(field.type.unit)))
    for row in batch.to_pylist():
        if row['timestamp'] is None:
            raise ValueError('A source revision has a missing timestamp')
        row['timestamp'] = row['timestamp'].isoformat() + 'Z'
        yield row

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', default='.local/dataset-m')
    parser.add_argument('--output', default='.local/m-pilot.jsonl')
    parser.add_argument('--count', type=int, default=20, help='Number of most-revised pages; 0 selects the entire M dataset')
    parser.add_argument('--titles', help='Optional JSON array of exact, unique article titles')
    args = parser.parse_args()
    import pyarrow as pa
    import pyarrow.compute as pc
    import pyarrow.parquet as pq
    folder = Path(args.directory)
    folder.mkdir(parents=True, exist_ok=True)
    sums = download('SHA256SUMS', folder)
    # Pin the release manifest digest observed on the official release page.
    if sha256(sums) != '7d59a6a28b10f996be3c36fc4d82f5faa97624f8fca7a37cbf5d70e4bb809f68':
        raise ValueError('Release checksum manifest changed: inspect the release before updating its pin')
    expected = {parts[1].lstrip('*'):parts[0] for line in sums.read_text().splitlines() if len(parts := line.split()) == 2}
    files = []
    counts, titles = collections.Counter(), {}
    for number in range(1,17):
        name = f'versions-{number:02d}.parquet'
        path = download(name, folder)
        actual = sha256(path)
        if actual != expected.get(name):
            raise ValueError(f'Checksum mismatch: {name}')
        files.append({'name':name,'sha256':actual})
        for batch in pq.ParquetFile(path).iter_batches(columns=['page_id','title'], batch_size=4096):
            for row in batch.to_pylist():
                counts[row['page_id']] += 1
                titles[row['page_id']] = row['title']
        print(f'Verified {name}', flush=True)
    if args.titles:
        requested = json.loads(Path(args.titles).read_text(encoding='utf-8'))
        if not requested or len(set(requested)) != len(requested):
            raise ValueError('A nonempty list of unique titles is required')
        selected = {page for page,title in titles.items() if title in requested}
        if len(selected) != len(requested):
            raise ValueError(f'Titles absent or ambiguous in M: {sorted(set(requested)-{titles[p] for p in selected})}')
        selection = f'{len(selected)} explicitly selected titles; full available M histories'
    else:
        if args.count < 0:
            raise ValueError('Count must be zero (all) or positive')
        selected = set(counts if args.count == 0 else sorted(counts, key=lambda page:(-counts[page], page))[:args.count])
        selection = (f'All {len(selected)} articles in the Finnish-history M dataset; complete available histories. Not all of Finnish Wikipedia.' if args.count == 0 else f'{len(selected)} pages with the most revisions in M, ties by page ID; selected before scoring. Activity-biased demonstration, not a representative sample.')
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(str(output) + '.part')
    selected_ids = pa.array(sorted(selected), type=pa.uint32())
    with temporary.open('w', encoding='utf-8', newline='\n') as sink:
        for file in files:
            for batch in pq.ParquetFile(folder/file['name']).iter_batches(batch_size=512):
                batch = batch.filter(pc.is_in(batch.column('page_id'), value_set=selected_ids))
                if not batch.num_rows:
                    continue
                for row in utc_rows(batch):
                    sink.write(json.dumps(row, ensure_ascii=False, default=str)+'\n')
            print(f'Processed {file["name"]}', flush=True)
    temporary.replace(output)
    manifest = {'dataset':'m-2026-10','source':SOURCE,'checksumsVerified':True,'files':files,'selection':selection,
                'exportSha256':sha256(output),'selected':[{'pageId':p,'title':titles[p],'revisions':counts[p]} for p in sorted(selected)]}
    Path(str(output)+'.manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Exported {len(selected)} articles and {sum(counts[p] for p in selected)} revisions to {output}', flush=True)

if __name__ == '__main__':
    main()
