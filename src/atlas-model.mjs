/** Shared deterministic math for the pipeline and browser. No network or DOM. */
export function summarizeMonths(months,from='',to='9999-12'){
 const sums=Array(6).fill(0);for(const m of months)if(m[0]>=from&&m[0]<=to)for(let i=1;i<7;i++)sums[i-1]+=m[i];
 const [revisions,contentEdits,episodeCount,cleanup,maintenance,uncertain]=sums,rate=contentEdits?100*episodeCount/contentEdits:0;
 const score=revisions>=20&&contentEdits>=10?Math.round(Math.min(100,rate*20)):null;
 return {score,rate:Math.round(rate*100)/100,revisions,contentEdits,episodeCount,cleanup,maintenance,uncertain,band:score==null?'insufficient':episodeCount===0?'none':score<20?'low':score<60?'elevated':'high'};
}
export function monthRange(from,to){
 const result=[];let [y,m]=from.split('-').map(Number);const last=Number(to.slice(0,4))*12+Number(to.slice(5));
 if(!Number.isFinite(y)||!Number.isFinite(m)||m<1||m>12)return result;
 while(y*12+m<=last&&result.length<1200){result.push(`${y}-${String(m).padStart(2,'0')}`);if(++m>12){y++;m=1;}}return result;
}
export function windowStart(to,months){if(!months)return '';const [y,m]=to.split('-').map(Number),index=y*12+m-1-(months-1);return `${Math.floor(index/12)}-${String(index%12+1).padStart(2,'0')}`;}
export function atlasIndexes(articles){
 const byId=new Map(articles.map(a=>[a.id,a])),neighbours=new Map(articles.map(a=>[a.id,new Set()]));
 for(const a of articles)for(const id of a.links)if(byId.has(id)&&id!==a.id){neighbours.get(a.id).add(id);neighbours.get(id).add(a.id);}
 return {byId,neighbours};
}
export function eventHorizon(index,rootId,{limit=64,rings=1,rank=()=>0}={}){
 const cap=Math.max(1,Math.min(160,limit)),visible=new Set();if(!index.byId.has(rootId))return {ids:[],links:[],frontier:0};
 visible.add(rootId);let frontier=[rootId];
 for(let step=0;step<rings&&visible.size<cap;step++){
  const candidates=[...new Set(frontier.flatMap(id=>[...(index.neighbours.get(id)||[])]))].filter(id=>!visible.has(id)).sort((a,b)=>rank(b)-rank(a)||a-b);
  frontier=candidates.slice(0,cap-visible.size);for(const id of frontier)visible.add(id);
 }
 const beyond=new Set(),links=[];
 for(const id of visible){for(const target of index.neighbours.get(id)||[])if(!visible.has(target))beyond.add(target);for(const target of index.byId.get(id).links)if(visible.has(target)&&target!==id)links.push({source:String(id),target:String(target)});}
 return {ids:[...visible],links,frontier:beyond.size};
}
