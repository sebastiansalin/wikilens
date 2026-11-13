"""Integration checks against the imported 36-page sample and running local API."""
import json
import urllib.request
from datetime import datetime
from db import connect


def check():
    db=connect()
    with db.cursor() as c:
        c.execute('SELECT COUNT(*) AS n FROM article FOR SYSTEM_TIME ALL')
        assert c.fetchone()['n']==42242
        c.execute('SELECT COUNT(*) AS n FROM revision_meta')
        assert c.fetchone()['n']==42242
        c.execute('SELECT COUNT(*) AS n FROM reversal')
        assert c.fetchone()['n']==6488
        c.execute('''SELECT COUNT(*) AS n FROM (
          SELECT row_end, LEAD(row_start) OVER(PARTITION BY page_id ORDER BY row_start) AS next_start
          FROM article FOR SYSTEM_TIME ALL) AS periods
          WHERE next_start IS NOT NULL AND row_end<>next_start''')
        assert c.fetchone()['n']==0,'Periods must be contiguous per article'
        c.execute('SELECT rev_id,row_start,row_end FROM article FOR SYSTEM_TIME ALL WHERE page_id=1137 ORDER BY row_start LIMIT 2')
        first,second=c.fetchall()
        c.execute('SELECT rev_id FROM article FOR SYSTEM_TIME AS OF %s WHERE page_id=1137',(first['row_start'],))
        assert c.fetchone()['rev_id']==first['rev_id']
        c.execute('SELECT rev_id FROM article FOR SYSTEM_TIME AS OF %s WHERE page_id=1137',(second['row_start'],))
        assert c.fetchone()['rev_id']==second['rev_id'],'Start-inclusive/end-exclusive boundary'
    db.close()
    def get(path): return json.load(urllib.request.urlopen('http://127.0.0.1:8000'+path))
    health=get('/api/health'); assert health['ok'] and 'MariaDB' in health['version']
    graph=get('/api/graph'); assert len(graph['nodes'])==36 and len(graph['edges'])==97
    assert any(n['veryControversial'] for n in graph['nodes'])
    assert all(0<=n['score']<=100 and n['mutual']<=n['reverts']<=n['edits'] for n in graph['nodes'])
    detail=get('/api/article?id=1137'); assert detail['events'] and detail['article']['revId']
    assert any(e['mutual'] and e['diff'] for e in detail['events'])
    early=get('/api/graph?date=2010-12-31&days=365')
    assert early['nodes'] and all(n['edits']<=next(v['edits'] for v in graph['nodes'] if v['id']==n['id']) for n in early['nodes'])
    print(f'PASS: MariaDB {health["version"]}; 42,242 revisions; contiguous SVT periods; exact AS OF boundaries; 36 nodes; 97 links; real diff evidence; historical window.')


if __name__=='__main__': check()
