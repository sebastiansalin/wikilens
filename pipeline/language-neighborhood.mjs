/** Deterministic, language-independent comparison of linked concepts in article prose. */
import {createHash} from 'node:crypto';
import {atlasIndexes} from '../src/atlas-model.mjs';
import {LANGUAGES,PAIRS,leadParagraphs} from './language-model.mjs';
export const METHOD='wikilens-language-coverage-v2';
export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function selectNeighborhood(articles,seed='Talvisota',count=100){
 const index=atlasIndexes(articles),root=articles.find(a=>a.title===seed);
 if(!root)throw Error('Seed is outside the M dataset');
 const seen=new Set([root.id]),result=[{id:root.id,title:root.title,depth:0,parent:null}];let frontier=[root.id];
 for(let depth=1;frontier.length&&result.length<count;depth++){
  const parents=new Map();for(const id of frontier)for(const next of index.neighbours.get(id)||[])if(!seen.has(next)&&!parents.has(next))parents.set(next,id);
  const next=[...parents.keys()].sort((a,b)=>(index.neighbours.get(b)?.size||0)-(index.neighbours.get(a)?.size||0)||a-b);
  frontier=[];for(const id of next){if(result.length>=count)break;seen.add(id);frontier.push(id);result.push({id,title:index.byId.get(id).title,depth,parent:parents.get(id)});}
 }
 if(result.length!==count)throw Error('Seed component is too small');return result;
}
const decode=s=>String(s).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
export function extractProse(html){
 let clean=String(html||'').replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
 for(let i=0;i<30;i++){const next=clean.replace(/<table\b[^>]*>(?:(?!<table\b)[\s\S])*?<\/table>/gi,'');if(next===clean)break;clean=next;}
 clean=clean.replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi,'');
 const paragraphs=[];
 for(const match of clean.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)){
  const text=leadParagraphs(match[0])[0];if(!text)continue;const titles=[];
  for(const link of match[0].matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/gi)){
   const href=decode(link[1]);if(!href.startsWith('/wiki/')&&!href.startsWith('./'))continue;
   let title;try{title=decodeURIComponent(href.replace(/^(\/wiki\/|\.\/)/,'').split('#')[0]).replaceAll('_',' ');}catch{continue;}
   if(title&&!title.includes(':')&&!title.includes('?'))titles.push(title);
  }
  paragraphs.push({text,links:[...new Set(titles)]});
 }
 // Citation-list URLs only. Domain overlap is descriptive, separate from the concept score.
 const references=[];
 for(const item of String(html||'').matchAll(/<li\b[^>]*id="cite_note[^\"]*"[^>]*>([\s\S]*?)<\/li>/gi))for(const link of item[1].matchAll(/href="(https?:[^\"]+)"/gi)){
  try{const url=new URL(decode(link[1]));if(!/(^|\.)(wikipedia\.org|wikimedia\.org|wikidata\.org)$/.test(url.hostname))references.push({url:url.href,domain:url.hostname.replace(/^www\./,'')});}catch{}
 }
 return {paragraphs,references:[...new Map(references.map(r=>[r.url,r])).values()]};
}
export function conceptWeights(edition,excludedQid){
 const weights=new Map(),evidence=new Map();
 for(let i=0;i<edition.paragraphs.length;i++){
  const p=edition.paragraphs[i],qids=[...new Set(p.links.map(title=>edition.identities[title]?.qid).filter(q=>q&&q!==excludedQid))];
  // First three prose paragraphs receive twice the weight. Count once per paragraph.
  for(const qid of qids){weights.set(qid,(weights.get(qid)||0)+(i<3?2:1));if(!evidence.has(qid)){const title=p.links.find(t=>edition.identities[t]?.qid===qid);evidence.set(qid,{title,paragraph:i,quote:p.text});}}
 }
 return {weights,evidence};
}
export function jsDistance(a,b){
 const totalA=[...a.values()].reduce((s,n)=>s+n,0),totalB=[...b.values()].reduce((s,n)=>s+n,0);if(!totalA||!totalB)return null;
 let js=0;for(const key of new Set([...a.keys(),...b.keys()])){const p=(a.get(key)||0)/totalA,q=(b.get(key)||0)/totalB,m=(p+q)/2;if(p)js+=.5*p*Math.log2(p/m);if(q)js+=.5*q*Math.log2(q/m);}
 return Math.round(1000*Math.sqrt(Math.max(0,Math.min(1,js))))/10;
}
export function compareNeighborhoodArticle(article){
 const profiles=Object.fromEntries(LANGUAGES.map(lang=>{const e=article.editions[lang];if(e?.status!=='available')return [lang,null];const titles=[...new Set(e.paragraphs.flatMap(p=>p.links))],resolved=titles.filter(t=>e.identities[t]?.qid).length;return [lang,{...conceptWeights(e,article.qid),resolved,total:titles.length,coverage:titles.length?resolved/titles.length:0}];}));
 const pairs=PAIRS.map(([a,b])=>{
  const x=profiles[a],y=profiles[b],eligible=x&&y&&x.weights.size>=5&&y.weights.size>=5&&x.coverage>=.6&&y.coverage>=.6;
  if(!eligible)return {a,b,score:null,reason:'Needs two available editions, at least five resolved concepts each and 60% link identity coverage.'};
  const tx=[...x.weights.values()].reduce((s,n)=>s+n,0),ty=[...y.weights.values()].reduce((s,n)=>s+n,0);
  const differences=[...new Set([...x.weights.keys(),...y.weights.keys()])].map(qid=>({qid,shareA:(x.weights.get(qid)||0)/tx,shareB:(y.weights.get(qid)||0)/ty,a:x.evidence.get(qid)||null,b:y.evidence.get(qid)||null})).sort((u,v)=>Math.abs(v.shareA-v.shareB)-Math.abs(u.shareA-u.shareB)||u.qid.localeCompare(v.qid)).slice(0,12);
  const sa=new Set(article.editions[a].references.map(r=>r.domain)),sb=new Set(article.editions[b].references.map(r=>r.domain)),shared=[...sa].filter(d=>sb.has(d));
  return {a,b,score:jsDistance(x.weights,y.weights),conceptsA:x.weights.size,conceptsB:y.weights.size,sharedConcepts:[...x.weights.keys()].filter(q=>y.weights.has(q)).length,coverageA:x.coverage,coverageB:y.coverage,differences,sources:{a:[...sa],b:[...sb],shared,overlap:sa.size&&sb.size?Math.round(100*shared.length/new Set([...sa,...sb]).size):null}};
 });
 const measured=pairs.filter(p=>p.score!==null),score=measured.length>=3?Math.round(10*measured.reduce((s,p)=>s+p.score,0)/measured.length)/10:null;
 return {id:article.id,title:article.title,qid:article.qid,depth:article.depth,parent:article.parent,hash:article.hash,score,measuredPairs:measured.length,pairs,editions:Object.fromEntries(LANGUAGES.map(l=>{const e=article.editions[l],p=profiles[l];return [l,e?.status==='available'?{status:e.status,title:e.title,url:e.url,revision:e.revision,timestamp:e.timestamp,paragraphs:e.paragraphs.length,characters:e.paragraphs.reduce((n,p)=>n+p.text.length,0),concepts:p.weights.size,identityCoverage:p.coverage,lead:e.paragraphs.slice(0,3).map(p=>p.text),sections:e.sections,references:e.references}:e];}))};
}
