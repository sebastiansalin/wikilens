import { useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, ChevronRight, Compass, ExternalLink, GitBranch, Languages, LoaderCircle, Share2, X } from 'lucide-react';
import type { WikiLensState } from '../../workspace';
import GraphCanvas from '../../components/GraphCanvas';
import { ArticlePanel, BackButton, Brand, ConnectionStatus, LanguageSelect, SearchBox, ThemeSwitch } from '../../components/Chrome';
import './atlas.css';

const suggestions = [
  { title: 'Apple', label: 'An apple' },
  { title: 'Black hole', label: 'A black hole' },
  { title: 'Mycelium', label: 'Mycelium' },
  { title: 'Russo-Ukrainian War', label: 'Russo-Ukrainian War' },
];

function AtlasDrawing({ small = false }: { small?: boolean }) {
  return <svg className={`atlas-drawing${small ? ' atlas-drawing-small' : ''}`} viewBox="0 0 560 520" fill="none" aria-hidden="true">
    <g className="atlas-drawing-lines">
      <path d="M111 131L277 240L437 111M277 240L448 348L230 438L277 240L87 352L111 131M111 131L437 111M87 352L230 438M437 111L448 348" />
      <path d="M277 240L354 55M448 348L521 251M87 352L27 231" className="atlas-drawing-faint" />
    </g>
    <g className="atlas-drawing-nodes">
      <circle cx="111" cy="131" r="42" />
      <circle cx="437" cy="111" r="28" />
      <circle cx="87" cy="352" r="26" />
      <circle cx="448" cy="348" r="43" />
      <circle cx="230" cy="438" r="21" />
      <circle cx="354" cy="55" r="8" />
      <circle cx="521" cy="251" r="7" />
      <circle cx="27" cy="231" r="7" />
    </g>
    <circle className="atlas-drawing-halo" cx="277" cy="240" r="76" />
    <circle className="atlas-drawing-center" cx="277" cy="240" r="57" />
    <path className="atlas-drawing-star" d="M277 224V256M261 240H293" />
  </svg>;
}

