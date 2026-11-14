/** Classic magnetic forces, with wider spacing and a short, damped settling phase. */
const FRAME=1000/60;
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export function createClassicSimulation(initialNodes=[],initialLinks=[]){
 let nodes=[],links=[],byId=new Map(),dragging=null,active=true,accumulator=0,warm=30,temperature=1;
 const cache=new Map(),pinned=new Set();
 function update(input,edges){
  nodes=input.slice(0,160).map((n,i)=>{
   const old=cache.get(n.id),angle=i*2.399963,distance=84*Math.sqrt(i+1);
   const node=old?Object.assign(old,n,{r:n.articleRadius??n.r??12}):{...n,r:n.articleRadius??n.r??12,x:Math.cos(angle)*distance,y:Math.sin(angle)*distance,vx:0,vy:0};
   node.previousX=node.x;node.previousY=node.y;cache.set(n.id,node);return node;
  });
  byId=new Map(nodes.map(n=>[n.id,n]));
  const pairs=new Map();
  for(const e of edges){const a=byId.get(e.source),b=byId.get(e.target);if(!a||!b||a===b)continue;const key=JSON.stringify([a.id,b.id].sort());if(!pairs.has(key))pairs.set(key,{source:a,target:b,width:clamp(Math.min(a.r,b.r)*.10,.55,3.8)});}
  links=[...pairs.values()];
  const degrees=new Map(nodes.map(n=>[n.id,0]));for(const e of links){degrees.set(e.source.id,degrees.get(e.source.id)+1);degrees.set(e.target.id,degrees.get(e.target.id)+1);}
  for(const e of links)e.normalization=1/Math.sqrt(Math.max(1,degrees.get(e.source.id),degrees.get(e.target.id)));
  if(!byId.has(dragging))dragging=null;
  active=nodes.length>0;warm=30;temperature=1;accumulator=0;
 }
 function step(){
  for(const n of nodes){n.previousX=n.x;n.previousY=n.y;}
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
   const a=nodes[i],b=nodes[j];let dx=b.x-a.x,dy=b.y-a.y,ds=dx*dx+dy*dy;
   if(ds<.01){dx=.2;dy=.1;ds=.05;}
   const distance=Math.sqrt(ds),minimum=a.r+b.r+20;
   const force=(Math.min(3,2100/(ds+180))+(distance<minimum?(minimum-distance)*.04:0))*temperature;
   const fx=dx/distance*force,fy=dy/distance*force;a.vx-=fx;a.vy-=fy;b.vx+=fx;b.vy+=fy;
  }
  for(const {source:a,target:b,normalization} of links){const dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy)||1,force=(distance-230)*.0009*normalization*temperature;a.vx+=dx/distance*force;a.vy+=dy/distance*force;b.vx-=dx/distance*force;b.vy-=dy/distance*force;}
  let movement=0;
  for(const n of nodes){
   if(n.id===dragging||pinned.has(n.id)){n.vx=n.vy=0;continue;}
   n.vx=(n.vx-n.x*.00014*temperature)*.74;n.vy=(n.vy-n.y*.00014*temperature)*.74;
   const dx=clamp(n.vx,-7,7),dy=clamp(n.vy,-7,7);n.x+=dx;n.y+=dy;movement=Math.max(movement,Math.abs(dx),Math.abs(dy));
  }
  temperature=dragging?1:temperature*.965;
  warm=Math.max(0,warm-1);active=Boolean(dragging)||warm>0||(temperature>.004&&movement>.04);
 }
 function tick(delta=FRAME){
  if(!active)return false;
  accumulator+=clamp(Number.isFinite(delta)?delta:FRAME,0,50);
  while(accumulator+1e-8>=FRAME&&active){step();accumulator=Math.max(0,accumulator-FRAME);}
  return active;
 }
 function wake(){active=nodes.length>0;warm=30;temperature=1;}
 function dragTo(id,x,y){const n=byId.get(id);if(n&&Number.isFinite(x)&&Number.isFinite(y)){n.x=n.previousX=x;n.y=n.previousY=y;n.vx=n.vy=0;wake();}}
 update(initialNodes,initialLinks);
 return {get nodes(){return nodes;},get links(){return links;},get interpolation(){return active?Math.min(1,accumulator/FRAME):1;},
  update,tick,wake,isActive:()=>active,startDrag(id,x,y){if(byId.has(id)){dragging=id;dragTo(id,x,y);}},dragTo,
  endDrag(){dragging=null;wake();},isPinned:id=>pinned.has(id),pin(id){if(!byId.has(id))return false;if(pinned.has(id))pinned.delete(id);else pinned.add(id);wake();return pinned.has(id);},
 };
}

