import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, Circle, Globe2, Loader2, Moon, Search, Sparkles, Sun, X, Expand, Network, Info } from 'lucide-react';
import type { WikiLensState } from '../workspace';
import { LANGUAGES } from '../types';
import type { Language, Variant } from '../types';
import GraphCanvas from './GraphCanvas';

export function BackButton({state}:{state:WikiLensState}){
  if(!state.graph&&!state.loading)return null;
  const destination=state.loading&&state.graph?'current topic':state.history.length>1?'previous topic':'start';
  return <button type="button" className="back-button" onClick={state.back} aria-label={`Back to ${destination}`} title={`Back to ${destination}`}><ArrowLeft size={17}/><span>Back</span></button>;
}

export function Brand({variant,onClick}:{variant?:Variant;onClick?:()=>void}){return <button className="brand" onClick={onClick} aria-label="WikiLens home"><svg viewBox="0 0 30 30" width="28" height="28" aria-hidden="true"><path d="M6 7L14 23L25 6M6 7L25 6M14 23L26 23" fill="none" stroke="currentColor" strokeWidth="1.2"/><circle cx="6" cy="7" r="3" fill="currentColor"/><circle cx="14" cy="23" r="4" fill="currentColor"/><circle cx="25" cy="6" r="3" fill="currentColor"/><circle cx="26" cy="23" r="2" fill="currentColor"/></svg><span>WikiLens</span>{variant?<small>{variant}</small>:null}</button>}
export function SearchBox({state,compact=false}:{state:WikiLensState;compact?:boolean}){
  const [open,setOpen]=useState(false);const [active,setActive]=useState(-1);const parent=useRef<HTMLDivElement>(null);const input=useRef<HTMLInputElement>(null);const id=useId();
  useEffect(()=>{const close=(e:PointerEvent)=>{if(!parent.current?.contains(e.target as Node))setOpen(false)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[]);
  useEffect(()=>{setActive(-1)},[state.hits]);
  const choose=(title:string)=>{state.explore(title);setOpen(false);input.current?.blur()};
  return <div className={`search-box ${compact?'search-compact':''}`} ref={parent}>
    <form onSubmit={e=>{e.preventDefault();choose(active>=0&&state.hits[active]?state.hits[active].title:state.query)}} role="search">
      <Search size={19} aria-hidden="true"/>
      <input ref={input} value={state.query} onChange={e=>{state.setQuery(e.target.value);setOpen(true)}} onFocus={()=>setOpen(true)} placeholder={compact?'Search Wikipedia…':'A topic, a question, a Wikipedia link…'} aria-label="Search Wikipedia or paste an article link" role="combobox" aria-expanded={open&&state.hits.length>0} aria-controls={`${id}-results`} aria-activedescendant={active>=0?`${id}-${active}`:undefined} autoComplete="off" onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(a=>Math.min(a+1,state.hits.length-1))}if(e.key==='ArrowUp'){e.preventDefault();setActive(a=>Math.max(a-1,-1))}if(e.key==='Escape'){setOpen(false);setActive(-1);input.current?.blur()}}}/>
      <button className="search-submit" type="submit" aria-label="Explore topic" disabled={!state.query.trim()||state.loading}>{state.loading?<Loader2 size={19} className="spin"/>:<ArrowRight size={19}/>}</button>
    </form>
    {open&&state.query.length>=2&&!/^https?:/.test(state.query)?<div className="search-results" id={`${id}-results`} role="listbox" aria-label="Wikipedia search suggestions">
      {state.searching?<div className="search-status"><Loader2 size={15} className="spin"/> Searching Wikipedia</div>:state.hits.length?state.hits.map((hit,i)=><button type="button" role="option" aria-selected={i===active} id={`${id}-${i}`} key={hit.pageid||hit.title} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(hit.title)}><span><strong>{hit.title}</strong>{hit.description?<small>{hit.description.replace(/<[^>]*>/g,'')}</small>:null}</span><ArrowUpRight size={15}/></button>):<div className="search-status">Press Enter to look up “{state.query}”.</div>}
    </div>:null}
  </div>
}
export function ThemeSwitch({state}:{state:WikiLensState}){return <div className="theme-switch" role="group" aria-label="Appearance">{([{id:'paper',name:'Paper',icon:Sun},{id:'ink',name:'Ink',icon:Moon},{id:'galaxy',name:'Galaxy',icon:Sparkles}] as const).map(({id,name,icon:Icon})=><button key={id} aria-label={`${name} theme`} title={`${name} theme`} aria-pressed={state.theme===id} onClick={()=>state.setTheme(id)}><Icon size={16}/></button>)}</div>}
export function LanguageSelect({state}:{state:WikiLensState}){return <label className="language-select"><Globe2 size={16}/><span className="sr-only">Wikipedia language</span><select value={state.lang} onChange={e=>state.setLang(e.target.value as Language)}>{LANGUAGES.map(l=><option key={l.code} value={l.code}>{l.name}</option>)}</select><ChevronDown size={13}/></label>}
export function ArticlePanel({state}:{state:WikiLensState}){
  const article=state.selected;if(!article)return null;
  return <section className="article-panel" aria-label="Selected article">
    <div className="panel-eyebrow"><span>ARTICLE / {article.lang.toUpperCase()}</span><button className="icon-button" onClick={()=>state.select(null)} aria-label="Close article"><X size={18}/></button></div>
    <h2>{article.title}</h2>{article.description?<p className="article-description">{article.description}</p>:null}
    <div className="article-actions"><button className="primary-button" onClick={()=>state.explore(article.title,article.lang)}>Explore from here <ArrowRight size={16}/></button><button className="secondary-button" onClick={()=>state.expand(article)} disabled={state.expanding}>{state.expanding?<Loader2 size={16} className="spin"/>:<Expand size={16}/>} {state.expanding?'Expanding…':'Expand this map'}</button></div>
    {article.thumbnail?<img className="article-image" src={article.thumbnail} alt="" loading="lazy"/>:null}
    <p className="article-extract">{article.extract||'Follow this article to discover its context and connections.'}</p>
    <a className="article-source" href={article.url} target="_blank" rel="noreferrer">Read on Wikipedia <ArrowUpRight size={15}/></a>
    {article.qid?<span className="article-qid">Wikidata {article.qid}</span>:null}
  </section>
}
export function ConnectionStatus({state}:{state:WikiLensState}){return <button className="connection-status" onClick={()=>state.setAboutOpen(true)} title="Data sources and methodology"><span className="status-dot"/>{state.graph?.source==='mariadb'?'MariaDB + Wikipedia':'Live Wikipedia'}<Info size={12}/></button>}
export function ComparisonPanel({state,embedded=false}:{state:WikiLensState;embedded?:boolean}){
  const result=state.comparison;
  return <section className={`comparison-panel ${embedded?'comparison-embedded':''}`} aria-label="Compare language editions">
    <div className="panel-eyebrow"><span>LANGUAGE COMPARISON</span>{!embedded?<button className="icon-button" onClick={state.closeCompare} aria-label="Close comparison"><X size={19}/></button>:<Globe2 size={16}/>}</div>
    <h2>{state.graph?.root.title || 'Compare connections'}</h2><p className="comparison-intro">Across {state.compareLanguages.length} language editions.</p>
    <div className="compare-selectors">{state.compareLanguages.map((lang,i)=><label key={i}><span>Edition {i+1}</span><select aria-label={`Comparison language ${i+1}`} value={lang} onChange={e=>{const next=[...state.compareLanguages];next[i]=e.target.value as Language;state.setCompareLanguages(next)}}>{LANGUAGES.filter(l=>l.code===lang||!state.compareLanguages.includes(l.code)).map(l=><option key={l.code} value={l.code}>{l.name}</option>)}</select></label>)}</div>
    <button className="primary-button compare-run" disabled={!state.graph||state.comparing} onClick={()=>state.runCompare()}>{state.comparing?<Loader2 size={16} className="spin"/>:<Network size={16}/>} {state.comparing?'Tracing connections…':result?'Refresh comparison':'Compare editions'}</button>
    {state.comparing?<div className="compare-loading" role="status"><div className="compare-orbit"><Circle size={28}/><Circle size={18}/><Circle size={12}/></div><p>Matching concepts across languages</p><small>This can take a few moments.</small></div>:result?<>
      <div className="similarity-list">{result.pairs.map(pair=><div className="similarity-item" key={pair.a+pair.b}><div><span>{pair.a.toUpperCase()} <span className="pair-divider">/</span> {pair.b.toUpperCase()}</span><strong>{pair.score===null?'—':`${Math.round(pair.score)}%`}</strong></div><div className="similarity-track"><span style={{width:`${pair.score??0}%`}}/></div><small>{pair.score===null?'Not enough mapped concepts':`${pair.shared} shared concepts · ${pair.complete?'connection similarity':'sampled connection similarity'}`}</small></div>)}</div>
      <div className="edition-list">{result.editions.map(edition=><div className="edition-card" key={edition.lang}>
        <div className="edition-title"><strong>{LANGUAGES.find(l=>l.code===edition.lang)?.name}</strong><span>{edition.lang.toUpperCase()}</span></div>
        {edition.article&&edition.graph?<>
          <a href={edition.article.url} target="_blank" rel="noreferrer">{edition.article.title}<ArrowUpRight size={13}/></a>
          {!embedded?<div className="edition-graph"><GraphCanvas graph={edition.graph} selected={null} onSelect={node=>{state.closeCompare();state.explore(node.title,node.lang)}} onExplore={(title,lang)=>{state.closeCompare();state.explore(title,lang)}} theme={state.theme} variant="prism" compact/></div>:null}
          <div className="edition-stats">
            <span><b>{edition.graph.stats.outgoing.toLocaleString()}{edition.graph.stats.outgoingComplete?'':'+'}</b> outgoing</span>
            <span><b>{edition.graph.stats.incomingAvailable===false?'Unavailable':edition.graph.stats.incoming.toLocaleString()}{edition.graph.stats.incomingAvailable!==false&&!edition.graph.stats.incomingComplete?'+':''}</b> incoming</span>
            <span><b>{edition.graph.stats.mapped}</b> mapped concepts</span>
            <span><b>{(edition.article.length/1024).toFixed(1)}</b> KiB source</span>
          </div>
        </>:<p className="edition-missing">{edition.error||'No matching article in this edition.'}</p>}
      </div>)}</div>
      {result.sharedConcepts.length?<div className="shared-concepts"><h3>Common ground</h3><div>{result.sharedConcepts.slice(0,10).map(concept=><span key={concept.qid}>{concept.title}<small>{concept.languages.length} editions</small></span>)}</div></div>:null}
      <details className="method-details"><summary>How this score works <ChevronDown size={14}/></summary><p>{result.method||'Shared outgoing Wikidata concepts divided by all unique outgoing concepts. The score describes connections, not agreement or accuracy.'}</p><p>Unmapped articles are excluded. A “+” means the API returned a bounded sample. Article size is source bytes, not a cross-language measure of depth.</p></details>
    </>:<div className="comparison-empty"><Globe2 size={28}/><p>Connections tell another story.</p><small>Select a topic, then compare its language editions.</small></div>}
    {state.error?<p className="inline-error" role="alert">{state.error}</p>:null}
  </section>
}

