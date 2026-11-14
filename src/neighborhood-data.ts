import type {Language} from './language-data';
export interface ConceptEvidence {title:string;paragraph:number;quote:string}
export interface NeighborhoodPair {a:Language;b:Language;score:number|null;reason?:string;conceptsA?:number;conceptsB?:number;sharedConcepts?:number;coverageA?:number;coverageB?:number;differences?:{qid:string;shareA:number;shareB:number;a:ConceptEvidence|null;b:ConceptEvidence|null}[];sources?:{a:string[];b:string[];shared:string[];overlap:number|null}}
export interface NeighborhoodEdition {status:string;reason?:string;title?:string;url?:string;revision?:number;timestamp?:string;paragraphs?:number;characters?:number;concepts?:number;identityCoverage?:number;lead?:string[];sections?:{title:string;anchor:string;level:string}[];references?:{url:string;domain:string}[]}
export interface NeighborhoodArticle {id:number;title:string;qid:string;depth:number;parent:number|null;hash:string;score:number|null;measuredPairs:number;pairs:NeighborhoodPair[];editions:Record<Language,NeighborhoodEdition>}
export type NeighborhoodSummary=Pick<NeighborhoodArticle,'id'|'title'|'qid'|'depth'|'parent'|'hash'|'score'|'measuredPairs'>;
export interface NeighborhoodData {schemaVersion:2;method:string;generatedAt:string;atlasVersion:string;formula:string;selection:{seed:string;count:number;policy:string};articles:NeighborhoodSummary[]}
export async function loadNeighborhood():Promise<NeighborhoodData>{
 const response=await fetch('/data/language-neighborhood/index.json');if(!response.ok||!response.headers.get('content-type')?.includes('json'))throw Error('The language snapshot is unavailable.');
 const data=await response.json();if(data.schemaVersion!==2||data.method!=='wikilens-language-coverage-v2'||data.articles?.length!==data.selection?.count)throw Error('Invalid language snapshot.');return data;
}
const details=new Map<number,Promise<NeighborhoodArticle>>();
export function loadNeighborhoodArticle(summary:NeighborhoodSummary){
 let result=details.get(summary.id);if(!result){result=fetch(`/data/language-neighborhood/details/${summary.id}.json`).then(async r=>{if(!r.ok||!r.headers.get('content-type')?.includes('json'))throw Error('Article comparison could not be loaded.');const d=await r.json();if(d.id!==summary.id||d.hash!==summary.hash||d.score!==summary.score)throw Error('Article comparison does not match the snapshot.');return d as NeighborhoodArticle;}).catch(e=>{details.delete(summary.id);throw e;});details.set(summary.id,result);}return result;
}
