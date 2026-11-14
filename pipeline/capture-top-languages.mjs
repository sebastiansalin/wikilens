import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {wikiRequest} from '../server/wikipedia.mjs';
import {mapLimit,chunks} from '../server/core.mjs';
import {LANGUAGES} from './language-model.mjs';
import {METHOD,digest,extractProse,compareNeighborhoodArticle} from './language-neighborhood.mjs';
import {selectTopArticles,SELECTION_POLICY} from './top-language-selection.mjs';
export async function captureNeighborhood({request=wikiRequest,count=100}={}){
 const started=Date.now();let requests=0,retries=0;
 const atlas=JSON.parse(await readFile('public/data/atlas/index.json','utf8')),selected=selectTopArticles(atlas.articles,count);
 let nextStart=0,blockedUntil=0;
 const requestRetry=async(lang,params)=>{let error;for(let i=0;i<6;i++){
  const start=Math.max(Date.now(),nextStart,blockedUntil);nextStart=start+650;
  if(start>Date.now())await new Promise(r=>setTimeout(r,start-Date.now()));
  try{requests++;return await request(lang,params);}catch(e){retries++;error=e;const delay=e.status===429?Math.min(60000,15000*(i+1)):2000*(i+1);blockedUntil=Math.max(blockedUntil,Date.now()+delay);console.log(`Retry ${lang}: status ${e.status||'network'}; attempt ${i+1}`);}
 }throw error;};
 const metadata=new Map();for(const batch of chunks(selected,50)){const data=await requestRetry('fi',{pageids:batch.map(a=>a.id).join('|'),prop:'pageprops'});for(const p of data.query?.pages||[])metadata.set(p.pageid,p);}
 const qids=[...new Set(selected.map(a=>metadata.get(a.id)?.pageprops?.wikibase_item).filter(Boolean))],entities={};
 for(const ids of chunks(qids,50)){const data=await requestRetry('wikidata',{action:'wbgetentities',ids:ids.join('|'),props:'sitelinks',sitefilter:LANGUAGES.map(l=>l+'wiki').join('|')});Object.assign(entities,data.entities);}
 const articles=await mapLimit(selected,3,async a=>{
  const qid=metadata.get(a.id)?.pageprops?.wikibase_item||null;
  const editions=Object.fromEntries(await mapLimit(LANGUAGES,2,async lang=>{
   const title=entities[qid]?.sitelinks?.[lang+'wiki']?.title;if(!title)return [lang,{status:'missing',reason:'No matching Wikidata sitelink.'}];
   try{
    const meta=await requestRetry(lang,{titles:title,redirects:'1',prop:'pageprops|revisions',rvprop:'ids|timestamp'}),page=meta.query?.pages?.find(p=>!p.missing&&p.ns===0),rev=page?.revisions?.[0];
    if(page?.pageprops?.wikibase_item!==qid||!rev?.revid)throw Error('Edition identity could not be verified.');
    const data=await requestRetry(lang,{action:'parse',oldid:String(rev.revid),prop:'text|sections',disableeditsection:'1',disabletoc:'1'});if(data.parse?.revid!==rev.revid)throw Error('Revision mismatch.');
    const prose=extractProse(typeof data.parse.text==='string'?data.parse.text:data.parse.text?.['*']);if(!prose.paragraphs.length)throw Error('No readable prose.');
    return [lang,{status:'available',title:page.title,qid,revision:rev.revid,timestamp:rev.timestamp,url:`https://${lang}.wikipedia.org/w/index.php?oldid=${rev.revid}`,...prose,sections:(data.parse.sections||[]).map(s=>({title:s.line.replace(/<[^>]+>/g,''),anchor:s.anchor,level:s.level})),identities:{}}];
   }catch(e){if(e.status===429)throw e;return [lang,{status:'unavailable',reason:e.message}];}
  }));console.log(`Captured ${a.title}`);return {...a,qid,editions};
 });
 // Resolve each distinct linked title once per language; redirects share one QID.
 for(const lang of LANGUAGES){
  const titles=[...new Set(articles.flatMap(a=>a.editions[lang]?.paragraphs?.flatMap(p=>p.links)||[]))],identities=new Map();
  await mapLimit(chunks(titles,50),3,async batch=>{
   const data=await requestRetry(lang,{titles:batch.join('|'),redirects:'1',prop:'pageprops'}),aliases=new Map([...(data.query?.normalized||[]),...(data.query?.redirects||[])].map(x=>[x.from,x.to])),pages=new Map((data.query?.pages||[]).filter(p=>!p.missing&&p.ns===0).map(p=>[p.title,p]));
   for(const title of batch){let resolved=title;const seen=new Set();while(aliases.has(resolved)&&!seen.has(resolved)){seen.add(resolved);resolved=aliases.get(resolved);}const p=pages.get(resolved);identities.set(title,{title:resolved,qid:p?.pageprops?.wikibase_item||null});}
  });
  for(const a of articles){const e=a.editions[lang];if(e?.status==='available')e.identities=Object.fromEntries([...new Set(e.paragraphs.flatMap(p=>p.links))].map(t=>[t,identities.get(t)]));}
  console.log(`${lang}: resolved ${titles.length} linked titles`);
 }
 for(const a of articles)a.hash=digest(a);
 const result={schemaVersion:2,method:METHOD,generatedAt:new Date().toISOString(),atlasVersion:atlas.version,selection:{count,policy:SELECTION_POLICY,rankingMethod:'wikilens-index-v2.2',window:'all-history',through:atlas.articles.reduce((last,a)=>a.to>last?a.to:last,'')},captureMetrics:{seconds:Math.round((Date.now()-started)/1000),requests,retries},languages:LANGUAGES,articles};
 if(!articles.some(a=>compareNeighborhoodArticle(a).measuredPairs>0))throw Error('No measurable language pair: refusing an empty publication.');
 return result;
}
export async function buildNeighborhood(capture){
 if(capture.schemaVersion!==2||capture.method!==METHOD||capture.articles.length!==capture.selection.count||new Set(capture.articles.map(a=>a.id)).size!==capture.articles.length)throw Error('Invalid neighborhood capture');
 const articles=capture.articles.map(a=>{const {hash,...body}=a;if(digest(body)!==hash)throw Error(`Capture hash mismatch: ${a.title}`);const {score,depth,parent,...result}=compareNeighborhoodArticle(a);return result;});
 return {...capture,articles,formula:'100 x square-root Jensen-Shannon divergence of normalized concept prominence. Concepts are Wikidata IDs linked from paragraph prose; first three paragraphs count double. Each language pair is separate. Coverage difference, not a contradiction or opinion score.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const dir='public/data/language-differences';await mkdir(dir,{recursive:true});let capture;
 try{capture=JSON.parse(await readFile(`${dir}/capture.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;if(process.argv.includes('--offline'))throw Error('Committed language capture is missing; offline build cannot recapture.');capture=await captureNeighborhood();await writeFile(`${dir}/capture.json`,JSON.stringify(capture));}
 if(capture.storage==='article-shards')capture={...capture,articles:await Promise.all(capture.articles.map(async a=>{if(!Number.isSafeInteger(a.id)||a.id<1)throw Error('Invalid capture ID');const full=JSON.parse(await readFile(`${dir}/captures/${a.id}.json`,'utf8'));if(full.id!==a.id||full.hash!==a.hash)throw Error('Capture manifest mismatch');return full;}))};
 const index=await buildNeighborhood(capture);
 await mkdir(`${dir}/captures`,{recursive:true});await mkdir(`${dir}/details`,{recursive:true});
 for(const a of capture.articles)await writeFile(`${dir}/captures/${a.id}.json`,JSON.stringify(a));
 for(const a of index.articles)await writeFile(`${dir}/details/${a.id}.json`,JSON.stringify(a));
 const compact={...index,storage:'article-shards',articles:index.articles.map(({id,title,qid,hash,measuredPairs},i)=>({id,title,qid,hash,measuredPairs,rank:capture.articles[i].rank,editingScore:capture.articles[i].editingScore}))};
 await writeFile(`${dir}/index.json`,JSON.stringify(compact));
 await writeFile(`${dir}/capture.json`,JSON.stringify({...capture,storage:'article-shards',articles:capture.articles.map(({id,title,hash})=>({id,title,hash,path:`captures/${id}.json`}))}));
 const report={method:METHOD,generatedAt:capture.generatedAt,articles:index.articles.length,availableEditions:capture.articles.reduce((n,a)=>n+LANGUAGES.filter(l=>a.editions[l].status==='available').length,0),measuredPairs:index.articles.reduce((n,a)=>n+a.measuredPairs,0),selection:capture.selection,captureMetrics:capture.captureMetrics,articlesWithAnyPair:index.articles.filter(a=>a.measuredPairs>0).length,missingEditions:capture.articles.reduce((n,a)=>n+LANGUAGES.filter(l=>a.editions[l].status==='missing').length,0),unavailableEditions:capture.articles.reduce((n,a)=>n+LANGUAGES.filter(l=>a.editions[l].status==='unavailable').length,0),sourceBytes:capture.articles.reduce((n,a)=>n+Buffer.byteLength(JSON.stringify(a)),0)};
 await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
