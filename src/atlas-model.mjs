/** Shared deterministic math for the pipeline and browser. No network or DOM. */
export const INDEX_METHOD='wikilens-index-v2.2';
function summarizeTotals(sums){
 const [revisions,contentEdits,episodeCount,cleanup,maintenance,uncertain]=sums,rate=contentEdits?100*episodeCount/contentEdits:0;
 // Twenty zero-episode edits shrink noisy small samples. A smooth saturation
 // replaces the old hard ceiling; 100 is approached, never clipped to.
 const score=revisions>=20&&contentEdits>=10?Math.round(1000*episodeCount/(episodeCount+.01*(contentEdits+20)))/10:null;
 return {score,rate:Math.round(rate*100)/100,revisions,contentEdits,episodeCount,cleanup,maintenance,uncertain,band:score==null?'insufficient':episodeCount===0?'none':score<20?'low':score<60?'elevated':'high'};
}
export function summarizeMonths(months,from='',to='9999-12'){
 const sums=Array(6).fill(0);for(const m of months)if(m[0]>=from&&m[0]<=to)for(let i=1;i<7;i++)sums[i-1]+=m[i];
 return summarizeTotals(sums);
}
export function indexMonths(months){
 const rows=[...months].sort((a,b)=>a[0].localeCompare(b[0])),keys=rows.map(m=>m[0]),prefix=new Float64Array((rows.length+1)*6);
 for(let i=0;i<rows.length;i++)for(let j=0;j<6;j++)prefix[(i+1)*6+j]=prefix[i*6+j]+rows[i][j+1];
 return {keys,prefix};
}
function monthBound(keys,value,inclusive){
 let lo=0,hi=keys.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(keys[mid]<value||(inclusive&&keys[mid]===value))lo=mid+1;else hi=mid;}
 return lo*6;
}
export function summarizeIndexed(index,from='',to='9999-12'){
 if(from>to)return summarizeTotals([0,0,0,0,0,0]);
 const start=monthBound(index.keys,from,false),end=monthBound(index.keys,to,true),p=index.prefix;
 return summarizeTotals([p[end]-p[start],p[end+1]-p[start+1],p[end+2]-p[start+2],p[end+3]-p[start+3],p[end+4]-p[start+4],p[end+5]-p[start+5]]);
}
export function meetsMinimumScore(score,minimum){return minimum<=0||(score!=null&&score>=minimum);}
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
