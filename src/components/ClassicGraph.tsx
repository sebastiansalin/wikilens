import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {Maximize2,Minus,Pin,Plus} from 'lucide-react';
import {createClassicSimulation} from '../classic-physics.mjs';
import type {ClassicNode,ClassicSimulation} from '../classic-physics.mjs';
import type {MapNode} from './ForceGraph';
import type {MeasuredLink} from '../graph-metrics.mjs';
import type {GraphNode} from '../types';

interface Props {nodes:MapNode[];links:MeasuredLink[];rootId:string;selectedId?:string;scores:ReadonlyMap<string,number|null>;motion:boolean;onSelect:(node:GraphNode)=>void;onExplore:(title:string)=>void;}
type Ball=ClassicNode<MapNode>;
type Gesture={id:number;startX:number;startY:number;panX:number;panY:number;node:Ball|null;offsetX:number;offsetY:number;left:number;top:number;moved:boolean};
type Sprite={canvas:HTMLCanvasElement;width:number;height:number;left:number;top:number};
type DrawPoint={x:number;y:number};
type Batch={width:number;focused:boolean;edges:{a:DrawPoint;b:DrawPoint}[]};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const TAU=Math.PI*2;
const classicColor=(score:number|null|undefined)=>{
 if(score==null)return '#6e8191';
 const stops=[[104,207,145],[216,182,93],[241,96,85]],t=clamp(score,0,100)/50,i=Math.min(1,Math.floor(t)),f=t-i;
 return `rgb(${stops[i].map((v,j)=>Math.round(v+(stops[i+1][j]-v)*f)).join(',')})`;
};

