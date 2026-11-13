import { useState } from 'react';
import { ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, ChevronDown, GitCompareArrows, LoaderCircle, PanelRightClose, PanelRightOpen, Share2, X } from 'lucide-react';
import type { WikiLensState } from '../../workspace';
import { LANGUAGES } from '../../types';
import GraphCanvas from '../../components/GraphCanvas';
import { ArticlePanel, BackButton, Brand, ComparisonPanel, ConnectionStatus, LanguageSelect, SearchBox, ThemeSwitch } from '../../components/Chrome';
import './prism.css';

const beginnings = [
  { title: 'Apple', label: 'The familiar', number: '01' },
  { title: 'Black hole', label: 'The unknown', number: '02' },
  { title: 'Russo-Ukrainian War', label: 'The contested', number: '03' },
];

function EditionsSketch() {
  const nodes = [
    [80, 68, 6], [143, 100, 9], [42, 151, 8], [185, 166, 8], [80, 231, 10],
    [180, 271, 7], [236, 90, 7], [250, 221, 7], [120, 310, 6], [23, 267, 6],
  ];
  return (
    <div className="prism-sketch" aria-hidden="true">
      <div className="prism-sketch-plane prism-sketch-plane-a">
        <svg viewBox="0 0 280 350" fill="none">
          <g className="prism-sketch-edges">
            {nodes.map(([x, y], i) => <path key={i} d={`M130 177 L${x} ${y}`} />)}
            <path d="M80 68L143 100L236 90L185 166L250 221L180 271L120 310L80 231L23 267L42 151L80 68" />
            <path d="M80 231L185 166M143 100L80 231M80 68L185 166" />
          </g>
          {nodes.map(([x, y, radius], i) => <circle key={i} cx={x} cy={y} r={radius} className={i % 3 === 0 ? 'prism-sketch-node prism-sketch-specific' : 'prism-sketch-node'} />)}
          <circle cx="130" cy="177" r="29" className="prism-sketch-center" />
          <circle cx="130" cy="177" r="7" className="prism-sketch-core" />
        </svg>
        <span>One edition</span>
      </div>
      <div className="prism-sketch-divider"><span><ArrowLeftRight size={17} /></span></div>
      <div className="prism-sketch-plane prism-sketch-plane-b">
        <svg viewBox="0 0 280 350" fill="none">
          <g className="prism-sketch-edges">
            {nodes.slice(0, 8).map(([x, y], i) => <path key={i} d={`M130 177 L${280 - x} ${y + (i % 2 ? 15 : -12)}`} />)}
            <path d="M200 56L137 115L95 181L100 286L200 219L238 139L200 56M44 78L137 115M30 236L95 181L200 219" />
          </g>
          {nodes.slice(0, 8).map(([x, y, radius], i) => <circle key={i} cx={280 - x} cy={y + (i % 2 ? 15 : -12)} r={radius} className={i % 3 === 1 ? 'prism-sketch-node prism-sketch-specific' : 'prism-sketch-node'} />)}
          <circle cx="130" cy="177" r="29" className="prism-sketch-center" />
          <circle cx="130" cy="177" r="7" className="prism-sketch-core" />
        </svg>
        <span>Another perspective</span>
      </div>
      <span className="prism-sketch-caption">An illustration of two connected worlds</span>
    </div>
  );
}

