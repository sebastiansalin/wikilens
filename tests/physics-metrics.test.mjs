import test from 'node:test';
import assert from 'node:assert/strict';
import { measureGraph } from '../src/graph-metrics.mjs';
import { createSimulation } from '../src/physics.mjs';

const article = (id, extra = {}) => ({ id, title: id, ...extra });
const graph = (nodes, links, root = nodes[0]?.id) => ({ root: { id: root }, nodes, links: links.map(([source,target]) => ({source,target})) });
const run = (simulation, count = 100) => { for (let tick = 0; tick < count; tick++) simulation.tick(); return simulation; };

// A hub, six dense local clusters, and cross-cluster links: representative of a
// busy Wikipedia neighbourhood, deliberately synthetic rather than product data.
function crowdedStars() {
  const nodes=Array.from({length:49},(_,index)=>article(`n${index}`));
  const links=[];
  for(let i=1;i<49;i++)links.push(['n0',`n${i}`]);
  for(let i=1;i<49;i++)for(let j=i+1;j<49;j++)if(Math.floor((i-1)/8)===Math.floor((j-1)/8)||(i+j)%11===0)links.push([`n${i}`,`n${j}`]);
  const measured=measureGraph(graph(nodes,links),{minRadius:18,maxRadius:42});
  return {nodes:measured.nodes.map(node=>({...node,collisionRadius:Math.max(10,node.radius*(node.root?0.34:0.24)+5)})),links:measured.links};
}

test('measurements deduplicate directed links and count distinct loaded-map neighbours', () => {
  const result = measureGraph(graph([article('a'),article('b'),article('c')],[['a','b'],['a','b'],['b','a'],['a','a'],['a','missing'],['b','c']]));
  assert.equal(result.links.length, 3);
  assert.equal(result.nodes.find(n=>n.id==='a').degree,1);
  assert.equal(result.nodes.find(n=>n.id==='b').degree,2);
  assert.equal(result.nodes.find(n=>n.id==='a').incomingDegree,1);
  assert.equal(result.nodes.find(n=>n.id==='a').outgoingDegree,1);
  assert.ok(result.nodes.find(n=>n.id==='b').radius > result.nodes.find(n=>n.id==='a').radius);
  assert.match(result.method.sizeDescription,/not global/);
});

test('additional walk depths reveal only observed multi-hop proximity', () => {
  const input=graph(['a','b','c','d','isolated'].map(id=>article(id)),[['a','b'],['b','c'],['c','d']]);
  const one=measureGraph(input,{depth:1}),two=measureGraph(input,{depth:2}),three=measureGraph(input,{depth:3});
  assert.equal(one.nodes.find(n=>n.id==='c').affinity,0);
  assert.ok(two.nodes.find(n=>n.id==='c').affinity>0);
  assert.equal(two.nodes.find(n=>n.id==='d').affinity,0);
  assert.ok(three.nodes.find(n=>n.id==='d').affinity>0);
  assert.equal(three.nodes.find(n=>n.id==='d').hopDistance,3);
  assert.equal(three.nodes.find(n=>n.id==='isolated').hopDistance,null);
  assert.equal(three.nodes.find(n=>n.id==='isolated').affinity,0);
  assert.ok(three.nodes.find(n=>n.id==='b').affinity>three.nodes.find(n=>n.id==='d').affinity);
});

test('real pageviews size articles monotonically and missing values fall back explicitly', () => {
  const result=measureGraph(graph([article('a',{pageviews:0}),article('b',{pageviews:100}),article('c',{pageviews:100000}),article('d',{pageviews:null})],[['a','b'],['a','c'],['a','d']]),{sizeBy:'views'});
  const [a,b,c,d]=result.nodes;
  assert.equal(a.popularitySource,'pageviews');
  assert.equal(a.popularity,0);
  assert.ok(a.radius<b.radius&&b.radius<c.radius);
  assert.equal(d.popularitySource,'map-links');
  assert.equal(d.popularity,1);
  assert.equal(result.method.measuredViews,3);
});

test('multi-hop structure tightens clusters and lengthens a bridge without fabricating edges', () => {
  const input=graph(['a','b','c','d','e','f'].map(id=>article(id)),[['a','b'],['a','c'],['b','c'],['c','d'],['d','e'],['d','f'],['e','f']]);
  const one=measureGraph(input,{depth:1}),two=measureGraph(input,{depth:2});
  const edge=(result,source,target)=>result.links.find(link=>link.source===source&&link.target===target);
  assert.ok(edge(two,'a','c').distance<edge(one,'a','c').distance);
  assert.ok(edge(two,'c','d').distance>edge(one,'c','d').distance);
  assert.equal(two.links.length,input.links.length);
  assert.equal(input.nodes[0].radius,undefined,'measurements must not mutate source article data');
});

test('measurements remain finite for empty, singleton, and malformed popularity inputs', () => {
  assert.deepEqual(measureGraph(graph([],[])).nodes,[]);
  for(const pageviews of [undefined,null,NaN,Infinity,-1]){
    const result=measureGraph(graph([article('a',{pageviews})],[]),{sizeBy:'views',depth:99});
    assert.equal(result.method.depth,3);
    assert.equal(result.nodes[0].popularitySource,'map-links');
    assert.ok(Number.isFinite(result.nodes[0].radius));
  }
});