/** Canvas rendering of feature/conflict-explorer, with cached artwork and fixed-step forces. */
export default function ClassicGraph(props:Props){
 const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),tooltip=useRef<HTMLDivElement>(null);
 const latest=useRef(props);latest.current=props;
 const previousMotion=useRef(props.motion);
 const scene=useRef<ClassicSimulation<MapNode>|null>(null),sceneRoot=useRef('');
 const size=useRef({width:1000,height:700,ratio:1}),view=useRef({x:0,y:0,k:1});
 const frame=useRef<number|null>(null),lastTime=useRef<number|null>(null),pointer=useRef<Gesture|null>(null);
 const hovered=useRef<string|null>(null),batches=useRef<Batch[]>([]);
 const pendingDrag=useRef<{id:string;x:number;y:number}|null>(null),positions=useRef(new Map<string,DrawPoint>()),fireEpoch=useRef(new Map<string,number>());
 const sprites=useRef(new Map<string,Sprite>()),labels=useRef(new Map<string,Sprite>()),fire=useRef(new Map<string,Sprite>());
 const [hoverId,setHoverId]=useState<string|null>(null),[announcement,setAnnouncement]=useState(''),[,refreshPins]=useState(0);
 const reduced=useRef(typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches);

 const artwork=useCallback((node:Ball,color:string,selected:boolean):Sprite=>{
  const ratio=size.current.ratio,key=`${node.r}:${color}:${selected}:${ratio}`;
  const cached=sprites.current.get(key);if(cached)return cached;
  const pad=26,extent=node.r+pad,width=extent*2,height=extent*2,c=document.createElement('canvas');
  c.width=Math.ceil(width*ratio);c.height=Math.ceil(height*ratio);const ctx=c.getContext('2d')!;
  ctx.scale(ratio,ratio);ctx.translate(extent,extent);
  ctx.shadowColor=color;ctx.shadowBlur=selected?22:9;ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,0,node.r,0,TAU);ctx.fill();ctx.shadowBlur=0;
  const shine=ctx.createRadialGradient(-node.r*.3,-node.r*.4,0,0,0,node.r);shine.addColorStop(0,'#ffffff30');shine.addColorStop(.6,'#ffffff00');shine.addColorStop(1,'#00000038');ctx.fillStyle=shine;ctx.fill();ctx.strokeStyle='#ffffff24';ctx.lineWidth=.7;ctx.stroke();
  const result={canvas:c,width,height,left:-extent,top:-extent};sprites.current.set(key,result);
  if(sprites.current.size>320)sprites.current.delete(sprites.current.keys().next().value!);return result;
 },[]);
 const lettering=useCallback((node:Ball,selected:boolean):Sprite=>{
  const text=node.title.length>26&&!selected?node.title.slice(0,24)+'…':node.title,ratio=Math.max(2,size.current.ratio),key=`${text}:${selected}:${ratio}`;
  const cached=labels.current.get(key);if(cached)return cached;
  const c=document.createElement('canvas'),ctx=c.getContext('2d')!,font=`${selected?'600':'500'} ${selected?12:11}px 'DM Sans',sans-serif`;
  ctx.font=font;const width=Math.ceil(ctx.measureText(text).width)+20,height=36;c.width=Math.ceil(width*ratio);c.height=Math.ceil(height*ratio);
  ctx.scale(ratio,ratio);ctx.font=font;ctx.textAlign='center';ctx.lineWidth=3;ctx.lineJoin='round';ctx.strokeStyle='#090e13';ctx.strokeText(text,width/2,19);ctx.fillStyle=selected?'#f1f6f3':'#c5d4dd';ctx.fillText(text,width/2,19);
  const result={canvas:c,width,height,left:-width/2,top:-19};labels.current.set(key,result);
  if(labels.current.size>320)labels.current.delete(labels.current.keys().next().value!);return result;
 },[]);
 const flames=useCallback((node:Ball,time:number):Sprite=>{
  // Original continuous contours, refreshed in staggered 20 Hz buckets outside dragging.
  const phase=latest.current.motion&&!reduced.current?time*.0015:0,ratio=size.current.ratio,reachMax=Math.min(8,node.r*.32),extent=node.r+reachMax+10;
  let sprite=fire.current.get(node.id);
  if(!sprite||sprite.width!==extent*2||sprite.canvas.width!==Math.ceil(extent*2*ratio)){
   const c=document.createElement('canvas');c.width=c.height=Math.ceil(extent*2*ratio);sprite={canvas:c,width:extent*2,height:extent*2,left:-extent,top:-extent};fire.current.set(node.id,sprite);
  }
  const ctx=sprite.canvas.getContext('2d')!;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,extent*2,extent*2);ctx.translate(extent,extent);
  const seed=Number(node.id)*.618;
  for(let layer=0;layer<3;layer++){
   const reach=reachMax*(1-layer*.23),outer=node.r+reach+3,glow=ctx.createRadialGradient(0,0,node.r-1.5,0,-reach*.12,outer);
   glow.addColorStop(0,'rgba(255,183,86,0.08)');glow.addColorStop(.17,`rgba(255,${137+layer*24},64,${.20-layer*.025})`);glow.addColorStop(.5,'rgba(239,91,35,0.12)');glow.addColorStop(1,'rgba(218,67,25,0)');
   ctx.fillStyle=glow;ctx.shadowColor='rgba(239,100,37,0.16)';ctx.shadowBlur=layer===0?5:2;ctx.beginPath();
   for(let i=0;i<=144;i++){
    const angle=i/144*TAU,t=phase+layer*.7,turbulence=(Math.sin(angle*7-t*1.9+seed)*.45+Math.sin(angle*13+t*2.3+Math.sin(angle*3-t))*.28+Math.sin(angle*23-t*3.1+seed*.4)*.17+Math.sin(angle*37+t*1.7)*.10+1)*.5;
    const lift=.65+.35*Math.max(0,-Math.sin(angle)),r=node.r+1.1+reach*(.16+Math.pow(turbulence,1.65)*.9)*lift,x=Math.cos(angle)*r,y=Math.sin(angle)*r-reach*.10*turbulence;
    if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
   }ctx.closePath();ctx.fill();
  }return sprite;
 },[]);
 const paint=useCallback((time:number)=>{
  const ctx=canvas.current?.getContext('2d'),simulation=scene.current;if(!ctx||!simulation)return;
  const {width,height,ratio}=size.current,{x,y,k}=view.current,{selectedId,scores,motion}=latest.current;
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);ctx.translate(width/2+x,height/2+y);ctx.scale(k,k);
  const alpha=motion&&!reduced.current?simulation.interpolation:1;
  // One interpolation pass; every line uses the same sampled positions.
  const dragging=pointer.current?.node?.id;
  for(const n of simulation.nodes){const p=positions.current.get(n.id)!;const blend=n.id===dragging?1:alpha;p.x=n.previousX+(n.x-n.previousX)*blend;p.y=n.previousY+(n.y-n.previousY)*blend;}
  for(const batch of batches.current){ctx.strokeStyle=batch.focused?'#aacbb25e':'#50697c33';ctx.lineWidth=batch.width;ctx.beginPath();for(const {a,b} of batch.edges){ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}ctx.stroke();}
  for(const node of simulation.nodes){
   const point=positions.current.get(node.id)!,selected=node.id===selectedId,hover=node.id===hovered.current,color=classicColor(scores.get(node.id));
   const sx=width/2+x+point.x*k,sy=height/2+y+point.y*k;if(sx<-100||sy<-100||sx>width+100||sy>height+100)continue;
   ctx.save();ctx.translate(point.x,point.y);
   if((scores.get(node.id)??0)>=60){const epoch=Math.floor(time/50+(Number(node.id)%7)/7),refresh=!fire.current.has(node.id)||(!dragging&&fireEpoch.current.get(node.id)!==epoch);if(refresh)fireEpoch.current.set(node.id,epoch);const sprite=refresh?flames(node,time):fire.current.get(node.id)!;ctx.drawImage(sprite.canvas,sprite.left,sprite.top,sprite.width,sprite.height);}
   if(selected||hover){ctx.strokeStyle=selected?'#d0e9d6aa':'#a3bac45c';ctx.lineWidth=1/k;ctx.beginPath();ctx.arc(0,0,node.r+8,0,TAU);ctx.stroke();}
   const sprite=artwork(node,color,selected);ctx.drawImage(sprite.canvas,sprite.left,sprite.top,sprite.width,sprite.height);
   if(simulation.isPinned(node.id)){ctx.fillStyle='#d0e9d6';ctx.beginPath();ctx.arc(node.r+4,-node.r-4,2.5,0,TAU);ctx.fill();}
   if(selected||node.id===dragging||(!dragging&&k>.5)){const text=lettering(node,selected);ctx.save();ctx.setTransform(ratio,0,0,ratio,0,0);ctx.drawImage(text.canvas,Math.round((sx+text.left)*ratio)/ratio,Math.round((sy+node.r*k+17+text.top)*ratio)/ratio,text.width,text.height);ctx.restore();}
   ctx.restore();
  }
 },[artwork,lettering,flames]);
 const wake=useCallback(()=>{
  if(frame.current!==null||document.hidden)return;
  const animate=(time:number)=>{
   frame.current=null;if(document.hidden)return;
   const delta=lastTime.current===null?1000/60:Math.min(50,time-lastTime.current);lastTime.current=time;
   const moving=latest.current.motion&&!reduced.current||Boolean(pointer.current?.node);
   const input=pendingDrag.current;if(input){scene.current?.dragTo(input.id,input.x,input.y);pendingDrag.current=null;}
   if(moving)scene.current?.tick(delta);paint(time);
   host.current?.setAttribute('data-dragging',String(Boolean(pointer.current?.node)));
   const active=Boolean(moving&&scene.current?.isActive()),hot=latest.current.motion&&!reduced.current&&scene.current?.nodes.some(n=>(latest.current.scores.get(n.id)??0)>=60);
   host.current?.setAttribute('data-physics-running',String(active));
   if(active||hot)frame.current=requestAnimationFrame(animate);else lastTime.current=null;
  };frame.current=requestAnimationFrame(animate);
 },[paint]);
 const fit=useCallback(()=>{
  const nodes=scene.current?.nodes;if(!nodes?.length)return;
  const left=Math.min(...nodes.map(n=>n.x-n.r))-65,right=Math.max(...nodes.map(n=>n.x+n.r))+65,top=Math.min(...nodes.map(n=>n.y-n.r))-50,bottom=Math.max(...nodes.map(n=>n.y+n.r))+65;
  const k=clamp(Math.min((size.current.width-40)/(right-left),(size.current.height-80)/(bottom-top)),.25,1.5);
  view.current={k,x:-(left+right)/2*k,y:-(top+bottom)/2*k};wake();
 },[wake]);
 const rebuildBatches=useCallback(()=>{
  for(const node of scene.current?.nodes||[])if(!positions.current.has(node.id))positions.current.set(node.id,{x:node.x,y:node.y});
  const grouped=new Map<string,Batch>();for(const edge of scene.current?.links||[]){const focused=edge.source.id===latest.current.selectedId||edge.target.id===latest.current.selectedId,key=`${edge.width}:${focused}`;let batch=grouped.get(key);if(!batch){batch={width:edge.width,focused,edges:[]};grouped.set(key,batch);}batch.edges.push({a:positions.current.get(edge.source.id)!,b:positions.current.get(edge.target.id)!});}batches.current=[...grouped.values()];
 },[]);
 useLayoutEffect(()=>{
  const changed=sceneRoot.current!==props.rootId;
  if(!scene.current||changed){scene.current=createClassicSimulation(props.nodes,props.links);sceneRoot.current=props.rootId;pointer.current=null;pendingDrag.current=null;positions.current.clear();hovered.current=null;setHoverId(null);fire.current.clear();fireEpoch.current.clear();for(let i=0;i<24;i++)scene.current.tick();}
  else scene.current.update(props.nodes,props.links);
  rebuildBatches();if(changed)fit();wake();
 },[props.nodes,props.links,props.rootId,rebuildBatches,fit,wake]);
 useLayoutEffect(()=>{rebuildBatches();wake();},[props.selectedId,props.scores,rebuildBatches,wake]);
 useEffect(()=>{
  const element=canvas.current;if(!element)return;
  const resize=()=>{const rect=element.getBoundingClientRect();if(!rect.width||!rect.height)return;const ratio=Math.min(devicePixelRatio||1,2),first=size.current.width===1000&&size.current.height===700;size.current={width:rect.width,height:rect.height,ratio};element.width=Math.round(rect.width*ratio);element.height=Math.round(rect.height*ratio);if(first)fit();wake();};
  const observer=new ResizeObserver(resize);observer.observe(element);resize();
  const wheel=(event:WheelEvent)=>{event.preventDefault();const rect=element.getBoundingClientRect(),px=event.clientX-rect.left-size.current.width/2,py=event.clientY-rect.top-size.current.height/2,old=view.current,k=clamp(old.k*Math.exp(-event.deltaY*.001),.25,3),factor=k/old.k;view.current={k,x:px-(px-old.x)*factor,y:py-(py-old.y)*factor};wake();};
  element.addEventListener('wheel',wheel,{passive:false});
  const visibility=()=>{if(document.hidden){if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;lastTime.current=null;}else wake();};document.addEventListener('visibilitychange',visibility);
  const media=matchMedia('(prefers-reduced-motion: reduce)'),preference=()=>{reduced.current=media.matches;wake();};media.addEventListener('change',preference);
  let mounted=true;const fonts=()=>{if(mounted){labels.current.clear();wake();}};void document.fonts.ready.then(fonts);document.fonts.addEventListener('loadingdone',fonts);
  return()=>{mounted=false;observer.disconnect();element.removeEventListener('wheel',wheel);document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',preference);document.fonts.removeEventListener('loadingdone',fonts);if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;lastTime.current=null;sprites.current.clear();labels.current.clear();fire.current.clear();fireEpoch.current.clear();};
 },[fit,wake]);
 useEffect(()=>{lastTime.current=null;if(props.motion&&!previousMotion.current&&!reduced.current)scene.current?.wake();previousMotion.current=props.motion;wake();},[props.motion,wake]);
 const point=(event:ReactPointerEvent<HTMLCanvasElement>)=>{const rect=pointer.current??event.currentTarget.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top,left:rect.left,top:rect.top};};
 const toWorld=(x:number,y:number)=>({x:(x-size.current.width/2-view.current.x)/view.current.k,y:(y-size.current.height/2-view.current.y)/view.current.k});
 const hit=(x:number,y:number)=>{const p=toWorld(x,y);return scene.current?.nodes.slice().reverse().find(n=>Math.hypot(p.x-n.x,p.y-n.y)<n.r+7/view.current.k)||null;};
 const start=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
  if(event.button!==0||pointer.current)return;event.preventDefault();const p=point(event),node=hit(p.x,p.y),world=toWorld(p.x,p.y);
  pointer.current={id:event.pointerId,startX:p.x,startY:p.y,panX:view.current.x,panY:view.current.y,node,offsetX:node?node.x-world.x:0,offsetY:node?node.y-world.y:0,left:p.left,top:p.top,moved:false};
  event.currentTarget.setPointerCapture(event.pointerId);if(node)scene.current?.startDrag(node.id,node.x,node.y);setHoverId(null);wake();
 };
 const move=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
  const p=point(event),gesture=pointer.current;
  if(gesture&&gesture.id===event.pointerId){const dx=p.x-gesture.startX,dy=p.y-gesture.startY;if(Math.hypot(dx,dy)>4)gesture.moved=true;if(gesture.node&&gesture.moved){const world=toWorld(p.x,p.y);pendingDrag.current={id:gesture.node.id,x:world.x+gesture.offsetX,y:world.y+gesture.offsetY};}else if(!gesture.node){view.current.x=gesture.panX+dx;view.current.y=gesture.panY+dy;}wake();return;}
  const node=hit(p.x,p.y);if(hovered.current!==(node?.id??null)){hovered.current=node?.id??null;setHoverId(node?.id??null);wake();}event.currentTarget.style.cursor=node?'grab':'default';
  if(tooltip.current)tooltip.current.style.transform=`translate(${clamp(p.x+15,8,size.current.width-240)}px,${clamp(p.y+15,8,size.current.height-65)}px)`;
 };
 const end=(event:ReactPointerEvent<HTMLCanvasElement>,cancelled=false)=>{const gesture=pointer.current;if(!gesture||gesture.id!==event.pointerId)return;const input=pendingDrag.current;if(input)scene.current?.dragTo(input.id,input.x,input.y);pendingDrag.current=null;pointer.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);scene.current?.endDrag();if(gesture.node&&!gesture.moved&&!cancelled)latest.current.onSelect(gesture.node);wake();};
 const zoom=(factor:number)=>{view.current.k=clamp(view.current.k*factor,.25,3);wake();};
 const pin=()=>{if(props.selectedId){const pinned=scene.current?.pin(props.selectedId);setAnnouncement(pinned?'Article pinned.':'Article unpinned.');refreshPins(n=>n+1);wake();}};
 const hoverNode=props.nodes.find(n=>n.id===hoverId);
 return <div ref={host} className="classic-map" data-renderer="classic-canvas" data-node-count={props.nodes.length}>
  <canvas ref={canvas} role="img" aria-label="Wikipedia article graph. Drag balls to move their neighbours; drag the background to pan; scroll to zoom." tabIndex={0} onPointerDown={start} onPointerMove={move} onPointerUp={event=>end(event)} onPointerCancel={event=>end(event,true)} onLostPointerCapture={event=>end(event,true)} onPointerLeave={()=>{hovered.current=null;setHoverId(null);wake();}} onDoubleClick={event=>{const rect=event.currentTarget.getBoundingClientRect(),node=hit(event.clientX-rect.left,event.clientY-rect.top);if(node)props.onExplore(node.title);}} onKeyDown={event=>{if(event.key==='+'||event.key==='='){event.preventDefault();zoom(1.2);}else if(event.key==='-'){event.preventDefault();zoom(.8);}else if(event.key==='0'){event.preventDefault();fit();}}}/>
  <div ref={tooltip} className="classic-tooltip" hidden={!hoverNode}>{hoverNode&&<><strong>{hoverNode.title}</strong><span>Index {props.scores.get(hoverNode.id)??'—'} · {hoverNode.degree} connections</span></>}</div>
  <div className="classic-node-list" aria-label="Graph articles">{props.nodes.map(n=><button key={n.id} type="button" aria-pressed={n.id===props.selectedId} onClick={()=>props.onSelect(n)} onFocus={()=>{hovered.current=n.id;wake();}} onBlur={()=>{hovered.current=null;wake();}} onKeyDown={event=>{if(event.key.toLowerCase()==='e'){event.preventDefault();props.onExplore(n.title);}}}>{n.title} · Index {props.scores.get(n.id)??'insufficient evidence'}</button>)}</div>
  <div className="map-navigation" role="group" aria-label="Map controls"><button type="button" aria-label="Zoom in" title="Zoom in" onClick={()=>zoom(1.25)}><Plus size={17}/></button><button type="button" aria-label="Zoom out" title="Zoom out" onClick={()=>zoom(.8)}><Minus size={17}/></button><button type="button" aria-label="Fit map" title="Fit map" onClick={fit}><Maximize2 size={16}/></button>{props.nodes.some(n=>n.id===props.selectedId)&&<button type="button" aria-label={scene.current?.isPinned(props.selectedId!)?'Unpin article':'Pin article'} title="Pin article" aria-pressed={scene.current?.isPinned(props.selectedId!)??false} onClick={pin}><Pin size={16}/></button>}</div>
  <span className="sr-only" role="status">{announcement}</span>
 </div>;
}
