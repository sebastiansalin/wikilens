// Deterministic bounded force layout. No network, global state or ongoing animation.
// This is presentation only: edges always come from the Wikipedia API.
export function layoutNodes<T extends {id:string;root?:boolean}>(input:T[],edges:{source:string;target:string}[],width:number,height:number,compact=false){
 const center={x:width/2,y:height/2};
 const nodes=input.map((n,i)=>({...n,x:center.x+Math.cos(i*2.399963)*Math.sqrt(i)*42,y:center.y+Math.sin(i*2.399963)*Math.sqrt(i)*42,vx:0,vy:0}));
 const index=new Map(nodes.map(n=>[n.id,n]));
 const links=edges.map(e=>[index.get(e.source),index.get(e.target)] as const).filter(e=>e[0]&&e[1]);
 const radius=compact?27:36;
 for(let tick=0;tick<180;tick++){
  const alpha=1-tick/200;
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
   const a=nodes[i],b=nodes[j];let dx=b.x-a.x,dy=b.y-a.y;const dist=Math.max(Math.hypot(dx,dy),.1);if(dist===.1){dx=.1;dy=.1}
   const minimum=(a.root?52:radius)+(b.root?52:radius);const force=(dist<minimum?(minimum-dist)*.12:Math.min(3,700/(dist*dist)))*alpha;
   const fx=dx/dist*force,fy=dy/dist*force;a.vx-=fx;a.vy-=fy;b.vx+=fx;b.vy+=fy;
  }
  for(const [a,b] of links){if(!a||!b)continue;const dx=b.x-a.x,dy=b.y-a.y,dist=Math.max(Math.hypot(dx,dy),1),force=(dist-(compact?105:145))*.002*alpha;a.vx+=dx/dist*force;a.vy+=dy/dist*force;b.vx-=dx/dist*force;b.vy-=dy/dist*force;}
  for(const n of nodes){if(n.root){n.x=center.x;n.y=center.y;continue}n.vx+=(center.x-n.x)*.0007*alpha;n.vy+=(center.y-n.y)*.001*alpha;n.vx*=.65;n.vy*=.65;n.x+=n.vx;n.y+=n.vy;}
 }
 const maxX=Math.max(...nodes.map(n=>Math.abs(n.x-center.x)),1),maxY=Math.max(...nodes.map(n=>Math.abs(n.y-center.y)),1);
 const sx=Math.min(1.4,(width/2-60)/maxX),sy=Math.min(1,(height/2-65)/maxY);
 nodes.forEach(n=>{n.x=center.x+(n.x-center.x)*Math.max(.35,sx);n.y=center.y+(n.y-center.y)*Math.max(.35,sy)});
 if(!compact){
  // Fitting a map can reintroduce overlaps. Resolve them in screen coordinates.
  // Very dense maps remain pannable instead of shrinking every label to illegibility.
  for(let pass=0;pass<110;pass++){
   for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
    const a=nodes[i],b=nodes[j];let dx=b.x-a.x,dy=b.y-a.y;const d=Math.max(Math.hypot(dx,dy),.1),min=(a.root?51:34)+(b.root?51:34);
    if(d<min){if(d===.1){dx=.1;dy=.1}const force=(min-d)*.48,fx=dx/d*force,fy=dy/d*force;if(!a.root){a.x-=fx*(b.root?2:1);a.y-=fy*(b.root?2:1)}if(!b.root){b.x+=fx*(a.root?2:1);b.y+=fy*(a.root?2:1)}}
   }
   if(width>600)for(const n of nodes){if(!n.root){n.x=Math.max(37,Math.min(width-37,n.x));n.y=Math.max(48,Math.min(height-65,n.y))}}
  }
 }
 return nodes;
}
