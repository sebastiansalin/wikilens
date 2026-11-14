export type MonthRow=[string,number,number,number,number,number,number];
export interface Summary {score:number|null;rate:number;revisions:number;contentEdits:number;episodeCount:number;cleanup:number;maintenance:number;uncertain:number;band:string;}
export interface IndexedArticle {id:number;links:number[];}
export interface AtlasIndex<T extends IndexedArticle> {byId:Map<number,T>;neighbours:Map<number,Set<number>>;}
export function summarizeMonths(months:MonthRow[],from?:string,to?:string):Summary;
export function monthRange(from:string,to:string):string[];
export function windowStart(to:string,months:number):string;
export function atlasIndexes<T extends IndexedArticle>(articles:T[]):AtlasIndex<T>;
export function eventHorizon<T extends IndexedArticle>(index:AtlasIndex<T>,rootId:number,options?:{limit?:number;rings?:number;rank?:(id:number)=>number}):{ids:number[];links:{source:string;target:string}[];frontier:number};
