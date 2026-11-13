import { useEffect, useRef, useState } from 'react';
import { Clock3, Loader2, ArrowUpRight } from 'lucide-react';
import { request } from '../useWikiLens';
import type { Article, Language } from '../types';

interface HistoryResult {
 engine:'mariadb-svt';date:string;
 article:{title:string;url:string;timestamp:string;revid:number};
 links:string[];added:string[];removed:string[];
 latest:{timestamp:string;url:string};
 coverage:{earliest:string;latest:string;capturedAt:string;revisionCount:number};
 timeline:{revid:number;date:string;timestamp:string;available:boolean;linkCount:number|null}[];
}
const when=(date:string)=>new Date(date).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'});
export default function HistoryPanel({article,connected,onExplore}:{article?:Article;connected:boolean;onExplore:(title:string,lang?:Language)=>void}){
 const [result,setResult]=useState<HistoryResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>{controller.current?.abort();setResult(null);setError('');setBusy(false);return()=>controller.current?.abort();},[article?.id]);
 const load=async(date?:string)=>{
  if(!article)return;controller.current?.abort();const abort=new AbortController();controller.current=abort;setBusy(true);setError('');
  try{const data=await request<HistoryResult>(`/api/history?title=${encodeURIComponent(article.title)}&lang=${article.lang}${date?`&date=${encodeURIComponent(date)}`:''}`,abort.signal);if(!abort.signal.aborted)setResult(data);}
  catch(e){if(!abort.signal.aborted)setError((e as Error).message);}finally{if(!abort.signal.aborted)setBusy(false);}
 };
 return <section className="sidebar-section history-section"><div className="section-heading"><h2><Clock3 size={16}/>Through time</h2><span>UTC</span></div>
  {result?<><label className="history-picker">Revision<select aria-label="Historical revision" value={result.article.revid} onChange={e=>{const revision=result.timeline.find(row=>row.revid===Number(e.target.value));if(revision)void load(revision.date);}} disabled={busy}>{result.timeline.map(row=><option key={row.revid} value={row.revid} disabled={!row.available}>{when(row.timestamp)}{row.available?'':' — unavailable'}</option>)}</select></label><div className="history-counts"><span><strong>{result.links.length}</strong>links then</span><span><strong>+{result.added.length}</strong>added since</span><span><strong>−{result.removed.length}</strong>removed since</span></div>
   <p className="section-hint">Compared with the latest imported revision, {when(result.latest.timestamp)}.</p>
   {([['Added',result.added],['Removed',result.removed]] as const).map(([label,titles])=>titles.length?<div className="history-links" key={label}><h3>{label}</h3>{titles.slice(0,8).map(title=><button key={title} onClick={()=>onExplore(title,article?.lang)}>{title}<ArrowUpRight size={11}/></button>)}{titles.length>8?<small>+{titles.length-8} more</small>:null}</div>:null)}
   <a className="history-source" href={result.article.url} target="_blank" rel="noreferrer">Read this revision<ArrowUpRight size={12}/></a><p className="section-hint">{result.coverage.revisionCount} imported revisions. Coverage begins {when(result.coverage.earliest)}. Explicit source links only; earlier history and template links are outside this capture.</p></>:<><p className="section-hint">See which connections appeared or disappeared between revisions.</p><button className="compare-button" disabled={!connected||!article||busy} onClick={()=>void load()}>{busy?<Loader2 size={15} className="spin"/>:<Clock3 size={15}/>}Load article history</button>{!connected?<p className="section-hint">Available when MariaDB revision history is connected.</p>:null}</>}
  {busy&&result?<p role="status" className="section-hint">Loading revision…</p>:null}{error?<p role="alert" className="sidebar-error">{error}</p>:null}
 </section>;
}