test('dragging transmits motion through springs to first and second neighbours', () => {
  const nodes=[article('a',{radius:20,x:200,y:300}),article('b',{radius:20,x:320,y:300}),article('c',{radius:20,x:440,y:300})];
  const links=[{source:'a',target:'b',distance:120,strength:1},{source:'b',target:'c',distance:120,strength:1}];
  const dragged=run(createSimulation(nodes,links,{width:800,height:600}),120);
  const control=run(createSimulation(nodes,links,{width:800,height:600}),120);
  const a=dragged.nodes[0];
  dragged.startDrag('a',a.x,a.y);
  dragged.dragTo('a',a.x-160,a.y);
  run(dragged,60);run(control,60);
  assert.ok(control.nodes[1].x-dragged.nodes[1].x>25,'first neighbour must be pulled along');
  assert.ok(control.nodes[2].x-dragged.nodes[2].x>10,'force must propagate beyond the direct neighbour');
  const released=dragged.nodes[0].x;
  dragged.endDrag('a');run(dragged,20);
  assert.equal(dragged.nodes[0].fx,null);
  assert.ok(Math.abs(dragged.nodes[0].x-released)>2,'unpinned dragged node must move after release');
});

test('explicit pins survive forces, drag release, and graph updates', () => {
  const nodes=[article('a',{radius:30,x:200,y:200}),article('b',{radius:30,x:240,y:200})];
  const links=[{source:'a',target:'b'}];
  const simulation=createSimulation(nodes,links,{width:800,height:600});
  simulation.pin('a',true);run(simulation,80);
  assert.equal(simulation.nodes[0].x,200);assert.equal(simulation.nodes[0].y,200);
  simulation.startDrag('a',200,200);simulation.dragTo('a',150,150);simulation.endDrag('a');
  simulation.update([...nodes,article('c')],[...links,{source:'b',target:'c'}]);run(simulation,50);
  assert.equal(simulation.nodes[0].x,150);assert.equal(simulation.nodes[0].y,150);
  assert.equal(simulation.isPinned('a'),true);
  simulation.pin('a',false);run(simulation,30);
  assert.equal(simulation.nodes[0].fx,null);assert.notEqual(simulation.nodes[0].x,150);
});

test('collision separates unequal overlapping circles including exact coincident centers', () => {
  const simulation=createSimulation([article('a',{radius:47,x:300,y:300}),article('b',{radius:22,x:300,y:300})],[],{width:600,height:600,repulsion:0});
  run(simulation,50);
  const [a,b]=simulation.nodes;
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=a.radius+b.radius+6.5);
  assert.ok([a.x,a.y,b.x,b.y].every(Number.isFinite));
});

test('reciprocal and duplicate edges produce only one physical spring', () => {
  const nodes=[article('a',{x:100,y:100}),article('b',{x:400,y:300})];
  const single=run(createSimulation(nodes,[{source:'a',target:'b'}]),60);
  const duplicate=run(createSimulation(nodes,[{source:'a',target:'b'},{source:'a',target:'b'},{source:'b',target:'a'}]),60);
  assert.deepEqual(single.nodes.map(n=>[n.x,n.y]),duplicate.nodes.map(n=>[n.x,n.y]));
});

test('maximum-size graph remains bounded and finite over a long simulation and large frame gaps', () => {
  const nodes=Array.from({length:160},(_,i)=>article(`n${i}`,{radius:22+(i%6)*4}));
  const links=nodes.slice(1).map((n,i)=>({source:`n${Math.floor(i/2)}`,target:n.id,strength:.7,distance:110}));
  const simulation=createSimulation(nodes,links,{width:1000,height:650});
  run(simulation,400);simulation.reheat();simulation.tick(1000000);
  for(const n of simulation.nodes){
    assert.ok([n.x,n.y,n.vx,n.vy].every(Number.isFinite));
    assert.ok(Math.abs(n.x)<5000&&Math.abs(n.y)<5000);
  }
});

test('cooling stops idle work and reheating resumes it; destroy permanently stops work', () => {
  const simulation=createSimulation([article('a',{root:true})],[],{width:800,height:600});
  run(simulation,1000);
  assert.equal(simulation.isActive(),false);
  simulation.reheat();assert.equal(simulation.isActive(),true);
  simulation.destroy();simulation.reheat();assert.equal(simulation.tick(),false);assert.equal(simulation.isActive(),false);
});

test('a stopped pointer loses fling momentum, while graph replacement respects the 160-node bound', () => {
  const simulation=createSimulation([article('a',{x:200,y:200})],[],{width:800,height:600});
  simulation.startDrag('a',200,200);simulation.dragTo('a',400,200);run(simulation,80);
  assert.ok(Math.abs(simulation.nodes[0].vx)<0.001);
  simulation.endDrag('a');
  simulation.update(Array.from({length:180},(_,i)=>article(`n${i}`)),[]);
  assert.equal(simulation.nodes.length,160);
});

