export const languageNames={fi:'Finnish',en:'English',uk:'Ukrainian',ru:'Russian'};
export type Language=keyof typeof languageNames;
export type Relation='compatible'|'different-framing'|'conflicting-claim'|'not-comparable'|'uncertain';
export interface Comparison {a:Language;b:Language;relation:Relation;reason:string;claimId:string}
export interface LanguageClaim {id:string;title:string;statements:Partial<Record<Language,{quote:string;summary:string}>>}
export interface LanguagePair {a:Language;b:Language;score:number|null;comparable:number;framing:number;conflicts:number;uncompared:number;annotations:Comparison[]}
export interface LanguageArticle {
 id:number;title:string;score:number|null;status:string;measuredPairs:number;claims:LanguageClaim[];pairs:LanguagePair[];
 readership:{views:number;days:number;from:string;to:string};
 editions:Partial<Record<Language,{status:string;title:string;revision:number;timestamp:string;url:string;reason?:string}>>;
 assessment?:{summary:string;author:string;reviewStatus:string;scope:string};
}
export interface LanguageData {schemaVersion:number;method:string;generatedAt:string;atlasVersion:string;languages:Language[];articles:LanguageArticle[];selection:{policy:string;metric:string};formula:string}
export async function loadLanguages():Promise<LanguageData>{
 const response=await fetch('/data/languages/index.json');
 if(!response.ok)throw Error('Language comparisons are temporarily unavailable.');
 const data=await response.json();
 if(data.schemaVersion!==1||data.method!=='wikilens-language-claims-v1'||!Array.isArray(data.articles))throw Error('Unsupported language snapshot.');
 return data;
}
