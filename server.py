"""Local, read-only HTTP API backed by MariaDB. Run after ingest.py."""
import argparse
import difflib
import json
import mimetypes
import re
from collections import defaultdict
from datetime import datetime, timedelta
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from db import connect
from ingest import links
from scoring import score_window, smooth_score

ROOT = Path(__file__).parent/'web'
SNAPSHOT = datetime(2026,10,1,23,59,59)


@lru_cache(maxsize=1)
def history():
    db=connect()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT page_id,rev_id,editor AS user,happened_at AS timestamp FROM revision_meta ORDER BY page_id,happened_at')
            rows=defaultdict(list)
            for r in cur.fetchall(): rows[r['page_id']].append(r)
            cur.execute('SELECT * FROM reversal ORDER BY happened_at')
            events=defaultdict(list)
            for r in cur.fetchall():
                r['timestamp']=r.pop('happened_at')
                events[r['page_id']].append(r)
            cur.execute("SELECT value FROM metadata WHERE name='dataset'")
            meta=json.loads(cur.fetchone()['value'])
            cur.execute('SELECT VERSION() AS version')
            meta['mariadbVersion']=cur.fetchone()['version']
        return rows,events,meta
    finally: db.close()


def arguments(q):
    date=q.get('date',['2026-10-01'])[0]
    end=min(datetime.strptime(date,'%Y-%m-%d')+timedelta(days=1,microseconds=-1),SNAPSHOT)
    days=int(q.get('days',['0'])[0])
    if days not in (0,30,90,365): raise ValueError('Unsupported window')
    start=end-timedelta(days=days) if days else datetime(2000,1,1)
    return start,end,days


@lru_cache(maxsize=32)
def graph(date='2026-10-01',days=0):
    start,end,_=arguments({'date':[date],'days':[str(days)]})
    rows,events,meta=history()
    stats={pid:score_window(rs,events[pid],start,end) for pid,rs in rows.items()}
    total=sum(s['edits'] for s in stats.values())
    baseline=sum(s['mutual'] for s in stats.values())/max(1,total)
    db=connect()
    nodes=[]
    text_links={}
    try:
        with db.cursor() as cur:
            # SVT supplies text, title, and article size at the selected historical date.
            snapshots=[]
            for pid in rows:
                cur.execute('SELECT page_id,title,rev_id,bytes,text FROM article FOR SYSTEM_TIME AS OF %s WHERE page_id=%s', (end,pid))
                r=cur.fetchone()
                if r: snapshots.append(r)
            for r in snapshots:
                pid=r['page_id']; s=stats[pid]
                score=smooth_score(s['mutual'],s['edits'],baseline)
                nodes.append({'id':pid,'title':r['title'],'revId':r['rev_id'],
                    'sizeBytes':r['bytes'] or len(r['text'].encode()),'score':round(score,3),
                    'enoughData':s['edits']>=20,'veryControversial':s['edits']>=20 and s['mutual']>=5 and score>=3,
                    **{k:v for k,v in s.items() if k!='events'}})
                text_links[pid]=links(r['text'])
    finally: db.close()
    titles={n['title']:n['id'] for n in nodes}
    edges=[{'source':pid,'target':titles[t]} for pid,targets in text_links.items()
           for t in sorted(targets) if t in titles and titles[t]!=pid]
    return {'nodes':nodes,'edges':edges,'meta':meta,'baseline':baseline,
            'date':end.date().isoformat(),'days':days,'strength':20,
            'coverage':'36 selected pages from M shard 01; links outside this sample are omitted.'}


def detail(pid,q):
    start,end,days=arguments(q)
    rows,events,_=history()
    if pid not in rows: raise KeyError('Article not in sample')
    s=score_window(rows[pid],events[pid],start,end)
    timeline=defaultdict(lambda:{'edits':0,'reverts':0,'mutual':0})
    for r in rows[pid]:
        if r['timestamp']<=end: timeline[r['timestamp'].strftime('%Y-%m')]['edits']+=1
    directions={(e['actor'],e['target']) for e in s['events']}
    for e in s['events']:
        m=timeline[e['timestamp'].strftime('%Y-%m')]
        m['reverts']+=1
        if (e['target'],e['actor']) in directions: m['mutual']+=1
    db=connect()
    try:
        with db.cursor() as cur:
            cur.execute('SELECT title,rev_id,text,row_start FROM article FOR SYSTEM_TIME AS OF %s WHERE page_id=%s',(end,pid))
            article=cur.fetchone()
            # Real before/after text for the strongest/latest observed episodes.
            evidence=[]
            for e in sorted(s['events'],key=lambda e:((e['target'],e['actor']) in directions,e['timestamp']),reverse=True)[:12]:
                cur.execute('SELECT rev_id,text FROM article FOR SYSTEM_TIME ALL WHERE page_id=%s AND rev_id IN (%s,%s)',
                            (pid,e['reverted_rev_id'],e['rev_id']))
                versions={r['rev_id']:r['text'] for r in cur.fetchall()}
                before=versions.get(e['reverted_rev_id'],'').splitlines()
                after=versions.get(e['rev_id'],'').splitlines()
                diff=list(difflib.unified_diff(before,after,n=1))
                evidence.append({**e,'mutual':(e['target'],e['actor']) in directions,
                                 'diff':'\n'.join(line[:1500] for line in diff[:45])})
    finally: db.close()
    excerpt=''
    if article:
        excerpt=re.sub(r'\[\[([^]|]+)\|([^]]+)\]\]',r'\2',article['text'])
        excerpt=re.sub(r'\[\[([^]]+)\]\]',r'\1',excerpt)[:6000]
    return {'stats':{k:v for k,v in s.items() if k!='events'},'events':evidence,
        'timeline':[{'month':m,**v} for m,v in sorted(timeline.items())],
        'article':{'title':article['title'],'revId':article['rev_id'],'date':article['row_start'],'excerpt':excerpt} if article else None}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed=urlparse(self.path); q=parse_qs(parsed.query)
        try:
            if parsed.path=='/api/graph':
                _,end,days=arguments(q)
                return self.send_json(graph(end.date().isoformat(),days))
            if parsed.path=='/api/article': return self.send_json(detail(int(q['id'][0]),q))
            if parsed.path=='/api/health':
                db=connect()
                with db.cursor() as cur:
                    cur.execute('SELECT VERSION() AS version'); result=cur.fetchone()
                db.close()
                return self.send_json({'ok':True,'database':'MariaDB',**result})
            path=(ROOT/('index.html' if parsed.path=='/' else parsed.path.lstrip('/'))).resolve()
            if not path.is_relative_to(ROOT.resolve()) or not path.is_file():
                return self.send_error(404)
            body=path.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type',mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
            self.send_header('Content-Length',str(len(body)))
            self.end_headers(); self.wfile.write(body)
        except (ValueError,KeyError) as e: self.send_json({'error':str(e)},400)
        except Exception:
            import traceback; traceback.print_exc()
            self.send_json({'error':'Database request failed. Check server logs and database availability.'},503)

    def send_json(self,data,status=200):
        body=json.dumps(data,ensure_ascii=False,default=lambda x:x.isoformat() if hasattr(x,'isoformat') else str(x)).encode()
        self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(body))); self.send_header('Cache-Control','no-store')
        self.end_headers(); self.wfile.write(body)


if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('--port',type=int,default=8000); args=p.parse_args()
    print(f'WikiLens running at http://127.0.0.1:{args.port}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
