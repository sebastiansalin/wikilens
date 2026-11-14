import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {wikiRequest} from '../server/wikipedia.mjs';
import {mapLimit,chunks} from '../server/core.mjs';
import {LANGUAGES} from './language-model.mjs';
import {METHOD,digest,selectNeighborhood,extractProse,compareNeighborhoodArticle} from './language-neighborhood.mjs';
export async function captureNeighborhood({request=wikiRequest,count=100,seed='Talvisota'}={}){
 const atlas=JSON.parse(await readFile('public/data/atlas/index.json','utf8')),selected=selectNeighborhood(atlas.articles,seed,count);
 const requestRetry=async(lang,params)=>{let error;for(let i=0;i<3;i++)try{return await request(lang,params);}catch(e){error=e;await new Promise(r=>setTimeout(r,500*(i+1)));}throw error;};
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
   }catch(e){return [lang,{status:'unavailable',reason:e.message}];}
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
 const result={schemaVersion:2,method:METHOD,generatedAt:new Date().toISOString(),atlasVersion:atlas.version,selection:{seed,count,policy:'Breadth-first over undirected Finnish M connections; neighbors ordered by in-dataset degree, then page ID. Includes the seed. Not a popularity sample.'},languages:LANGUAGES,articles};
 if(articles.filter(a=>compareNeighborhoodArticle(a).measuredPairs>=3).length<Math.ceil(count*.7))throw Error('Capture quality gate failed: fewer than 70% of articles have three measurable pairs.');
 return result;
}
export async function buildNeighborhood(capture){
 if(capture.method!==METHOD||capture.articles.length!==capture.selection.count)throw Error('Invalid neighborhood capture');
 const articles=capture.articles.map(a=>{const {hash,...body}=a;if(digest(body)!==hash)throw Error(`Capture hash mismatch: ${a.title}`);return compareNeighborhoodArticle(a);});
 return {...capture,articles,formula:'100 × square-root Jensen–Shannon divergence of normalized concept prominence. Concepts are Wikidata IDs linked from paragraph prose; first three paragraphs count double. Mean across at least three measurable edition pairs. Coverage difference, not a contradiction or opinion score.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const dir='public/data/language-neighborhood';await mkdir(dir,{recursive:true});let capture;
 try{capture=JSON.parse(await readFile(`${dir}/capture.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;capture=await captureNeighborhood();await writeFile(`${dir}/capture.json`,JSON.stringify(capture));}
 const index=await buildNeighborhood(capture);await writeFile(`${dir}/index.json`,JSON.stringify(index));
 const report={method:METHOD,generatedAt:capture.generatedAt,articles:index.articles.length,availableEditions:capture.articles.reduce((n,a)=>n+LANGUAGES.filter(l=>a.editions[l].status==='available').length,0),measuredArticles:index.articles.filter(a=>a.score!==null).length,measuredPairs:index.articles.reduce((n,a)=>n+a.measuredPairs,0),seed:capture.selection.seed,bytes:JSON.stringify(capture).length};
 await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
