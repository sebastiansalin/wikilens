import { useEffect, useState } from 'react';
import type { Article } from '../types';
import { conflictColor, loadPilot } from '../pilot';
import type { ConflictEvidence, ConflictPilot } from '../pilot';
function diff(e:ConflictEvidence) {return `https://fi.wikipedia.org/w/index.php?diff=${e.revision}&oldid=${e.parent}`;}
export default function ConflictPanel({article,onExplore}:{article?:Article;onExplore:(title:string)=>void}) {
 const [pilot,setPilot]=useState<ConflictPilot|null>(null),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;loadPilot().then(p=>{if(active)setPilot(p);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoaded(true);});return()=>{active=false;};},[]);
 const score=article?.conflict;
 return <section className="sidebar-section conflict-section">
  <div className="section-heading"><h2>Editing disagreement</h2><span>M · FI</span></div>
  {score?<>
   <div className="conflict-score"><strong style={{color:conflictColor(score.score)}}>{score.score??'—'}</strong><span>{score.score==null?'Insufficient history':'/ 100 conflict index'}<small>{score.period.from.slice(0,10)} — {score.period.to.slice(0,10)}</small></span></div>
   <p className="section-hint">Repeated mutual reversals in the available history. A high score does not mean the article is wrong.</p>
   <div className="article-facts"><span><strong>{score.disputedRevisions}</strong>disputed revisions</span><span><strong>{score.participants}</strong>participants</span><span><strong>{score.revisions.toLocaleString()}</strong>revisions read</span></div>
   {score.coverage.parentGaps>0?<p className="conflict-note">{score.coverage.parentGaps} history gaps; reversals crossing them were excluded.</p>:null}
   <details><summary>When did it happen?</summary><div className="conflict-timeline">{score.timeline.map(t=><div key={t.year} title={`${t.year}: ${t.disputedRevisions} disputed / ${t.revisions} revisions`}><span style={{height:`${Math.max(2,t.disputedRevisions/Math.max(1,...score.timeline.map(y=>y.disputedRevisions))*60)}px`}}/><small>{t.year.slice(2)}</small></div>)}</div><p className="section-hint">Disputed revisions per year; bar heights show counts, not yearly scores.</p></details>
   <details><summary>Check the evidence ({score.evidence.length})</summary>{score.evidence.length?score.evidence.map(e=><a className="conflict-evidence" href={diff(e)} target="_blank" rel="noreferrer" key={e.revision}>{e.timestamp?.slice(0,10)} · revision {e.revision}{e.cleanup?' · cleanup discount':''} ↗</a>):<p className="section-hint">No qualifying repeated mutual full-text restores were detected. Partial disagreements may still exist.</p>}</details>
   <details><summary>Passages that returned ({score.passages.length})</summary><p className="section-hint">Repeated paragraph removal and restoration, shown separately from the score. Wikitext is preserved; meaning and intent need review.</p>{score.passages.map((p,i)=><div className="conflict-passage" key={i}><blockquote>{p.text}</blockquote><span>{p.returns} returns · </span>{p.evidence.map(e=><a key={e.revision} href={diff(e)} target="_blank" rel="noreferrer">{e.revision} ↗ </a>)}</div>)}</details>
   <details><summary>How the score works</summary><p className="section-hint">A pair must reverse each other across at least three revisions within 30 days. The index combines recurrence (45%), edit-normalized rate (30%), active days (15%) and participants (10%). Self-reverts and unchanged saves do not count; explicit cleanup comments receive one-quarter weight. These are uncalibrated design choices.</p><p className="section-hint">Baseline: {score.baseline.exactReverts} exact restores, {score.baseline.selfReverts} self-restores. Method: {score.method}. Partial rewordings, talk-page debate and semantic agreement are not measured.</p></details>
  </>:<p className="section-hint">{error||(!loaded?'Loading the M pilot…':pilot?'Choose a pilot article to inspect its history.':'The M pilot has not been calculated yet. Scores will appear after the verified dataset export is built.')}</p>}
  {pilot?<details open={!score}><summary>Explore the {pilot.articles.length}-article pilot</summary><div className="conflict-ranking">{pilot.articles.map(a=><button key={a.pageId} onClick={()=>onExplore(a.title)}><span className="conflict-dot" style={{background:conflictColor(a.score)}}/><span>{a.title}</span><strong>{a.score??'—'}</strong></button>)}</div><p className="section-hint">{pilot.selection}</p><a className="conflict-evidence" href={pilot.source} target="_blank" rel="noreferrer">M source · {pilot.revisionCount.toLocaleString()} revisions ↗</a></details>:null}
 </section>;
}
