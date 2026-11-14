import type {MonthRow} from './atlas-model.mjs';
export interface AtlasArticle {id:number;title:string;from:string;to:string;eligible:boolean;bytes:number;latestRevision:number;months:MonthRow[];links:number[];}
export interface AtlasData {schemaVersion:2;method:string;version:string;generatedAt:string;dataset:string;engine:string;snapshot:string;articleCount:number;revisionCount:number;edgeCount:number;detailPath:string;reviewCases:number;articles:AtlasArticle[];}
export interface Evidence {revision:number;parent:number;timestamp:string;removedRevision?:number;}
export type Category='content'|'cleanup'|'maintenance'|'uncertain';
export interface Episode {id:string;category:Category;reason:string;section:string;start:string;end:string;qualifiedAt:string;reversals:number;participants:number;before:string;after:string;evidence:Evidence[];}
export interface Detail {pageId:number;title:string;coverage:{parentGaps:number;missingText:number;missingUsers:number;startsAtCreation:boolean};baseline:{exactReverts:number;exactRevertRate:number};episodes:Episode[];}
let atlasPromise:Promise<AtlasData>|undefined;
export function loadAtlas(){return atlasPromise??=fetch('/data/atlas/index.json').then(async r=>{if(!r.ok||!r.headers.get('content-type')?.includes('json'))throw Error('The verified atlas is unavailable. Please reload in a moment.');const data=await r.json();if(data.schemaVersion!==2||data.articleCount!==data.articles?.length||!data.databaseReadbackVerified)throw Error('Atlas provenance check failed.');return data as AtlasData;}).catch(e=>{atlasPromise=undefined;throw e;});}
const parts=new Map<string,Promise<Record<string,Detail>>>();
export async function loadDetail(data:AtlasData,id:number){const url=`${data.detailPath}/${id%64}.json`;let promise=parts.get(url);if(!promise){promise=fetch(url).then(r=>{if(!r.ok)throw Error('Evidence could not be loaded.');return r.json();}).catch(e=>{parts.delete(url);throw e;});parts.set(url,promise);}const detail=(await promise)[id];if(!detail)throw Error('Article evidence is missing.');return detail;}
export const diffUrl=(e:Evidence)=>`https://fi.wikipedia.org/w/index.php?diff=${e.revision}&oldid=${e.parent}`;
