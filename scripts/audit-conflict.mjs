// Read-only diagnostic; does not modify the scorer, database or published pilot.
import {readFile, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {getPool, closeDatabase} from '../server/database.mjs';
import {scoreArticle, qualifyEpisodes} from '../pipeline/score.mjs';
const raw=await readFile('public/data/conflict-pilot.json','utf8');
const pilot=JSON.parse(raw), DAY=86400000;
const cleanup=c=>/vandal|roskaa|roskaus|spam|test edit|testimuokkaus/i.test(c||'');
function detect(rows, days=30, lookback=100) {
  const seen=new Map(), events=[];
  for(let i=0;i<rows.length;i++) {
    const r=rows[i], prev=rows[i-1], gap=prev&&r.parent_id!==prev.rev_id;
    if(gap)seen.clear();
    const k=r.sha1?seen.get(r.sha1):undefined;
    if(prev&&!gap&&r.sha1!==prev.sha1&&k!==undefined&&i-k<=lookback&&r.time-rows[k].time<=days*DAY){
      const undone=rows.slice(k+1,i);
      for(const target of new Set(undone.map(x=>x.user).filter(u=>u&&u!==r.user)))
        events.push({actor:r.user,target,time:r.time,timestamp:r.timestamp,revision:r.rev_id,parent:prev.rev_id,
          restored:rows[k].rev_id,cleanup:cleanup(r.comment),weight:cleanup(r.comment)?0.25:1,
          undoneCount:undone.length,secondsSinceParent:(r.time-prev.time)/1000});
    }
    if(r.sha1)seen.set(r.sha1,i);
  }
  const {qualified}=qualifyEpisodes(events,days);
  return {qualified:[...qualified], counted:[...new Map([...qualified].map(e=>[e.revision,e])).values()].sort((a,b)=>a.time-b.time)};
}
function numeric(events, N) {
  const count=[...new Map(events.map(e=>[e.revision,e])).values()];
  const W=count.reduce((s,e)=>s+e.weight,0), D=new Set(count.map(e=>e.timestamp.slice(0,10))).size;
  const U=new Set(events.flatMap(e=>[e.actor,e.target])).size;
  return Math.round(1000*(.45*(1-Math.exp(-W/8))+.30*Math.min(1,W/(N+20)/.12)+.15*(1-Math.exp(-D/5))+.10*(U?1-Math.exp(-(U-1)/3):0)))/10;
}
function compactDiff(before,after) {
  let start=0,end=0;
  while(start<before.length&&start<after.length&&before[start]===after[start])start++;
  while(end<before.length-start&&end<after.length-start&&before[before.length-1-end]===after[after.length-1-end])end++;
  return {beforeLength:before.length,afterLength:after.length,removedLength:before.length-start-end,addedLength:after.length-start-end,
    context:before.slice(Math.max(0,start-100),start),removed:before.slice(start,before.length-end).slice(0,1800),added:after.slice(start,after.length-end).slice(0,1800)};
}
const report={pilotSha256:createHash('sha256').update(raw).digest('hex'),dataset:pilot.dataset,generatedAt:new Date().toISOString(),articles:[],days:[]};
const pool=await getPool(); assert.ok(pool);
try {
 for(const a of pilot.articles){
  const rows=await pool.query('SELECT page_id,title,rev_id,parent_id,revision_time,editor AS user,anonymous,edit_comment AS comment,minor,sha1,byte_length AS bytes FROM m_article_versions FOR SYSTEM_TIME ALL WHERE dataset=? AND page_id=? ORDER BY revision_time,rev_id',[pilot.dataset,a.pageId]);
  rows.forEach(r=>{r.timestamp=String(r.revision_time).replace(' ','T')+'Z';r.time=Date.parse(r.timestamp);delete r.revision_time;});
  const computed=scoreArticle(rows), detail=detect(rows);
  for(const key of ['score','revisions','disputedRevisions','participants','activeDays','comparableTransitions','weightedDisputedRevisions']) assert.equal(computed[key],a[key],`${a.title}: ${key}`);
  assert.equal(detail.counted.length,a.disputedRevisions); assert.equal(numeric(detail.qualified,computed.comparableTransitions),a.score);
  const cutoffs=['2021-10-01','2025-10-01'];
  const recent=Object.fromEntries(cutoffs.map(c=>{const v=scoreArticle(rows.filter(r=>r.timestamp>=c));return [c,{score:v.score,revisions:v.revisions,disputed:v.disputedRevisions}];}));
  const extended=detect(rows,30,1000);
  const shorter=detect(rows,7,100);
  const summary={pageId:a.pageId,title:a.title,score:a.score,disputed:a.disputedRevisions,days:a.activeDays,participants:a.participants,
    cleanupDiscounted:detail.counted.filter(e=>e.cleanup).length,withinOneMinute:detail.counted.filter(e=>e.secondsSinceParent<=60).length,
    lastDispute:detail.counted.at(-1)?.timestamp??null,recent,
    sensitivity:{sevenDayWindow:numeric(shorter.qualified,computed.comparableTransitions),thousandRevisionLookback:numeric(extended.qualified,computed.comparableTransitions)},
    baseline:computed.baseline};
  report.articles.push(summary);
  const byDay=new Map();for(const e of detail.counted){const d=e.timestamp.slice(0,10);if(!byDay.has(d))byDay.set(d,[]);byDay.get(d).push(e);}
  const need=new Set(detail.counted.flatMap(e=>[e.revision,e.parent]));
  const texts=need.size?await pool.query(`SELECT rev_id,wikitext FROM m_article_versions FOR SYSTEM_TIME ALL WHERE dataset=? AND page_id=? AND rev_id IN (${[...need].map(()=>'?').join(',')})`,[pilot.dataset,a.pageId,...need]):[];
  const textById=new Map(texts.map(r=>[r.rev_id,r.wikitext??''])),byId=new Map(rows.map(r=>[r.rev_id,r]));
  for(const [day,events] of byDay){
    report.days.push({title:a.title,pageId:a.pageId,day,count:events.length,events:events.map(e=>({revision:e.revision,parent:e.parent,restored:e.restored,
      timestamp:e.timestamp,cleanup:e.cleanup,secondsSinceParent:e.secondsSinceParent,undoneCount:e.undoneCount,
      comment:byId.get(e.revision).comment,parentComment:byId.get(e.parent).comment,
      ...compactDiff(textById.get(e.parent),textById.get(e.revision))}))});
  }
  console.log(JSON.stringify(summary));
 }
 await writeFile('.local/conflict-audit.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({verifiedArticles:report.articles.length,disputeDays:report.days.length,countedRevisions:report.articles.reduce((n,a)=>n+a.disputed,0)}));
}finally{await closeDatabase();}