export default function PrismWorkspace({ state }: { state: WikiLensState }) {
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 761px)').matches);
  const editionLang = state.graph?.root.lang ?? state.lang;
  const editionName = LANGUAGES.find(language => language.code === editionLang)?.name ?? editionLang;
  const hasGraph = Boolean(state.graph);
  const loadedNodes = state.graph?.nodes.length ?? 0;

  return (
    <div className={`variant-root prism-root ${hasGraph ? 'prism-has-graph' : 'prism-is-entry'}`}>
      <header className="prism-header">
        <div className="prism-identity">
          <BackButton state={state}/>
          <Brand variant="prism" onClick={state.reset} />
          <span className="prism-product-note">A comparative atlas</span>
        </div>
        {hasGraph && <div className="prism-header-search"><SearchBox state={state} compact /></div>}
        <div className="prism-header-actions">
          <ThemeSwitch state={state} />
          <button className="prism-text-button prism-about" onClick={() => state.setAboutOpen(true)}>How it works <ArrowUpRight size={14} /></button>
        </div>
      </header>

      {!hasGraph ? (
        <main className="prism-entry">
          <div className="prism-entry-topline"><span>WIKIPEDIA, THROUGH A DIFFERENT LENS</span><span className="prism-entry-edition">PRISM / 02</span></div>
          <section className="prism-entry-composition" aria-labelledby="prism-entry-title">
            <div className="prism-entry-copy">
              <h1 id="prism-entry-title">One subject.<br /><em>Different worlds.</em></h1>
              <p>See what connects a topic across languages.<br className="prism-desktop-break" /> And what each edition brings into focus.</p>
              <div className="prism-entry-search">
                <span className="prism-field-label">WHERE SHOULD WE LOOK?</span>
                <SearchBox state={state} />
                <div className="prism-search-language"><span>Start in</span><LanguageSelect state={state} /></div>
              </div>
              {state.error && <div className="prism-error" role="alert"><span>{state.error}</span><button onClick={() => state.explore(state.query || 'Apple')} className="prism-text-button">Try again <ArrowRight size={14} /></button></div>}
              {state.loading && <div className="prism-entry-loading" role="status"><LoaderCircle size={16} className="prism-spinner" /><span>Finding the connections…</span></div>}
            </div>
            <EditionsSketch />
          </section>
          <section className="prism-beginnings" aria-labelledby="prism-beginnings-title">
            <div className="prism-beginnings-heading"><h2 id="prism-beginnings-title">A place to begin</h2><span>Pick a subject. Follow a connection.</span></div>
            <div className="prism-topic-list">
              {beginnings.map(topic => <button key={topic.title} className="prism-topic" onClick={() => state.explore(topic.title, 'en')} disabled={state.loading}><span className="prism-topic-number">{topic.number}</span><span className="prism-topic-title">{topic.title}</span><span className="prism-topic-label">{topic.label}</span><ArrowUpRight size={19} /></button>)}
            </div>
          </section>
          <footer className="prism-entry-footer"><span>A map of connections, not a measure of truth.</span><button className="prism-text-button" onClick={() => state.setAboutOpen(true)}>Read the method <ArrowRight size={14} /></button></footer>
        </main>
      ) : (
        <main className="prism-workspace">
          <div className="prism-workspace-bar">
            <div className="prism-subject">
              <div className="prism-subject-title"><span className="prism-eyebrow">CURRENT SUBJECT</span><h1>{state.graph!.root.title}</h1></div>
            </div>
            <div className="prism-workspace-actions">
              <LanguageSelect state={state} />
              <button className="prism-icon-button" onClick={state.share} aria-label="Copy a link to this view" title="Share this view"><Share2 size={17} /></button>
              <button className={`prism-panel-toggle ${sidebarOpen ? 'is-active' : ''}`} onClick={() => setSidebarOpen(!sidebarOpen)} aria-expanded={sidebarOpen} aria-controls="prism-inspector"><span>Compare</span>{sidebarOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}</button>
            </div>
          </div>
          <div className={`prism-split ${sidebarOpen ? 'prism-split-open' : ''}`}>
            <section className="prism-map" aria-label={`${state.graph!.root.title} connection graph`}>
              <div className="prism-map-caption"><span className="prism-edition-dot" /><span>{editionName} edition</span><span className="prism-caption-divider">/</span><span>{loadedNodes} articles loaded</span></div>
              <div className="prism-direction-control"><label htmlFor="prism-direction">Connections</label><div><select id="prism-direction" value={state.direction} onChange={event => state.setDirection(event.target.value as WikiLensState['direction'])}><option value="both">All links</option><option value="outgoing">Links from this topic</option><option value="incoming">Links to this topic</option></select><ChevronDown size={13} aria-hidden="true" /></div></div>
              <GraphCanvas graph={state.graph!} selected={state.selected} onSelect={node => { state.select(node); setSidebarOpen(true); }} onExplore={state.explore} theme={state.theme} variant="prism" direction={state.direction} />
              {(state.loading || state.expanding) && <div className="prism-map-loading" role="status"><LoaderCircle size={17} className="prism-spinner" />{state.expanding ? 'Expanding the neighbourhood…' : 'Loading this edition…'}</div>}
              {state.error && <div className="prism-map-error" role="alert"><span>{state.error}</span><button className="prism-text-button" onClick={() => state.explore(state.graph!.root.title, state.lang)}>Retry <ArrowRight size={13} /></button></div>}
            </section>
            {sidebarOpen && <aside id="prism-inspector" className="prism-inspector" aria-label={state.selected ? 'Selected article' : 'Compare language editions'}>
              <div className="prism-inspector-heading">
                {state.selected ? <button className="prism-text-button" onClick={() => state.select(null)}><ArrowLeft size={15} /> Compare editions</button> : <h2><GitCompareArrows size={16} /> Compare editions</h2>}
                <button className="prism-icon-button prism-mobile-close" aria-label="Close side panel" onClick={() => setSidebarOpen(false)}><X size={17} /></button>
              </div>
              <div className="prism-inspector-content">{state.selected ? <ArticlePanel state={state} /> : <ComparisonPanel state={state} embedded />}</div>
            </aside>}
          </div>
          <footer className="prism-workspace-footer"><ConnectionStatus state={state} /><span className="prism-footer-hint">Select a node to look closer.</span></footer>
        </main>
      )}
    </div>
  );
}
