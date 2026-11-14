import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {wikiRequest,getSitelinks} from '../server/wikipedia.mjs';
import {mapLimit} from '../server/core.mjs';
import {LANGUAGES,leadParagraphs} from './language-model.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function captureLanguages({count=8,request=wikiRequest,sitelinksFor=getSitelinks}={}) {
  const atlas=JSON.parse(await readFile('public/data/atlas/index.json','utf8'));
  const candidates=atlas.articles.map(a=>({id:a.id,title:a.title,revisions:a.months.reduce((n,m)=>n+m[1],0)})).sort((a,b)=>b.revisions-a.revisions||a.id-b.id).slice(0,30);
  const rankings=[];
  for(let start=0;start<candidates.length;start+=10){
    const batch=candidates.slice(start,start+10),byId=new Map();let continuation;
    for(let step=0;step<12;step++){
      const data=await request('fi',{pageids:batch.map(a=>a.id).join('|'),prop:'pageprops|pageviews',pvipdays:'30',...continuation});
      for(const page of data.query?.pages||[])byId.set(page.pageid,{...byId.get(page.pageid),...page,pageviews:{...byId.get(page.pageid)?.pageviews,...page.pageviews}});
      continuation=data.continue;if(!continuation)break;
      if(step===11)throw Error('Readership continuation was not exhausted');
    }
    for(const candidate of batch){
      const page=byId.get(candidate.id),days=Object.entries(page?.pageviews||{}).filter(([,v])=>Number.isFinite(v));
      rankings.push({...candidate,qid:page?.pageprops?.wikibase_item||null,views:days.length?days.reduce((n,[,v])=>n+v,0):null,days:days.length,from:days.map(([d])=>d).sort()[0]||null,to:days.map(([d])=>d).sort().at(-1)||null});
    }
  }
  const valid=rankings.filter(r=>r.qid&&r.days>=28).sort((a,b)=>b.views-a.views||a.id-b.id);
  if(valid.length<count)throw Error('Too few articles with complete readership data');
  const selected=valid.slice(0,count);
  const articles=await mapLimit(selected,2,async candidate=>{
    const links=await sitelinksFor(candidate.qid);
    const editions=Object.fromEntries(await mapLimit(LANGUAGES,2,async lang=>{
      const title=links[`${lang}wiki`]?.title;
      if(!title)return [lang,{status:'missing',reason:'No Wikidata sitelink for this edition.'}];
      try{
        const metadata=await request(lang,{titles:title,redirects:'1',prop:'pageprops|revisions',rvprop:'ids|timestamp'});
        const page=metadata.query?.pages?.find(p=>!p.missing&&p.ns===0);
        if(page?.pageprops?.wikibase_item!==candidate.qid)throw Error('Wikidata identity mismatch');
        const revision=page.revisions?.[0];if(!revision?.revid)throw Error('No visible revision');
        const parsed=await request(lang,{action:'parse',oldid:String(revision.revid),section:'0',prop:'text',disableeditsection:'1',disabletoc:'1'});
        if(parsed.parse?.revid!==revision.revid)throw Error('Revision identity mismatch');
        const paragraphs=leadParagraphs(typeof parsed.parse.text==='string'?parsed.parse.text:parsed.parse.text?.['*']);
        if(!paragraphs.length)throw Error('No readable introduction');
        return [lang,{status:'available',title:page.title,pageId:page.pageid,qid:candidate.qid,revision:revision.revid,timestamp:revision.timestamp,url:`https://${lang}.wikipedia.org/w/index.php?oldid=${revision.revid}`,paragraphs}];
      }catch(error){return [lang,{status:'unavailable',reason:error.message}];}
    }));
    const result={id:candidate.id,title:candidate.title,qid:candidate.qid,readership:candidate,editions};
    return {...result,hash:hash(result)};
  });
  if(articles.every(a=>LANGUAGES.filter(l=>a.editions[l]?.status==='available').length<2))throw Error('No comparable language editions were captured');
  return {schemaVersion:1,generatedAt:new Date().toISOString(),atlasVersion:atlas.version,languages:LANGUAGES,selection:{policy:'Top eight by observed Finnish pageviews among the 30 most-revised articles in M; not a ranking of all Wikipedia or all M readership.',metric:'MediaWiki PageViewInfo, last 30 days; at least 28 reported days',candidates:rankings,selected:selected.map(a=>a.id)},articles};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const target='public/data/languages/capture.json';
  if(!process.argv.includes('--refresh')){try{await readFile(target);console.log('Using committed language capture');process.exit(0);}catch{}}
  const result=await captureLanguages();await mkdir('public/data/languages',{recursive:true});await writeFile(target,JSON.stringify(result,null,2));
  console.log(JSON.stringify({captured:result.articles.length,availableEditions:result.articles.reduce((n,a)=>n+LANGUAGES.filter(l=>a.editions[l]?.status==='available').length,0),generatedAt:result.generatedAt}));
}
