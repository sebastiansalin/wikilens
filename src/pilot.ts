import type { Article, GraphData } from './types';
export interface ConflictEvidence {revision:number;parent:number;restored?:number;timestamp?:string;cleanup?:boolean;removedRevision?:number;}
export interface ConflictScore {
 method:string;score:number|null;status:string;pageId:number;title:string;revisions:number;comparableTransitions:number;
 period:{from:string;to:string};disputedRevisions:number;participants:number;activeDays:number;
 baseline:{exactReverts:number;selfReverts:number;exactRevertRate:number|null};components:Record<string,number>;
 coverage:{parentGaps:number;missingHashes:number;missingUsers:number;missingText:number;startsAtCreation:boolean;source:string};
 evidence:ConflictEvidence[];passages:{text:string;returns:number;evidence:ConflictEvidence[]}[];
 timeline:{year:string;revisions:number;disputedRevisions:number}[];links:string[];latestRevision:number;
}
export interface ConflictPilot {method:string;dataset:string;generatedAt:string;selection:string;source:string;revisionCount:number;graphScope:string;articles:ConflictScore[];edges:{source:string;target:string}[];}
let cached:Promise<ConflictPilot|null>|undefined;
export function loadPilot():Promise<ConflictPilot|null> {
 return cached??=fetch('/data/conflict-pilot.json').then(async response=>{
  if(response.status===404)return null;
  if(!response.ok)throw new Error('The conflict dataset could not be loaded.');
  if(!response.headers.get('content-type')?.includes('json'))return null; // Vite SPA fallback when no export exists.
  const data=await response.json();
  if(data.schemaVersion!==1||data.articles?.length!==20||data.dataMode!=='m-snapshot')throw new Error('The conflict dataset is invalid.');
  return data;
 });
}
export function conflictColor(score:number|null|undefined) {
 if(score==null)return '#89949d';
 const stops=[[87,171,213],[239,188,97],[218,83,94]],t=Math.max(0,Math.min(100,score))/50,index=Math.min(1,Math.floor(t)),f=t-index;
 return `rgb(${stops[index].map((v,i)=>Math.round(v+(stops[index+1][i]-v)*f)).join(',')})`;
}
export function pilotArticle(a:ConflictScore):Article {
 return {id:`fi:${a.pageId}`,title:a.title,lang:'fi',qid:null,description:'Finnish Wikipedia · M history snapshot',extract:'',
 url:`https://fi.wikipedia.org/?curid=${a.pageId}`,length:0,pageviews:null,conflict:a};
}
export function pilotGraph(pilot:ConflictPilot,title:string):GraphData {
 const selected=pilot.articles.find(a=>a.title.toLocaleLowerCase('fi')===title.toLocaleLowerCase('fi'));
 if(!selected)throw new Error('This article is outside the 20-page pilot. Switch to live Wikipedia to explore it.');
 const root=pilotArticle(selected);
 return {root,nodes:pilot.articles.map(a=>({...pilotArticle(a),root:a.pageId===selected.pageId})),links:pilot.edges,
 stats:{outgoing:selected.links.length,incoming:pilot.edges.filter(e=>e.target===root.id).length,incomingAvailable:true,outgoingComplete:true,incomingComplete:false,mapped:pilot.articles.length},
 fetchedAt:pilot.generatedAt,source:'m-snapshot',notices:[pilot.graphScope,pilot.selection]};
}
