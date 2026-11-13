import type { Article, Comparison, GraphData, GraphNode, Language, SearchHit, Theme, Variant } from './types';
export interface WikiLensState {
 variant: Variant; theme: Theme; setTheme:(value:Theme)=>void;
 lang:Language; setLang:(value:Language)=>void;
 query:string; setQuery:(value:string)=>void; hits:SearchHit[]; searching:boolean;
 graph:GraphData|null; loading:boolean; error:string|null;
 selected:GraphNode|null; select:(node:GraphNode|null)=>void;
 explore:(title:string,lang?:Language)=>void; expand:(node:Article,baseGraph?:GraphData)=>void;
 expanding:boolean; reset:()=>void; history:Article[]; back:()=>void;
 comparison:Comparison|null; comparing:boolean; compareOpen:boolean;
 openCompare:()=>void; closeCompare:()=>void; compareLanguages:Language[];
 setCompareLanguages:(langs:Language[])=>void; runCompare:(topic?:Article)=>void;
 share:()=>void; toast:string|null; direction:'both'|'outgoing'|'incoming';
 setDirection:(value:'both'|'outgoing'|'incoming')=>void;
 aboutOpen:boolean; setAboutOpen:(value:boolean)=>void;
}
