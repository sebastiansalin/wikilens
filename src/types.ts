import type { ConflictScore } from './pilot';
export type Language = 'en'|'fi'|'ru'|'uk'|'de'|'fr'|'es'|'ja';
export type Theme = 'paper'|'ink'|'galaxy';
export type Variant = 'atlas'|'prism'|'cosmos';
export interface Article { conflict?: ConflictScore; id: string; title: string; lang: Language; qid: string|null; description: string; extract: string; url: string; thumbnail?: string; length: number; touched?: string; pageviews?: number|null; pageviewDays?: number; pageviewStart?: string|null; pageviewEnd?: string|null; }
export interface GraphNode extends Article { group?: number; root?: boolean; direction?: 'incoming'|'outgoing'|'both'; hopDistance?:number|null; affinity?:number; degree?:number; }
export interface GraphLink { source: string; target: string; }
export interface GraphData { root: Article; nodes: GraphNode[]; links: GraphLink[]; stats: { outgoing: number; incoming: number; incomingAvailable?: boolean; outgoingComplete: boolean; incomingComplete: boolean; mapped: number; }; fetchedAt: string; source: 'mariadb'|'wikipedia'|'m-snapshot'; notices?: string[]; }
export interface CompareEdition { lang: Language; article: Article|null; graph: GraphData|null; error?: string; }
export interface Comparison { editions: CompareEdition[]; pairs: { a: Language; b: Language; score: number|null; shared: number; union: number; uniqueA: number; uniqueB: number; complete: boolean; }[]; sharedConcepts: {qid:string;title:string;languages:Language[]}[]; method: string; }
export interface SearchHit { title: string; description: string; pageid: number; }
export const LANGUAGES: {code:Language;name:string;native:string}[] = [{code:'en',name:'English',native:'English'},{code:'fi',name:'Finnish',native:'Suomi'},{code:'ru',name:'Russian',native:'Русский'},{code:'uk',name:'Ukrainian',native:'Українська'},{code:'de',name:'German',native:'Deutsch'},{code:'fr',name:'French',native:'Français'},{code:'es',name:'Spanish',native:'Español'},{code:'ja',name:'Japanese',native:'日本語'}];