export default function Atlas({ state }: { state: WikiLensState }) {
  const [showTrail, setShowTrail] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const contextPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => setIsMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!showTrail || !isMobile) return;
    const before = document.activeElement as HTMLElement | null;
    contextPanel.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowTrail(false);
      if (event.key !== 'Tab') return;
      const controls = [...(contextPanel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href]') || [])].filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); before?.focus(); };
  }, [showTrail, isMobile]);
  const { graph, loading } = state;
  const inWorkspace = Boolean(graph || loading);
  const history = state.history.filter((item, index, all) => all.findIndex(other => other.id === item.id) === index).slice(-6).reverse();

  return <div className={`variant-root atlas-root${inWorkspace ? ' atlas-working' : ''}`}>
    <header className="atlas-header">
      <div className="atlas-brand-wrap"><BackButton state={state}/><Brand onClick={state.reset} /><span className="atlas-edition">Atlas</span></div>
      {inWorkspace && <div className="atlas-header-search"><SearchBox state={state} compact /></div>}
      <div className="atlas-header-actions">
        <ThemeSwitch state={state} />
        <button className="atlas-icon-button atlas-about" type="button" onClick={() => state.setAboutOpen(true)} aria-label="About WikiLens" title="About WikiLens"><Compass size={19} strokeWidth={1.5} /></button>
      </div>
    </header>

    {!inWorkspace ? <main className="atlas-entry">
      <div className="atlas-entry-copy">
        <p className="atlas-kicker"><span /> A different way into Wikipedia</p>
        <h1>Follow your<br /><em>curiosity.</em></h1>
        <p className="atlas-entry-description">Pick a thought. See what it touches.<br />Find somewhere you didn’t expect.</p>
        <div className="atlas-entry-search"><SearchBox state={state} /></div>
        <div className="atlas-entry-language"><LanguageSelect state={state} /><span>or paste a Wikipedia link</span></div>
        {state.error && <div className="atlas-entry-error" role="alert"><p>{state.error}</p><button type="button" onClick={() => state.explore(state.query || 'Apple')}>Try again <ArrowRight size={16} /></button></div>}
        <div className="atlas-suggestions"><span>Start with</span><div>{suggestions.map(item => <button type="button" key={item.title} onClick={() => state.explore(item.title)}>{item.label}<ArrowUpRight size={14} /></button>)}</div></div>
      </div>
      <div className="atlas-entry-art"><AtlasDrawing /><div className="atlas-art-caption"><span>01</span><span>Everything is connected.</span></div></div>
      <div className="atlas-entry-bottom"><span>One idea is only the beginning.</span><button type="button" onClick={() => state.setAboutOpen(true)}>How this works <ArrowUpRight size={15} /></button></div>
    </main> : <main className="atlas-workspace">
      <aside ref={contextPanel} className={`atlas-context${showTrail ? ' atlas-context-open' : ''}`} aria-label="Current topic and exploration trail" role={isMobile ? 'dialog' : undefined} aria-modal={isMobile && showTrail ? true : undefined} aria-hidden={isMobile && !showTrail ? true : undefined} inert={isMobile && !showTrail ? true : undefined}>
        <div className="atlas-context-mobile-close"><button type="button" className="atlas-icon-button" onClick={() => setShowTrail(false)} aria-label="Close exploration trail"><X size={19} /></button></div>
        <div className="atlas-context-heading"><span className="atlas-kicker">On your map</span></div>
        {graph ? <>
          <h1 className="atlas-topic-title">{graph.root.title}</h1>
          <p className="atlas-topic-description">{graph.root.description || (graph.root.extract ? `${graph.root.extract.slice(0, 210)}${graph.root.extract.length > 210 ? '…' : ''}` : 'Explore the articles connected to this topic.')}</p>
          <a className="atlas-article-link" href={graph.root.url} target="_blank" rel="noreferrer">Read on Wikipedia <ExternalLink size={13} /></a>
          <dl className="atlas-topic-stats">
            <div><dt><ArrowUpRight size={14} /> Links out</dt><dd>{graph.stats.outgoing.toLocaleString()}{!graph.stats.outgoingComplete && '+'}</dd></div>
            <div><dt><ArrowDownLeft size={14} /> Links in</dt><dd>{graph.stats.incomingAvailable===false?'—':graph.stats.incoming.toLocaleString()}{graph.stats.incomingAvailable!==false&&!graph.stats.incomingComplete && '+'}</dd></div>
          </dl>
          <button className="atlas-compare-button" type="button" onClick={() => { setShowTrail(false); state.openCompare(); }}><Languages size={18} strokeWidth={1.5} /><span>Compare languages</span><ArrowRight size={16} /></button>
          {history.length > 1 && <div className="atlas-trail"><h2>Your trail</h2>{history.map((item, index) => <button type="button" key={item.id} onClick={() => { state.explore(item.title, item.lang); setShowTrail(false); }} className={item.id === graph.root.id ? 'atlas-trail-active' : ''}><span className="atlas-trail-number">{String(history.length - index).padStart(2, '0')}</span><span>{item.title}</span><ChevronRight size={13} /></button>)}</div>}
          <div className="atlas-context-foot"><button type="button" onClick={state.share}><Share2 size={15} /> Share topic</button></div>
        </> : <div className="atlas-context-skeleton" aria-hidden="true"><span /><span /><span /></div>}
      </aside>

      <section className="atlas-map-area" aria-label={graph ? `Connections around ${graph.root.title}` : 'Loading your map'}>
        <div className="atlas-map-toolbar">
          <button className="atlas-mobile-topic" type="button" onClick={() => setShowTrail(true)}><GitBranch size={16} /><span>{graph?.root.title || 'Your map'}</span><ChevronRight size={14} /></button>
          <div className="atlas-directions" role="group" aria-label="Connection direction">
            {(['both', 'outgoing', 'incoming'] as const).map(direction => <button key={direction} type="button" aria-pressed={state.direction === direction} onClick={() => state.setDirection(direction)}>{direction === 'both' ? 'All links' : direction === 'outgoing' ? 'Outgoing' : 'Incoming'}</button>)}
          </div>
          <div className="atlas-map-language"><LanguageSelect state={state} /></div>
        </div>
        {graph && <GraphCanvas graph={graph} selected={state.selected} onSelect={state.select} onExplore={state.explore} theme={state.theme} variant="atlas" direction={state.direction} />}
        {!graph && <div className="atlas-map-placeholder"><AtlasDrawing small /></div>}
        {(loading || state.expanding) && <div className={`atlas-loading${!graph ? ' atlas-loading-center' : ''}`} role="status"><LoaderCircle size={17} className="atlas-spinner" /><span>{state.expanding ? 'Finding more connections…' : 'Opening your map…'}</span></div>}
        {state.error && <div className="atlas-map-error" role="alert"><p>{state.error}</p><button type="button" onClick={() => state.explore(graph?.root.title || state.query || 'Apple', graph?.root.lang || state.lang)}>Try again <ArrowRight size={15} /></button></div>}
        {graph && <div className="atlas-map-bottom"><ConnectionStatus state={state} /><span>{graph.nodes.length.toLocaleString()} articles loaded</span></div>}
        {state.selected && <div className="atlas-selection"><ArticlePanel state={state} /></div>}
      </section>
      {showTrail && <button className="atlas-context-backdrop" type="button" aria-label="Close exploration trail" onClick={() => setShowTrail(false)} />}
    </main>}
  </div>;
}

