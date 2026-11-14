/** Conservative passage-recurrence detector. Evidence labels are not judgments of truth. */
import {createHash} from 'node:crypto';
import {prepare, wikiLinks} from './score-v1.mjs';
export {wikiLinks} from './score-v1.mjs';
export const METHOD='wikilens-passages-v2.1';
const DAY=86400000;
const hash=s=>createHash('sha1').update(s).digest('hex').slice(0,16);
const cleanComment=s=>/vandal|roska(?:a|us)?|spam|testimuokkaus|test edit/i.test(s||'');
const botComment=s=>/^(?:r\S+\)\s*\()?\s*(?:botti|bot)\b|\b(?:bot adding|bot removing|bot updating)\b/i.test(s||'');
const obscene=/\b(?:huora\w*|paska\w*|vittu\w*|masturbo\w*|fuck\w*|nigger\w*|perse(?:e\w*|\b))\b/iu;
const normalize=s=>s.normalize('NFC').replace(/\s+/g,' ').trim();
export function plainText(raw){
 let s=raw.replace(/<!--[\s\S]*?-->/g,'').replace(/<ref\b[^>]*>[\s\S]*?<\/ref\s*>|<ref\b[^>]*\/\s*>/gi,'');
 for(let i=0;i<4;i++)s=s.replace(/\{\{[^{}]*\}\}/g,'');
 return normalize(s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g,'$2').replace(/\[\[([^\]]+)\]\]/g,'$1')
  .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g,'$1').replace(/https?:\/\/\S+/g,'').replace(/<[^>]+>/g,'').replace(/'{2,5}/g,'').replace(/&nbsp;|&#160;/g,' ').replace(/&ndash;|&mdash;/g,'–'));
}
export function passageUnits(text,cache=new Map()){
 if(typeof text!=='string')return null;
 const units=new Map();let section='Introduction';
 for(const line of text.replace(/<!--[\s\S]*?-->/g,'').split('\n')){
  const raw=line.trim();if(!raw)continue;
  const heading=raw.match(/^={2,}\s*(.*?)\s*={2,}$/);if(heading){section=plainText(heading[1]);continue;}
  if(/^(?:\{\{|\}\}|\[\[(?:Tiedosto|Kuva|File|Image|Luokka|Category|[a-z-]{2,12}):|!|<gallery|<\/gallery)/i.test(raw))continue;
  let field='',body=raw;
  if(raw.startsWith('|')){const m=raw.match(/^\|\s*(lopputulos|tyylilajit|päätyylilaji|taistelija\d*|tappiot\d*|vahvuus\d*)\s*=\s*(.*)$/i);if(!m)continue;field=m[1].toLowerCase();body=m[2];}
  else if(raw.startsWith('{')||raw.startsWith('}')||/^\*?\s*\[https?:/.test(raw))continue;
  let parsed=cache.get(body);
  if(!parsed){const text=plainText(body),lead=body.match(/^'''([^']+)'''/);parsed={text,leadName:lead?plainText(lead[1]):null,keys:new Map()};cache.set(body,parsed);}
  // Broken templates and inline category/file fragments are not reliable prose.
  if(/\{\{|\}\}|(?:Luokka|Category|Tiedosto|File):/i.test(parsed.text))continue;
  if(parsed.text.length<(field?8:40)||parsed.text.length>6000)continue;
  const key=parsed.keys.get(field)||hash(`${field}|${parsed.text}`);parsed.keys.set(field,key);
  units.set(key,{key,text:parsed.text,section,field,leadName:parsed.leadName});
 }
 return units;
}
const words=s=>new Set(s.toLocaleLowerCase('fi').match(/[\p{L}\p{N}]+/gu)||[]);
function similarity(a,b){let overlap=0;const A=words(a),B=words(b);for(const t of A)if(B.has(t))overlap++;return overlap/Math.max(1,Math.max(A.size,B.size));}
function changedWords(a,b){const A=words(a),B=words(b);return [...A].filter(t=>!B.has(t)).concat([...B].filter(t=>!A.has(t))).join(' ');}
function transitionKind(prev,row,removed,added){
 const a=prev.text?.length||0,b=row.text?.length||0;
 if(row.bot===true)return {category:'maintenance',reason:'Verified bot flag'};
 if(botComment(row.comment))return {category:'maintenance',reason:'Bot-declared edit summary (account flag unavailable)'};
 if(Math.max(a,b)>500&&Math.min(a,b)/Math.max(a,b)<.35)return {category:'cleanup',reason:'Bulk deletion/restoration; individual passage intent is unknown'};
 if(cleanComment(row.comment))return {category:'cleanup',reason:'Explicit cleanup summary; intent not independently verified'};
 if(!removed.length&&!added.length)return {category:'maintenance',reason:'Only markup, references, navigation, or untracked fields changed'};
 if(removed.length+added.length>40)return {category:'uncertain',reason:'Many passages changed together'};
 return {category:'content',reason:'Repeated changes to article content; candidate disagreement'};
}
function pairKind(base,other,context){
 if(context.category!=='content')return context;
 if(obscene.test(changedWords(base?.text||'',other?.text||'')))return {category:'cleanup',reason:'Explicit abuse introduced or removed in changed wording'};
 if(base?.leadName&&other?.leadName&&base.leadName!==other.leadName&&base.text.replace(base.leadName,'')===other.text.replace(other.leadName,''))return {category:'uncertain',reason:'Lead-name substitution; cannot distinguish correction from name vandalism'};
 if(base&&other&&base.text.replace(/\d+/g,'#')===other.text.replace(/\d+/g,'#'))return {category:'uncertain',reason:'Number-only reversal; correction, vandalism and factual dispute are indistinguishable'};
 if(!other)return {category:'uncertain',reason:'Passage insertion/deletion without a matched alternative; intent is ambiguous'};
 if(base?.text.length<40&&!base.field)return {category:'uncertain',reason:'Insufficient content context'};
 return context;
}
const priority={content:0,uncertain:1,maintenance:2,cleanup:3};
const strongest=(a,b)=>priority[a.category]>=priority[b.category]?a:b;
const dateMonth=t=>new Date(t).toISOString().slice(0,7);
/** Sparse monthly rows: month, revisions, content edits, content episodes, cleanup, maintenance, uncertain. */
export {summarizeMonths} from '../src/atlas-model.mjs';
import {summarizeMonths} from '../src/atlas-model.mjs';
export function scoreArticle(input,options={}){
 const {revisions,duplicates}=prepare(input);
 if(!revisions.length)return {method:METHOD,score:null,status:'no-data',revisions:0,episodes:[],months:[],links:[]};
 const cache=new Map(),deleted=new Map(),hashes=new Map(),groups=new Map(),months=new Map(),candidates=[];
 let previous=null,previousUnits=null,gaps=0,missingText=0,missingUsers=0,missingHashes=0,noops=0,exactReverts=0,selfReverts=0,segment=0;
 function month(t){const key=dateMonth(t);if(!months.has(key))months.set(key,[key,0,0,0,0,0,0]);return months.get(key);}
 for(let i=0;i<revisions.length;i++){
  const row=revisions[i],m=month(row.time);m[1]++;
  if(!row.user)missingUsers++;if(!row.sha1)missingHashes++;
  const units=passageUnits(row.text,cache);if(!units)missingText++;
  const gap=previous&&row.parent_id!==previous.rev_id;
  if(gap){gaps++;segment++;deleted.clear();hashes.clear();}
  const comparable=previous&&!gap&&units&&previousUnits;
  if(previous&&!gap&&row.sha1&&row.sha1===previous.sha1)noops++;
  const restored=row.sha1?hashes.get(row.sha1):null;
  const isRestore=previous&&!gap&&row.sha1!==previous.sha1&&restored&&i-restored.index<=100&&row.time-restored.time<=30*DAY;
  if(isRestore){exactReverts++;if(row.user===previous.user)selfReverts++;}
  if(comparable){
   const removed=[...previousUnits.values()].filter(u=>!units.has(u.key)),added=[...units.values()].filter(u=>!previousUnits.has(u.key));
   const context=transitionKind(previous,row,removed,added);
   if((removed.length||added.length)&&context.category!=='maintenance'&&context.category!=='cleanup')m[2]++;
   if(isRestore&&context.category!=='content')candidates.push({key:`exact:${segment}:${[row.sha1,previous.sha1].sort().join(':')}`,time:row.time,actor:row.user,target:previous.user,
     revision:row.rev_id,parent:previous.rev_id,removedRevision:previous.rev_id,section:'Whole revision',before:'',after:'',...context});
   for(const unit of added){
    const deletion=deleted.get(unit.key);
    if(deletion&&row.time-deletion.time<=30*DAY&&row.user&&deletion.actor&&row.user!==deletion.actor){
     const other=context.category==='content'&&deletion.context.category==='content'?removed.filter(u=>u.field===unit.field).map(u=>({u,s:similarity(unit.text,u.text)})).sort((a,b)=>b.s-a.s)[0]:null;
     const alternative=other&&other.s>=.45?other.u:deletion.alternative;
     const kind=pairKind(unit,alternative,strongest(context,deletion.context));
     candidates.push({key:`passage:${segment}:${[unit.key,alternative?.key||'absence'].sort().join(':')}`,time:row.time,actor:row.user,target:deletion.actor,revision:row.rev_id,parent:previous.rev_id,removedRevision:deletion.revision,
      section:unit.field?`Infobox · ${unit.field}`:unit.section,before:alternative?.text||'',after:unit.text,...kind});
    }
    deleted.delete(unit.key);
   }
   for(const unit of removed){
    const other=context.category==='content'?added.filter(u=>u.field===unit.field).map(u=>({u,s:similarity(unit.text,u.text)})).sort((a,b)=>b.s-a.s)[0]:null;
    deleted.set(unit.key,{time:row.time,actor:row.user,revision:row.rev_id,alternative:other&&other.s>=.45?other.u:null,context});
   }
   for(const [key,d] of deleted)if(row.time-d.time>30*DAY)deleted.delete(key);
  }else if(!units||!previousUnits)deleted.clear();
  if(row.sha1)hashes.set(row.sha1,{index:i,time:row.time});previous=row;previousUnits=units;
 }
 for(const e of candidates){if(!e.actor||!e.target||e.actor===e.target)continue;if(!groups.has(e.key))groups.set(e.key,[]);groups.get(e.key).push(e);}
 const chunks=[];
 for(const list of groups.values()){let chunk=[];for(const e of list){if(chunk.length&&e.time-chunk[0].time>30*DAY){chunks.push(chunk);chunk=[];}chunk.push(e);}if(chunk.length)chunks.push(chunk);}
 const qualifying=chunks.filter(c=>new Set(c.map(e=>e.revision)).size>=2&&new Set(c.flatMap(e=>[e.actor,e.target])).size>=2);
 const parent=qualifying.map((_,i)=>i),revisionOwner=new Map();const find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
 qualifying.forEach((chunk,i)=>{for(const e of chunk){if(revisionOwner.has(e.revision))parent[find(i)]=find(revisionOwner.get(e.revision));else revisionOwner.set(e.revision,i);}});
 const unions=new Map();qualifying.forEach((c,i)=>{const k=find(i);if(!unions.has(k))unions.set(k,[]);unions.get(k).push(...c);});
 const episodes=[];
 for(const list of unions.values()){
  const unique=[...new Map(list.map(e=>[e.revision,e])).values()].sort((a,b)=>a.time-b.time),kind=list.reduce((a,e)=>strongest(a,e),list[0]);
  const sample=list.filter(e=>e.after&&e.category===kind.category).sort((a,b)=>b.after.length-a.after.length)[0]||list.find(e=>e.category===kind.category)||list[0],first=unique[0],last=unique.at(-1),classifiedAt=unique[1].time;
  const episode={id:`${revisions[0].page_id}:${first.revision}`,category:kind.category,reason:kind.reason,section:sample.section,start:new Date(first.time).toISOString(),end:new Date(last.time).toISOString(),qualifiedAt:new Date(classifiedAt).toISOString(),
   reversals:unique.length,participants:new Set(list.flatMap(e=>[e.actor,e.target])).size,before:sample.before.slice(0,1600),after:sample.after.slice(0,1600),
   evidence:unique.slice(0,12).map(e=>({revision:e.revision,parent:e.parent,removedRevision:e.removedRevision,timestamp:new Date(e.time).toISOString()}))};
  month(classifiedAt)[{content:3,cleanup:4,maintenance:5,uncertain:6}[episode.category]]++;episodes.push(episode);
 }
 episodes.sort((a,b)=>b.start.localeCompare(a.start));
 const monthly=[...months.values()].sort((a,b)=>a[0].localeCompare(b[0])),summary=summarizeMonths(monthly);
 const coverage={parentGaps:gaps,missingText,missingUsers,missingHashes,duplicates,noops,startsAtCreation:revisions[0].parent_id===0,source:options.source||'unspecified'};
 const sufficient=missingText/revisions.length<=.1&&missingUsers/revisions.length<=.1&&gaps/Math.max(1,revisions.length-1)<=.1,latest=revisions.at(-1);
 return {method:METHOD,pageId:latest.page_id,title:latest.title,...summary,score:sufficient?summary.score:null,status:sufficient&&summary.score!==null?'measured':'insufficient-data',
  period:{from:revisions[0].timestamp,to:latest.timestamp},coverage,months:monthly,episodes,
  baseline:{exactReverts,selfReverts,exactRevertRate:revisions.length>1?100*exactReverts/(revisions.length-1):0},latestRevision:latest.rev_id,bytes:latest.bytes??Buffer.byteLength(latest.text||''),links:wikiLinks(latest.text),
  interpretation:'Candidate content-dispute episodes, not truth or a probability. Unreviewed heuristic labels; historical classifications use the full snapshot.'};
}
