/** Extractive summaries of captured evidence, never an inferred account of editor intent. */
export function compareWording(first = '', second = '', limit = 180) {
 const a=first.trim().split(/\s+/).filter(Boolean),b=second.trim().split(/\s+/).filter(Boolean);
 let start=0,end=0;
 while(start<a.length&&start<b.length&&a[start]===b[start])start++;
 while(end<a.length-start&&end<b.length-start&&a[a.length-1-end]===b[b.length-1-end])end++;
 const clip=words=>{const text=words.join(' ');return text.length>limit?text.slice(0,limit).trimEnd()+'…':text;};
 return {same:start===a.length&&start===b.length,context:a.slice(Math.max(0,start-6),start).join(' '),first:clip(a.slice(start,a.length-end)),second:clip(b.slice(start,b.length-end))};
}
export function summarizeChanges(months,episodes,from='',to='9999-12') {
 const rows=months.filter(m=>m[0]>=from&&m[0]<=to);
 const edits=rows.reduce((n,m)=>n+m[1],0);
 const peak=rows.reduce((best,m)=>!best||m[1]>best[1]?m:best,null);
 const visible=episodes.filter(e=>e.qualifiedAt.slice(0,7)>=from&&e.qualifiedAt.slice(0,7)<=to).sort((a,b)=>b.qualifiedAt.localeCompare(a.qualifiedAt)||a.id.localeCompare(b.id));
 const content=visible.filter(e=>e.category==='content'),sections=new Map();
 for(const e of content)sections.set(e.section,(sections.get(e.section)||0)+1);
 const topics=[...sections].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
 return {edits,peak:peak&&peak[1]>0?{month:peak[0],edits:peak[1]}:null,contentCount:content.length,otherCount:visible.length-content.length,topics,latest:content[0]||null,highlights:content.slice(0,3)};
}
