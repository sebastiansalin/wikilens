import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { layoutNodes } from '../layout';
import { Plus, Minus, Maximize2, Pin, PinOff } from 'lucide-react';
import type { GraphData, GraphNode, Language, Theme, Variant } from '../types';
interface Props {graph:GraphData;selected:GraphNode|null;onSelect:(n:GraphNode)=>void;onExplore:(t:string,l?:Language)=>void;theme:Theme;variant:Variant;direction?:'both'|'outgoing'|'incoming';compact?:boolean}
type LayoutNode=GraphNode & {x:number;y:number;fx?:number|null;fy?:number|null};
const palette=['#9cbaed','#c7a6ed','#8acaba','#ddba76','#df9ba7','#87bcc9'];
function shortLines(title:string,max=15):string[]{const words=title.replaceAll('_',' ').split(' ');const lines:string[]=[''];for(const word of words){const i=lines.length-1;if((lines[i]+' '+word).trim().length<=max)lines[i]=(lines[i]+' '+word).trim();else if(lines.length<3)lines.push(word.length>max?word.slice(0,max-1)+'…':word);else{lines[2]=lines[2].slice(0,max-1)+'…';break;}}return lines;}
export default function GraphCanvas({graph,selected,onSelect,onExplore,theme,variant,direction='both',compact=false}:Props){
  const container=useRef<HTMLDivElement>(null);const svg=useRef<SVGSVGElement>(null);const marker=useId().replaceAll(':','');
  const [size,setSize]=useState({width:1000,height:700});const [view,setView]=useState({x:0,y:0,k:1});const [pinned,setPinned]=useState<Set<string>>(new Set());const [overrides,setOverrides]=useState<Record<string,{x:number;y:number}>>({});const [hover,setHover]=useState<string|null>(null);
  const [extra,setExtra]=useState(0);
  const gesture=useRef<{kind:'pan'|'node';id?:string;sx:number;sy:number;ox:number;oy:number;moved:boolean}|null>(null);
  useEffect(()=>{if(!container.current)return;const observer=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;if(width>0&&height>0)setSize({width,height});});observer.observe(container.current);return()=>observer.disconnect()},[]);
  useEffect(()=>{setView({x:0,y:0,k:1});setOverrides({});setPinned(new Set());setExtra(0)},[graph.root.id]);
  const layout=useMemo(()=>{
    const relevant=new Set(graph.links.filter(e=>direction==='incoming'?e.target===graph.root.id:e.source===graph.root.id).map(e=>direction==='incoming'?e.source:e.target));
    const all=graph.nodes.filter(n=>n.root||direction==='both'||relevant.has(n.id));
    const outgoing=all.filter(n=>!n.root&&n.direction!=='incoming'),incoming=all.filter(n=>!n.root&&n.direction==='incoming');
    const ordered=all.filter(n=>n.root);for(let i=0;i<Math.max(outgoing.length,incoming.length);i++){if(outgoing[i])ordered.push(outgoing[i]);if(incoming[i])ordered.push(incoming[i]);}
    const budget=compact?all.length:(size.width<600?18:36)+extra;
    const eligible=ordered.slice(0,budget);
    const nodes:LayoutNode[]=layoutNodes(eligible,graph.links,size.width,size.height,compact);
    const ids=new Set(nodes.map(n=>n.id));
    return {nodes,total:all.length,links:graph.links.filter(e=>ids.has(e.source)&&ids.has(e.target)&&(direction==='both'||(direction==='incoming'?e.source!==graph.root.id:e.target!==graph.root.id)))};
  },[graph.nodes,graph.links,graph.root.id,size.width,size.height,direction,compact,extra]);
  const byId=new Map(layout.nodes.map(n=>[n.id,{...n,...overrides[n.id]}]));
  const focused=hover||selected?.id;const connected=new Set<string>();if(focused){connected.add(focused);layout.links.forEach(e=>{if(e.source===focused)connected.add(e.target);if(e.target===focused)connected.add(e.source)})}
  useEffect(()=>{const el=svg.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();const rect=el.getBoundingClientRect();const px=e.clientX-rect.left,py=e.clientY-rect.top;setView(v=>{const k=Math.min(3.5,Math.max(.45,v.k*Math.exp(-e.deltaY*.001)));return {k,x:px-(px-v.x)*k/v.k,y:py-(py-v.y)*k/v.k}})};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel)},[]);
  const zoom=(factor:number)=>setView(v=>{const k=Math.min(3.5,Math.max(.45,v.k*factor));return{k,x:size.width/2-(size.width/2-v.x)*k/v.k,y:size.height/2-(size.height/2-v.y)*k/v.k}});
  const fit=()=>{const nodes=[...byId.values()];if(!nodes.length)return;const left=Math.min(...nodes.map(n=>n.x))-55,right=Math.max(...nodes.map(n=>n.x))+55,top=Math.min(...nodes.map(n=>n.y))-55,bottom=Math.max(...nodes.map(n=>n.y))+55;const k=Math.min(1.3,(size.width-32)/(right-left),(size.height-110)/(bottom-top));setView({k,x:size.width/2-(left+right)/2*k,y:(size.height-40)/2-(top+bottom)/2*k});};
  const togglePin=()=>{if(!selected)return;const node=byId.get(selected.id);if(!node)return;if(pinned.has(node.id)){setPinned(p=>{const next=new Set(p);next.delete(node.id);return next});setOverrides(o=>{const next={...o};delete next[node.id];return next})}else{setPinned(p=>new Set(p).add(node.id));setOverrides(o=>({...o,[node.id]:{x:node.x,y:node.y}}))}};
  const start=(event:React.PointerEvent,id?:string)=>{if(event.button!==0)return;event.stopPropagation();svg.current?.setPointerCapture(event.pointerId);const n=id?byId.get(id):null;gesture.current={kind:id?'node':'pan',id,sx:event.clientX,sy:event.clientY,ox:n?.x??view.x,oy:n?.y??view.y,moved:false}};
  const move=(event:React.PointerEvent)=>{const g=gesture.current;if(!g)return;const dx=event.clientX-g.sx,dy=event.clientY-g.sy;if(Math.abs(dx)+Math.abs(dy)>4)g.moved=true;if(g.kind==='pan')setView(v=>({...v,x:g.ox+dx,y:g.oy+dy}));else if(g.id)setOverrides(o=>({...o,[g.id!]:{x:g.ox+dx/view.k,y:g.oy+dy/view.k}}))};
  const end=()=>{const g=gesture.current;if(g?.kind==='node'&&g.id){const node=byId.get(g.id);if(node&&!g.moved)onSelect(node);if(g.moved)setPinned(p=>new Set(p).add(g.id!))}gesture.current=null};
  return <div className={`graph-canvas graph-${variant} ${compact?'graph-compact':''}`} ref={container}>
    <svg ref={svg} width="100%" height="100%" role="group" aria-label={`Connections around ${graph.root.title}. Drag to move, scroll to zoom. Select an article to inspect it.`} onPointerDown={e=>start(e)} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{gesture.current=null}} style={{touchAction:'none'}}>
      <defs><marker id={marker} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 1 L 7 4 L 0 7" fill="none" stroke="currentColor" strokeWidth="1"/></marker><filter id={`${marker}-glow`}><feGaussianBlur stdDeviation="7"/></filter></defs>
      <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
        {layout.links.map((edge,i)=>{const a=byId.get(edge.source),b=byId.get(edge.target);if(!a||!b)return null;const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||1;const ar=compact?(a.root?13:5):a.root?43:30,br=compact?(b.root?13:5):b.root?43:30;const active=focused&&(edge.source===focused||edge.target===focused);return <line key={`${edge.source}-${edge.target}-${i}`} className={`graph-edge ${active?'is-active':''}`} x1={a.x+dx/dist*ar} y1={a.y+dy/dist*ar} x2={b.x-dx/dist*(br+4)} y2={b.y-dy/dist*(br+4)} markerEnd={active?`url(#${marker})`:undefined} style={{opacity:focused?(active?.6:.04):(edge.source===graph.root.id||edge.target===graph.root.id?.2:.07)}}/>})}
        {layout.nodes.map((node,i)=>{const n=byId.get(node.id)!;const root=n.id===graph.root.id;const chosen=selected?.id===n.id;const radius=compact?(root?13:5):root?44:30;const color=palette[i%palette.length];const lines=shortLines(n.title,root?16:compact?8:12);return <g key={n.id} transform={`translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`} className={`graph-node ${root?'is-root':''} ${chosen?'is-selected':''}`} role="button" tabIndex={0} aria-label={`${n.title}${root?', current topic':''}${pinned.has(n.id)?', pinned':''}`} aria-pressed={chosen} onPointerDown={e=>start(e,n.id)} onDoubleClick={()=>onExplore(n.title,n.lang)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(n)}if(e.key==='e')onExplore(n.title,n.lang)}} onMouseEnter={()=>setHover(n.id)} onMouseLeave={()=>setHover(null)} opacity={focused && !connected.has(n.id) ? .28 : 1}>
          {theme==='galaxy'?<circle r={radius+13} fill={color} opacity={root?.25:.1} filter={`url(#${marker}-glow)`}/>:null}
          {chosen?<circle r={radius+6} className="graph-selection"/>:null}
          <circle r={radius} className="graph-node-circle" style={theme==='galaxy'?{stroke:color,fill:root?'#28364c':'#142031'}:undefined}/>
          {root?<circle r={radius+11} className="graph-root-ring"/>:null}
          <text opacity={compact && !root && hover!==n.id ? 0 : 1} textAnchor="middle" className="graph-node-label" style={{fontSize:root?11:compact?8:9}}>{lines.map((line,j)=><tspan key={j} x="0" dy={j===0?`${-(lines.length-1)*.6+.35}em`:'1.2em'}>{line}</tspan>)}</text>
          {pinned.has(n.id)?<circle cx={radius*.7} cy={-radius*.7} r="3" fill="var(--accent)"/>:null}
        </g>})}
      </g>
    </svg>
    <div className="graph-controls" aria-label="Map controls"><button onClick={()=>zoom(1.2)} title="Zoom in" aria-label="Zoom in"><Plus size={17}/></button><button onClick={()=>zoom(1/1.2)} title="Zoom out" aria-label="Zoom out"><Minus size={17}/></button><button onClick={fit} title="Fit map" aria-label="Fit map"><Maximize2 size={16}/></button>{selected?<button onClick={togglePin} title={pinned.has(selected.id)?'Unpin article':'Pin article'} aria-label={pinned.has(selected.id)?'Unpin article':'Pin article'}>{pinned.has(selected.id)?<PinOff size={16}/>:<Pin size={16}/>}</button>:null}</div>
    {!compact&&layout.total>layout.nodes.length?<div className="graph-density"><span>{layout.nodes.length} of {layout.total} articles</span><button onClick={()=>setExtra(n=>n+12)}>Show more <Plus size={12}/></button>{extra>0?<button onClick={()=>setExtra(0)}>Simplify</button>:null}</div>:null}
    {!compact?<div className="graph-gesture-hint">Drag to arrange <span>·</span> Scroll to zoom <span>·</span> Double-click to explore</div>:null}
  </div>
}



