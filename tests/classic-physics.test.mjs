import test from 'node:test';
import assert from 'node:assert/strict';
import {createClassicSimulation} from '../src/classic-physics.mjs';
const input=()=>Array.from({length:20},(_,i)=>({id:String(i),articleRadius:8+i}));
const edges=()=>input().slice(1).map(n=>({source:'0',target:n.id}));
test('classic forces give the same trajectory at 60 and 120 display frames per second',()=>{
 const a=createClassicSimulation(input(),edges()),b=createClassicSimulation(input(),edges());
 for(let i=0;i<180;i++)a.tick(1000/60);for(let i=0;i<360;i++)b.tick(1000/120);
 for(let i=0;i<a.nodes.length;i++){assert.ok(Math.abs(a.nodes[i].x-b.nodes[i].x)<1e-8);assert.ok(Math.abs(a.nodes[i].y-b.nodes[i].y)<1e-8);}
});
test('reciprocal links exert one spring and keep smaller-article line scaling',()=>{
 const nodes=input(),one=edges(),a=createClassicSimulation(nodes,one),b=createClassicSimulation(nodes,[...one,...one.map(e=>({source:e.target,target:e.source}))]);
 assert.equal(b.links.length,one.length);assert.equal(b.links[0].width,.8);
 for(let i=0;i<100;i++){a.tick();b.tick();}assert.deepEqual(a.nodes,b.nodes);
});
test('dragging displaces nearby balls, pinning holds position, filtering restores coordinates',()=>{
 const s=createClassicSimulation(input(),edges()),held=s.nodes[0];s.pin(held.id);const heldX=held.x,heldY=held.y;
 for(let i=0;i<30;i++)s.tick();assert.equal(held.x,heldX);assert.equal(held.y,heldY);
 const target=s.nodes[1],before={x:target.x,y:target.y};s.startDrag('2',target.x+1,target.y+1);for(let i=0;i<12;i++)s.tick();
 assert.ok(Math.hypot(target.x-before.x,target.y-before.y)>1);s.endDrag();
 const saved={x:target.x,y:target.y};s.update(input().filter(n=>n.id!=='1'),edges());s.update(input(),edges());assert.equal(s.nodes[1].x,saved.x);assert.equal(s.nodes[1].y,saved.y);
 for(let i=0;i<100;i++)s.tick(5000);for(const n of s.nodes)assert.ok(Number.isFinite(n.x)&&Number.isFinite(n.y));
});
test('a full scene settles within three seconds and stays still until interaction',()=>{
 const nodes=Array.from({length:160},(_,i)=>({id:String(i),articleRadius:8+20*Math.sqrt((i+1)/160)}));
 const s=createClassicSimulation(nodes,nodes.slice(1).map(n=>({source:'0',target:n.id})));
 for(let i=0;i<180;i++)s.tick();assert.equal(s.isActive(),false);
 const positions=s.nodes.map(n=>[n.x,n.y]);for(let i=0;i<120;i++)s.tick();assert.deepEqual(s.nodes.map(n=>[n.x,n.y]),positions);
 s.startDrag('0',s.nodes[1].x+1,s.nodes[1].y+1);assert.equal(s.isActive(),true);s.tick();s.endDrag();
});
test('the held ball follows the latest input exactly while nearby nodes continue simulating',()=>{
 const s=createClassicSimulation(input(),edges());s.startDrag('0',0,0);
 s.dragTo('0',20,30);s.dragTo('0',100,120);s.tick(1000/120);
 assert.equal(s.nodes[0].x,100);assert.equal(s.nodes[0].previousX,100);assert.equal(s.nodes[0].y,120);
 const before=s.nodes[1].x;for(let i=0;i<12;i++)s.tick();
 assert.equal(s.nodes[0].x,100);assert.equal(s.nodes[0].y,120);assert.notEqual(s.nodes[1].x,before);s.endDrag();
});