test('dense star map rests away from contact and settles without visible jitter', t => {
  const fixture=crowdedStars();
  const simulation=run(createSimulation(fixture.nodes,fixture.links,{width:1000,height:700}),160);
  let squaredMotion=0,squaredAcceleration=0,maxStep=0;
  let last=simulation.nodes.map(()=>[0,0]);
  for(let frame=0;frame<180;frame++){
    const before=simulation.nodes.map(node=>[node.x,node.y]);simulation.tick();
    simulation.nodes.forEach((node,index)=>{
      const dx=node.x-before[index][0],dy=node.y-before[index][1];
      squaredMotion+=dx*dx+dy*dy;
      if(frame>0)squaredAcceleration+=(dx-last[index][0])**2+(dy-last[index][1])**2;
      maxStep=Math.max(maxStep,Math.hypot(dx,dy));last[index]=[dx,dy];
    });
  }
  run(simulation,300);
  const ratios=simulation.nodes.map(a=>Math.min(...simulation.nodes.filter(b=>b!==a).map(b=>Math.hypot(a.x-b.x,a.y-b.y)/(a.collisionRadius+b.collisionRadius+7)))).sort((a,b)=>a-b);
  const rmsMotion=Math.sqrt(squaredMotion/(180*49)),rmsAcceleration=Math.sqrt(squaredAcceleration/(179*49));
  assert.ok(rmsMotion<0.08,`RMS motion ${rmsMotion} must remain subpixel`);
  assert.ok(rmsAcceleration<0.01,`RMS acceleration ${rmsAcceleration} indicates contact jitter`);
  assert.ok(maxStep<0.3,`Unexpected visible jump of ${maxStep}px`);
  assert.ok(ratios[0]>1.15,'Every star should have clearance beyond its collider');
  assert.ok(ratios[24]>1.35,'Most stars must be positioned by force equilibrium, not collision contact');
  assert.equal(simulation.isActive(),false);
  t.diagnostic(JSON.stringify({rmsMotion,rmsAcceleration,maxStep,minimumClearanceRatio:ratios[0],medianClearanceRatio:ratios[24]}));
});

test('fixed integration gives equivalent layouts at 30, 60, 144 Hz and irregular frame intervals', () => {
  const fixture=crowdedStars(),results=[];
  for(const frequency of [30,60,144]){
    const simulation=createSimulation(fixture.nodes,fixture.links,{width:1000,height:700});
    for(let frame=0;frame<frequency*3;frame++)simulation.tick(1000/frequency);
    results.push(simulation.nodes.map(node=>[node.x,node.y]));
  }
  const irregular=createSimulation(fixture.nodes,fixture.links,{width:1000,height:700});
  for(let cycle=0;cycle<30;cycle++)for(const duration of [5,12,22,8,37,16])irregular.tick(duration);
  results.push(irregular.nodes.map(node=>[node.x,node.y]));
  for(const result of results.slice(1))for(let index=0;index<result.length;index++)assert.ok(Math.hypot(result[index][0]-results[0][index][0],result[index][1]-results[0][index][1])<1e-8);
});

test('spacing changes spread a settled map gently; metadata-only updates do not reheat it', () => {
  const fixture=crowdedStars();
  const simulation=run(createSimulation(fixture.nodes,fixture.links,{width:1000,height:700}),600);
  const averageLinkDistance=()=>{
    const lookup=new Map(simulation.nodes.map(node=>[node.id,node]));
    return fixture.links.reduce((total,edge)=>{
      const a=lookup.get(edge.source),b=lookup.get(edge.target);return total+Math.hypot(a.x-b.x,a.y-b.y);
    },0)/fixture.links.length;
  };
  assert.equal(simulation.isActive(),false);
  simulation.update(fixture.nodes.map(node=>({...node,title:`Updated ${node.title}`})),fixture.links);
  assert.equal(simulation.isActive(),false,'Changing metadata should not disturb the map');
  const beforeDistance=averageLinkDistance(),before=simulation.nodes.map(node=>[node.x,node.y]);
  simulation.update(fixture.nodes,fixture.links.map(edge=>({...edge,distance:edge.distance*2})));
  assert.deepEqual(simulation.nodes.map(node=>[node.x,node.y]),before,'Changing spacing must not teleport nodes');
  simulation.tick();
  assert.ok(Math.max(...simulation.nodes.map((node,index)=>Math.hypot(node.x-before[index][0],node.y-before[index][1])))<0.2);
  run(simulation,600);
  assert.ok(averageLinkDistance()>beforeDistance*1.2,'Spacing must make a material geometric difference');
  assert.equal(simulation.isActive(),false);
});

test('collision pressure resolves overlap through bounded velocity without positional kicks', () => {
  const simulation=createSimulation([article('a',{radius:30,x:300,y:300}),article('b',{radius:30,x:300,y:300})],[],{width:600,height:600,repulsion:0});
  simulation.tick(1000/120);
  for(const node of simulation.nodes)assert.ok(Math.hypot(node.x-300,node.y-300)<1,'One step must not project overlapping circles apart');
  run(simulation,120);
  const [a,b]=simulation.nodes;
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>a.radius+b.radius+6);
});
