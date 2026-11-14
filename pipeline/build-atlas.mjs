/** Read every history back from MariaDB, verify it against the checked source, score, publish aggregates. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getPool,closeDatabase} from '../server/database.mjs';
import {articleHistories,verifiedManifest} from './input.mjs';
import {scoreArticle,METHOD} from './score-v2.mjs';
import {prepare} from './score-v1.mjs';
const capture='m-2026-10-atlas',input=process.argv[2]||'.local/m-atlas.jsonl';
const source=await verifiedManifest(input);
const code=await readFile(new URL('./score-v2.mjs',import.meta.url));
const version=createHash('sha256').update(code).update(await readFile(new URL('./score-v1.mjs',import.meta.url))).update(await readFile(new URL('../src/atlas-model.mjs',import.meta.url))).update(source.exportSha256).digest('hex').slice(0,16);
const checkpoint=`.local/atlas-scores/${version}`;
await mkdir(checkpoint,{recursive:true});
const digest=rows=>{const h=createHash('sha256');for(const r of prepare(rows).revisions)h.update(JSON.stringify([r.page_id,r.title,r.rev_id,r.parent_id,r.timestamp,r.user,Boolean(r.anonymous),r.comment||'',Boolean(r.minor),r.sha1,r.bytes??null,r.text??null]));return h.digest('hex');};
const expected=new Map();
console.log('Verifying source histories for readback comparison');
for await(const rows of articleHistories(input,source))expected.set(rows[0].page_id,digest(rows.sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)||a.rev_id-b.rev_id)));
const pool=await getPool();if(!pool)throw Error('MariaDB required');
const meta=await pool.query('SELECT completed,export_sha256 FROM m_atlas_captures WHERE capture=?',[capture]);
if(!meta[0]?.completed||meta[0].export_sha256!==source.exportSha256)throw Error('Complete the verified atlas import first');
let pages=0,revisions=0;
const articles=[],shards=Array.from({length:64},()=>({})),reviews=[],predictions={};
const hashNumber=s=>parseInt(createHash('sha256').update(String(s)).digest('hex').slice(0,8),16);
try{
 for(const selected of source.selected){
  let result;
  try{result=JSON.parse(await readFile(`${checkpoint}/${selected.pageId}.json`,'utf8'));if(result.sourceDigest!==expected.get(selected.pageId))throw Error('Source changed');}
  catch{
   const rows=await pool.query('SELECT page_id,title,rev_id,parent_id,revision_time,editor,anonymous,edit_comment,minor,sha1,byte_length,wikitext FROM m_article_versions FOR SYSTEM_TIME ALL WHERE dataset=? AND page_id=? ORDER BY revision_time,rev_id',[capture,selected.pageId]);
   const inputRows=rows.map(r=>({page_id:Number(r.page_id),title:r.title,rev_id:Number(r.rev_id),parent_id:Number(r.parent_id),timestamp:r.revision_time.replace(' ','T')+'Z',user:r.editor,anonymous:Boolean(r.anonymous),comment:r.edit_comment,minor:Boolean(r.minor),sha1:r.sha1,bytes:r.byte_length,text:r.wikitext}));
   if(rows.length!==selected.revisions||digest(inputRows)!==expected.get(selected.pageId))throw Error(`Database/source mismatch for ${selected.pageId}`);
   result={...scoreArticle(inputRows,{source:'MariaDB FOR SYSTEM_TIME ALL'}),sourceDigest:expected.get(selected.pageId)};
   // Predetermined article-level split. Reviewers never see predictions in the review UI.
   const examples=[];
   if(hashNumber(selected.pageId)%47===0&&inputRows.length>=20){
    const i=1+hashNumber(selected.pageId+'sample')%(inputRows.length-1),before=inputRows[i-1],after=inputRows[i];
    examples.push({id:`transition:${selected.pageId}:${after.rev_id}`,pageId:selected.pageId,title:result.title,split:hashNumber(selected.pageId)%5===0?'heldout':'development',kind:'random-transition',before:before.text?.slice(0,2500)||'',after:after.text?.slice(0,2500)||'',evidence:inputRows.slice(Math.max(1,i-2),i+3).map(r=>({revision:r.rev_id,parent:r.parent_id,timestamp:r.timestamp})),prediction:result.episodes.some(e=>e.category==='content'&&e.evidence.some(ev=>ev.revision===after.rev_id))?'content':'no-detected-episode'});
   }
   result.reviewExamples=examples;
   await writeFile(`${checkpoint}/${selected.pageId}.json`,JSON.stringify(result));
  }
  if(result.revisions!==selected.revisions)throw Error('Checkpoint revision mismatch');
  const {pageId,title,period,months,coverage,bytes,latestRevision,links,episodes,baseline}=result;
  const eligible=coverage.missingText/result.revisions<=.1&&coverage.missingUsers/result.revisions<=.1&&coverage.parentGaps/Math.max(1,result.revisions-1)<=.1;
  articles.push({id:pageId,title,from:period.from.slice(0,7),to:period.to.slice(0,7),eligible,bytes,latestRevision,months,links});
  shards[pageId%64][pageId]={pageId,title,coverage,baseline,episodes};
  for(const e of episodes){
   const id=`episode:${e.id}`;
   reviews.push({id,pageId,title,split:hashNumber(pageId)%5===0?'heldout':'development',kind:'candidate',before:e.before,after:e.after,evidence:e.evidence,prediction:e.category});
  }
  reviews.push(...(result.reviewExamples||[]));pages++;revisions+=result.revisions;
  if(pages%100===0){const progress={pages,revisions,totalPages:source.selected.length,version,updatedAt:new Date().toISOString()};await writeFile('.local/atlas-build-status.json',JSON.stringify(progress));console.log(JSON.stringify(progress));}
 }
}finally{await closeDatabase();}
const titleKey=s=>s.normalize('NFC').replaceAll('_',' ').trim();
const byTitle=new Map(articles.map(a=>[titleKey(a.title),a.id]));let edges=0;
for(const a of articles){a.links=[...new Set(a.links.map(t=>byTitle.get(titleKey(t))).filter(id=>id&&id!==a.id))];edges+=a.links.length;}
const dir=`public/data/atlas/${version}`;await mkdir(dir,{recursive:true});
for(let i=0;i<64;i++)await writeFile(`${dir}/${i}.json`,JSON.stringify(shards[i]));
// Fixed hash sampling, balanced by class and split; random transitions expose missed detections.
const reviewSelection=[];
for(const split of ['development','heldout'])for(const category of ['content','cleanup','maintenance','uncertain','no-detected-episode']){
 reviewSelection.push(...reviews.filter(r=>r.split===split&&r.prediction===category).sort((a,b)=>hashNumber(a.id)-hashNumber(b.id)).slice(0,12));
}
for(const r of reviewSelection){predictions[r.id]={category:r.prediction,split:r.split,pageId:r.pageId,kind:r.kind};delete r.prediction;}
await writeFile(`${dir}/review.json`,JSON.stringify({version,method:METHOD,instructions:'Classify independently. Review all linked revisions and surrounding history; excerpts are truncated and insufficient by themselves. Do not consult the algorithm before labeling. Split is by article. Candidate and random-transition samples have different units; report separately.',cases:reviewSelection}));
await mkdir('docs/qa',{recursive:true});
await writeFile('docs/qa/review-predictions.json',JSON.stringify({version,predictions},null,2));
const generatedAt=new Date().toISOString(),data={schemaVersion:2,method:METHOD,version,generatedAt,dataset:'m-2026-10',capture,engine:'MariaDB 11.4 / FOR SYSTEM_TIME ALL',snapshot:'2026-10-01',articleCount:pages,revisionCount:revisions,edgeCount:edges,sourceSha256:source.exportSha256,checksumManifestSha256:source.checksumManifestSha256||source.checksumManifest?.sha256,sourceVerified:true,databaseReadbackVerified:true,detailPath:`/data/atlas/${version}`,reviewCases:reviewSelection.length,articles};
await writeFile('public/data/atlas/index.json.tmp',JSON.stringify(data));await rename('public/data/atlas/index.json.tmp','public/data/atlas/index.json');
const report={version,method:METHOD,capture,pages,revisions,edges,generatedAt,sourceSha256:source.exportSha256,readbackDigestMatches:pages,reviewCases:reviewSelection.length,independentReview:'pending',categories:articles.reduce((tot,a)=>{for(const m of a.months)for(let i=3;i<7;i++)tot[i-3]+=m[i];return tot;},[0,0,0,0]),measured:articles.filter(a=>a.eligible&&a.months.reduce((n,m)=>n+m[1],0)>=20&&a.months.reduce((n,m)=>n+m[2],0)>=10).length};
await writeFile('docs/qa/atlas-calculation.json',JSON.stringify(report,null,2));
await writeFile('.local/atlas-build-status.json',JSON.stringify({...report,completed:true}));console.log(JSON.stringify(report));
