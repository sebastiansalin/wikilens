export type Language='fi'|'en'|'uk'|'ru';
export const languageNames:Record<Language,string>={fi:'Finnish',en:'English',uk:'Ukrainian',ru:'Russian'};
export const languageOrder:Language[]=['fi','en','uk','ru'];
export interface ConceptEvidence {title:string;paragraph:number;quote:string}
export interface LanguagePair {a:Language;b:Language;score:number|null;reason?:string;conceptsA?:number;conceptsB?:number;sharedConcepts?:number;coverageA?:number;coverageB?:number;differences?:{qid:string;shareA:number;shareB:number;a:ConceptEvidence|null;b:ConceptEvidence|null}[]}
export interface LanguageEdition {status:string;reason?:string;title?:string;url?:string;revision?:number;timestamp?:string;paragraphs?:number;concepts?:number;identityCoverage?:number}
export interface LanguageSummary {id:number;title:string;hash:string;rank:number;editingScore:number;measuredPairs:number}
export interface LanguageArticle {id:number;title:string;hash:string;measuredPairs:number;pairs:LanguagePair[];editions:Record<Language,LanguageEdition>}
export interface LanguageData {schemaVersion:2;method:string;generatedAt:string;atlasVersion:string;selection:{count:number;policy:string;through:string};articles:LanguageSummary[]}
async function json(path:string){const r=await fetch(path);if(!r.ok||!r.headers.get('content-type')?.includes('json'))throw Error('The language snapshot could not be loaded. Please try again.');return r.json();}
export async function loadLanguageDifferences():Promise<LanguageData>{
 const d=await json('/data/language-differences/index.json');
 if(d.schemaVersion!==2||d.method!=='wikilens-language-coverage-v2'||d.articles?.length!==d.selection?.count)throw Error('Invalid language snapshot.');return d;
}
const cache=new Map<string,Promise<LanguageArticle>>();
export function loadLanguageArticle(s:LanguageSummary):Promise<LanguageArticle>{
 const key=`${s.id}:${s.hash}`;let request=cache.get(key);
 if(!request){request=json(`/data/language-differences/details/${s.id}.json`).then(d=>{if(d.id!==s.id||d.hash!==s.hash||d.pairs?.length!==6)throw Error('Article evidence does not match the snapshot.');return d as LanguageArticle;}).catch(e=>{cache.delete(key);throw e;});cache.set(key,request);}return request;
}
