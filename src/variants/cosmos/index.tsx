import { ArrowUpRight, Compass, GitCompareArrows, Info, LoaderCircle, Share2 } from 'lucide-react';
import type { WikiLensState } from '../../workspace';
import GraphCanvas from '../../components/GraphCanvas';
import { ArticlePanel, BackButton, Brand, ConnectionStatus, LanguageSelect, SearchBox, ThemeSwitch } from '../../components/Chrome';
import './cosmos.css';

const startingPoints = ['Black hole', 'Mycelium', 'Internet', 'Apple'];

function Constellation() {
  return <svg className="cosmos-constellation" viewBox="0 0 700 480" fill="none" aria-hidden="true">
    <defs>
      <radialGradient id="cosmos-halo"><stop stopColor="currentColor" stopOpacity=".26"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></radialGradient>
      <linearGradient id="cosmos-spectrum" x1="120" y1="100" x2="570" y2="380" gradientUnits="userSpaceOnUse"><stop stopColor="#80c5ed"/><stop offset=".5" stopColor="#a799d8"/><stop offset="1" stopColor="#dfa58a"/></linearGradient>
    </defs>
    <circle cx="350" cy="235" r="170" fill="url(#cosmos-halo)" opacity=".45"/>
    <g stroke="url(#cosmos-spectrum)" strokeWidth=".8" opacity=".45">
      <path d="M129 196L215 116L342 182L450 99L555 169L504 284L568 365L413 349L330 408L258 318L143 343L129 196L342 182L258 318L413 349L504 284L342 182L330 408M215 116L258 318M450 99L504 284M143 343L342 182M555 169L413 349"/>
      <path d="M67 105L129 196L73 269M215 116L293 49L450 99L520 40M555 169L642 221L568 365L638 424M330 408L202 443L143 343" opacity=".35"/>
    </g>
    <g fill="currentColor">
      <circle cx="342" cy="182" r="5"/><circle cx="129" cy="196" r="3"/><circle cx="215" cy="116" r="3"/><circle cx="450" cy="99" r="2.8"/><circle cx="555" cy="169" r="3.2"/><circle cx="504" cy="284" r="4"/><circle cx="568" cy="365" r="2"/><circle cx="413" cy="349" r="3"/><circle cx="330" cy="408" r="2.3"/><circle cx="258" cy="318" r="4"/><circle cx="143" cy="343" r="2.4"/>
      <g opacity=".35"><circle cx="67" cy="105" r="1.5"/><circle cx="73" cy="269" r="1"/><circle cx="293" cy="49" r="1.3"/><circle cx="520" cy="40" r="1.3"/><circle cx="642" cy="221" r="1"/><circle cx="638" cy="424" r="1.4"/><circle cx="202" cy="443" r="1.3"/></g>
    </g>
    <g stroke="currentColor" opacity=".2"><circle cx="342" cy="182" r="12"/><circle cx="258" cy="318" r="10"/><circle cx="504" cy="284" r="11"/></g>
  </svg>;
}

export default function CosmosWorkspace({ state }: { state: WikiLensState }) {
  const graph = state.graph;
  const busy = state.loading || state.expanding;
  return <div className={`variant-root cosmos-root ${graph ? 'cosmos-has-graph' : 'cosmos-is-empty'}`}>
    <div className="cosmos-atmosphere" aria-hidden="true"/>
    <header className="cosmos-header">
      <div className="cosmos-identity"><BackButton state={state}/><Brand variant="cosmos" onClick={state.reset}/></div>
      <div className="cosmos-header-actions"><ThemeSwitch state={state}/><button className="cosmos-icon-button cosmos-about" type="button" onClick={() => state.setAboutOpen(true)} aria-label="About this map"><Info size={18}/></button></div>
    </header>

    <main className="cosmos-main" aria-label="Cosmos Wikipedia explorer">
      {graph ? <>
        <div className="cosmos-context">
          <div className="cosmos-context-title">
            <div><p className="cosmos-eyebrow">YOUR CURRENT ORBIT</p><h1>{graph.root.title}</h1></div>
          </div>
          <div className="cosmos-context-actions">
            <button className="cosmos-quiet-button" type="button" onClick={state.openCompare} aria-label="Compare languages"><GitCompareArrows size={17}/><span>Compare languages</span></button>
            <button className="cosmos-icon-button" type="button" onClick={state.share} aria-label="Share topic"><Share2 size={17}/></button>
          </div>
        </div>
        <div className="cosmos-graph-region" aria-busy={busy}>
          <GraphCanvas graph={graph} selected={state.selected} onSelect={state.select} onExplore={state.explore} theme={state.theme} variant="cosmos" direction={state.direction}/>
        </div>
        <div className="cosmos-map-options">
          <label className="cosmos-direction"><span>Connections</span><select aria-label="Connection direction" value={state.direction} onChange={event => state.setDirection(event.target.value as WikiLensState['direction'])}><option value="both">Both directions</option><option value="outgoing">Links from here</option><option value="incoming">Links to here</option></select></label>
          <span className="cosmos-map-count">{graph.nodes.length} articles loaded</span>
        </div>
      </> : <div className="cosmos-empty-state">
        <Constellation/>
        <div className="cosmos-empty-copy">
          <p className="cosmos-eyebrow"><Compass size={14}/> A DIFFERENT WAY TO WANDER</p>
          <h1>One idea.<br/><span>Infinite directions.</span></h1>
          <p className="cosmos-introduction">Follow the connections that make up Wikipedia.<br className="cosmos-desktop-break"/> Start anywhere. See where you end up.</p>
        </div>
        <p className="cosmos-decoration-note">A place for curious minds.</p>
      </div>}

      {state.selected && graph && <aside className="cosmos-inspector" aria-label="Selected article"><ArticlePanel state={state}/></aside>}
      {busy && <div className="cosmos-progress" role="status"><LoaderCircle size={16} className="cosmos-spinner"/><span>{state.expanding ? 'Finding the next connections…' : 'Gathering your constellation…'}</span></div>}
      {state.error && <div className="cosmos-error" role="alert"><p>{state.error}</p><button type="button" onClick={() => state.explore(graph?.root.title || state.query || 'Black hole')}>Try again <ArrowUpRight size={15}/></button></div>}
    </main>

    <section className="cosmos-dock" aria-label="Find your next article">
      {!graph && <div className="cosmos-starting-points"><span>Start with</span>{startingPoints.map(topic => <button type="button" key={topic} onClick={() => state.explore(topic, 'en')} disabled={state.loading}>{topic}<ArrowUpRight size={12}/></button>)}</div>}
      <div className="cosmos-search-dock"><SearchBox state={state} compact/><div className="cosmos-dock-language"><LanguageSelect state={state}/></div></div>
      <div className="cosmos-dock-footer">{graph ? <ConnectionStatus state={state}/> : <span>Search a topic or paste a Wikipedia link</span>}<span className="cosmos-explore-hint">{graph ? 'Select an idea to explore it' : 'Knowledge has no edges.'}</span></div>
    </section>
  </div>;
}
