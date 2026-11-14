import { useCallback, useEffect, useRef, useState } from 'react';
import type { Article, Comparison, GraphData, GraphNode, Language, SearchHit, Theme, Variant } from './types';
import { LANGUAGES } from './types';
import type { WikiLensState } from './workspace';
import { loadPilot, pilotArticle, pilotGraph } from './pilot';

const allowed = new Set(LANGUAGES.map(l=>l.code));
function parseInput(input:string, lang:Language): {title:string,lang:Language} {
  if (/^https?:\/\//i.test(input.trim())) {
    const url=new URL(input.trim()); const match=url.hostname.match(/^([a-z-]+)\.(?:m\.)?wikipedia\.org$/);
    if(!match || !allowed.has(match[1] as Language)) throw new Error('Use a Wikipedia link in one of the supported languages.');
    const title=url.pathname.startsWith('/wiki/') ? decodeURIComponent(url.pathname.slice(6)) : url.searchParams.get('title');
    if(!title) throw new Error('That link does not point to a Wikipedia article.');
    return {title:title.replaceAll('_',' '),lang:match[1] as Language};
  }
  if(!input.trim()) throw new Error('Enter a topic or Wikipedia link.');
  return {title:input.trim(),lang};
}
export async function request<T>(url:string, signal?:AbortSignal):Promise<T> {
  if(new URLSearchParams(location.search).get('mode')==='conflict') {
    const parsed=new URL(url,location.origin),path=parsed.pathname.split('/').pop();
    if(['graph','article','search'].includes(path||'')) {
      const pilot=await loadPilot();
      if(signal?.aborted)throw new DOMException('Aborted','AbortError');
      if(!pilot)throw new Error('The verified M pilot has not been calculated yet.');
      if(parsed.searchParams.get('lang')!=='fi')throw new Error('The M pilot contains Finnish articles. Switch to live Wikipedia for another language.');
      const title=parsed.searchParams.get('title')||'';
      if(path==='graph')return pilotGraph(pilot,title) as T;
      if(path==='article'){const a=pilot.articles.find(a=>a.title===title);if(!a)throw new Error('Article is outside this pilot.');return {article:pilotArticle(a)} as T;}
      const q=(parsed.searchParams.get('q')||'').toLocaleLowerCase('fi');
      return {results:pilot.articles.filter(a=>a.title.toLocaleLowerCase('fi').includes(q)).map(a=>({title:a.title,pageid:a.pageId,description:'M history pilot'}))} as T;
    }
  }
  if (import.meta.env.VITE_DATA_MODE === 'browser') {
    const { dispatchUrl } = await import('./browser-api.mjs');
    const data = await dispatchUrl(url);
    if(signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return data;
  }
  const response=await fetch(url,{signal});
  const data=await response.json().catch(()=>({error:'The server returned an unreadable response.'}));
  if(!response.ok || data.error) throw new Error(data.error || 'Wikipedia is taking a little longer. Please try again.');
  return data;
}
export default function useWikiLens(variant:Variant):WikiLensState {
  const params=new URLSearchParams(location.search);
  const [theme,setTheme]=useState<Theme>(()=>{try {const t=params.get('theme')||localStorage.getItem('wikilens-theme');return ['paper','ink','galaxy'].includes(t||'')?t as Theme:'galaxy';}catch{return 'paper';}});
  const [lang,setLangState]=useState<Language>(allowed.has(params.get('lang') as Language)?params.get('lang') as Language:'en');
  const [query,setQuery]=useState(params.get('title')||''); const [hits,setHits]=useState<SearchHit[]>([]); const [searching,setSearching]=useState(false);
  const [graph,setGraph]=useState<GraphData|null>(null); const [loading,setLoading]=useState(false); const [error,setError]=useState<string|null>(null);
  const [selected,setSelected]=useState<GraphNode|null>(null); const [history,setHistory]=useState<Article[]>([]); const [expanding,setExpanding]=useState(false);
  const previousMaps=useRef<GraphData[]>([]);
  const selectionController=useRef<AbortController|null>(null);
  const select=useCallback((node:GraphNode|null)=>{selectionController.current?.abort();setSelected(node);if(!node||node.extract)return;const controller=new AbortController();selectionController.current=controller;request<{article:Article}>(`/api/article?title=${encodeURIComponent(node.title)}&lang=${node.lang}`,controller.signal).then(({article})=>{if(!controller.signal.aborted)setSelected(current=>current?.id===node.id?{...current,...article}:current)}).catch(()=>{});},[]);
  const [comparison,setComparison]=useState<Comparison|null>(null); const [comparing,setComparing]=useState(false); const [compareOpen,setCompareOpen]=useState(false);
  const [compareLanguages,setCompareLanguagesState]=useState<Language[]>(['en','ru','uk']); const [direction,setDirection]=useState<'both'|'outgoing'|'incoming'>('both');
  const [toast,setToast]=useState<string|null>(null); const [aboutOpen,setAboutOpen]=useState(false);
  const exploreController=useRef<AbortController|null>(null); const compareController=useRef<AbortController|null>(null); const expansionController=useRef<AbortController|null>(null);
  const generation=useRef(0); const compareGeneration=useRef(0); const graphRef=useRef(graph); graphRef.current=graph;
  useEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('wikilens-theme',theme);}catch{}},[theme,variant]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),3500);return()=>clearTimeout(t)},[toast]);
  useEffect(()=>{
    const controller=new AbortController();
    if(query.trim().length<2 || /^https?:/.test(query)){setHits([]);setSearching(false);return;}
    const timer=setTimeout(()=>{setSearching(true);request<{results:SearchHit[]}>(`/api/search?q=${encodeURIComponent(query)}&lang=${lang}`,controller.signal).then(d=>setHits(d.results)).catch(()=>setHits([])).finally(()=>{if(!controller.signal.aborted)setSearching(false)});},280);
    return()=>{clearTimeout(timer);controller.abort()};
  },[query,lang]);
  const explore=useCallback((input:string,nextLang?:Language)=>{
    let parsed;try{parsed=parseInput(input,nextLang||lang)}catch(e){setError((e as Error).message);return;}
    exploreController.current?.abort();compareController.current?.abort();expansionController.current?.abort();
    generation.current++;compareGeneration.current++; const id=generation.current;const controller=new AbortController();exploreController.current=controller;
    setLoading(true);setError(null);select(null);setComparison(null);setComparing(false);setExpanding(false);setHits([]);setLangState(parsed.lang);setQuery(parsed.title);
    request<GraphData>(`/api/graph?title=${encodeURIComponent(parsed.title)}&lang=${parsed.lang}&direction=both`,controller.signal).then(data=>{
      if(id!==generation.current)return;
      const previous=graphRef.current;
      if(previous && previous.root.id!==data.root.id)previousMaps.current=[...previousMaps.current,previous].slice(-11);
      graphRef.current=data;setGraph(data);setQuery(data.root.title);setHistory([...previousMaps.current.map(map=>map.root),data.root]);
      const url=new URL(location.href);if(data.source==='m-snapshot')url.searchParams.set('mode','conflict');else url.searchParams.set('mode','live');url.searchParams.set('title',data.root.title);url.searchParams.set('lang',data.root.lang);url.searchParams.set('view',variant);window.history.replaceState({},'',url);
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(id===generation.current)setLoading(false)});
  },[lang,variant]);
  useEffect(()=>{let active=true;const params=new URLSearchParams(location.search);if(params.get('mode')==='live'&&!params.get('title'))explore('Talvisota','fi');else if(params.get('title'))explore(params.get('title')!,params.get('mode')==='conflict'?'fi':undefined);else loadPilot().then(pilot=>{if(!active)return;if(pilot){const url=new URL(location.href);url.searchParams.set('mode','conflict');window.history.replaceState({},'',url);explore(pilot.articles[0].title,'fi');}else explore('Apple');}).catch(()=>{if(active)explore('Apple');});return()=>{active=false;exploreController.current?.abort();compareController.current?.abort();expansionController.current?.abort()};},[]);
  const setLang=(next:Language)=>{setLangState(next);if(graph)explore(graph.root.qid||graph.root.title,next);};
  const expand=async(node:Article,baseGraph?:GraphData)=>{
    if(baseGraph&&baseGraph!==graphRef.current){const previous=graphRef.current;if(previous&&previous.root.id!==baseGraph.root.id)previousMaps.current=[...previousMaps.current,previous].slice(-11);graphRef.current=baseGraph;setGraph(baseGraph);setQuery(baseGraph.root.title);setLangState(baseGraph.root.lang);setHistory([...previousMaps.current.map(map=>map.root),baseGraph.root]);const url=new URL(location.href);url.searchParams.set('title',baseGraph.root.title);url.searchParams.set('lang',baseGraph.root.lang);window.history.replaceState({},'',url);}
    if(expanding)return;if((graphRef.current?.nodes.length||0)>=160){setToast('This map has reached 160 articles. Explore a node to start a fresh map.');return;}
    const id=generation.current; const controller=new AbortController();expansionController.current=controller;setExpanding(true);setError(null);
    try{const data=await request<GraphData>(`/api/graph?title=${encodeURIComponent(node.title)}&lang=${node.lang}&direction=both`,controller.signal);
      if(id!==generation.current)return;
      setGraph(previous=>{if(!previous)return data;const map=new Map(previous.nodes.map(n=>[n.id,n]));data.nodes.forEach(n=>{if(!map.has(n.id)&&map.size<160)map.set(n.id,{...n,root:false});});const edges=new Map(previous.links.map(e=>[`${e.source}|${e.target}`,e]));data.links.forEach(e=>{if(map.has(e.source)&&map.has(e.target))edges.set(`${e.source}|${e.target}`,e)});return {...previous,nodes:[...map.values()],links:[...edges.values()],notices:[...(previous.notices||[]),'Expanded neighbourhoods are sampled; root statistics remain unchanged.']};});
      setToast(`Added connections around ${node.title}`);
    }catch(e){if(!controller.signal.aborted)setError((e as Error).message)}finally{if(id===generation.current)setExpanding(false)}
  };
  const runCompare=useCallback(async(topic?:Article)=>{
    const root=topic||graphRef.current?.root;if(!root)return;
    compareController.current?.abort(); const controller=new AbortController();compareController.current=controller; const id=++compareGeneration.current;
    setComparing(true);setError(null);
    try{const data=await request<Comparison>(`/api/compare?title=${encodeURIComponent(root.title)}&lang=${root.lang}&languages=${compareLanguages.join(',')}`,controller.signal);if(id===compareGeneration.current)setComparison(data)}
    catch(e){if(!controller.signal.aborted)setError((e as Error).message)}finally{if(id===compareGeneration.current)setComparing(false)}
  },[compareLanguages]);
  const setCompareLanguages=(langs:Language[])=>{compareController.current?.abort();compareGeneration.current++;setComparing(false);setComparison(null);setCompareLanguagesState(langs.slice(0,3));};
  const openCompare=()=>{setCompareOpen(true);if(!comparison&&!comparing)void runCompare()};
  const stopRequests=()=>{exploreController.current?.abort();compareController.current?.abort();expansionController.current?.abort();generation.current++;compareGeneration.current++;select(null);setLoading(false);setComparing(false);setExpanding(false);setError(null);setComparison(null);setCompareOpen(false);setHits([]);setToast(null);};
  const reset=()=>{stopRequests();previousMaps.current=[];graphRef.current=null;setGraph(null);setHistory([]);setQuery('');setDirection('both');window.history.replaceState({},'',`?view=${variant}`)};
  const back=()=>{
    // Cancel a pending navigation first; completed maps are restored without refetching.
    const target=loading&&graphRef.current?graphRef.current:previousMaps.current.pop();
    if(!target){reset();return;}
    stopRequests();graphRef.current=target;setGraph(target);setQuery(target.root.title);setLangState(target.root.lang);setDirection('both');setHistory([...previousMaps.current.map(map=>map.root),target.root]);
    const url=new URL(location.href);if(target.source==='m-snapshot')url.searchParams.set('mode','conflict');else url.searchParams.delete('mode');url.searchParams.set('title',target.root.title);url.searchParams.set('lang',target.root.lang);url.searchParams.set('view',variant);window.history.replaceState({},'',url);
  };
  const share=async()=>{const url=new URL(location.href);url.searchParams.set('theme',theme);try{await navigator.clipboard.writeText(url.href);setToast('Topic link copied.')}catch{setToast('Copy this page’s address to share your map.')}};
  return {variant,theme,setTheme,lang,setLang,query,setQuery,hits,searching,graph,loading,error,selected,select,explore,expand,expanding,reset,history,back,comparison,comparing,compareOpen,openCompare,closeCompare:()=>setCompareOpen(false),compareLanguages,setCompareLanguages,runCompare:(topic?:Article)=>void runCompare(topic),share,toast,direction,setDirection,aboutOpen,setAboutOpen};
}
