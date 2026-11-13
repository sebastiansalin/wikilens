'use strict';
const $ = id => document.getElementById(id);
const canvas = $('graph'), ctx = canvas.getContext('2d');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = { nodes: [], edges: [], selected: null, mode: 'intensity', date: '2026-10-01', days: 0,
  zoom: 1, panX: 0, panY: 0, motion: !reduced, hot: false, query: '', dragging: null, hover: null, data: null };
let width = 500, height = 500, pixelRatio = 1, graphRequest = 0, detailRequest = 0, dateTimer, toastTimer;
const fmt = n => Number(n).toLocaleString('en-US');
function element(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4000); }
function mix(a,b,t) { return a.map((v,i) => Math.round(v+(b[i]-v)*t)); }
function color(n) {
  if (!n.enoughData) return '#6e8191';
  const t = state.mode === 'volume' ? Math.min(1,Math.log1p(n.historicalVolume)/Math.log1p(100000)) : Math.min(1,n.score/4);
  const rgb = t < .5 ? mix([104,207,145],[216,182,93],t*2) : mix([216,182,93],[241,96,85],(t-.5)*2);
  return `rgb(${rgb.join(',')})`;
}
function metric(n) { return state.mode === 'volume' ? fmt(n.historicalVolume) : `${n.score.toFixed(1)}%`; }
function shown(n) { return !state.hot || n.veryControversial; }
function matches(n) { return !state.query || n.title.toLocaleLowerCase().includes(state.query.toLocaleLowerCase()); }
function resize() {
  const r = canvas.getBoundingClientRect(); width = r.width; height = r.height;
  pixelRatio = Math.min(devicePixelRatio || 1, 2); canvas.width = width*pixelRatio; canvas.height = height*pixelRatio;
}
new ResizeObserver(resize).observe(canvas);

async function fetchJSON(url) {
  const r = await fetch(url); const body = await r.json(); if (!r.ok) throw Error(body.error || 'Request failed'); return body;
}
function params() { return new URLSearchParams({date:state.date,days:state.days}); }
async function loadGraph() {
  const request = ++graphRequest;
  $('graphStatus').hidden = false; $('graphStatus').replaceChildren(element('span','loader'),element('strong','', 'Reading the revision record'),element('p','','Querying MariaDB historical states…'));
  try {
    const data = await fetchJSON(`/api/graph?${params()}`);
    if (request !== graphRequest) return;
    const old = new Map(state.nodes.map(n => [n.id,n]));
    state.data = data;
    const maxBytes = Math.max(1,...data.nodes.map(n=>n.sizeBytes));
    state.nodes = data.nodes.map((n,i) => {
      const prior = old.get(n.id), angle = i*2.399963;
      const distance = 48*Math.sqrt(i+1);
      return {...n, x:prior?.x ?? Math.cos(angle)*distance, y:prior?.y ?? Math.sin(angle)*distance,
        vx:0,vy:0,r:8+20*Math.sqrt(n.sizeBytes/maxBytes)};
    });
    const byId = new Map(state.nodes.map(n=>[n.id,n]));
    state.edges = data.edges.map(e=>({source:byId.get(e.source),target:byId.get(e.target)}));
    $('connection').textContent = `MariaDB ${data.meta.mariadbVersion.split('-')[0]} · connected`;
    $('sampleInfo').textContent = `${data.meta.pages} selected articles · ${fmt(data.meta.revisions)} revisions. Snapshot: 01 Oct 2026.`;
    $('nodeCount').textContent = data.nodes.length; $('edgeCount').textContent = data.edges.length;
    const d = new Date(`${state.date}T00:00:00Z`);
    $('dateLabel').textContent = d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).toUpperCase();
    $('graphStatus').hidden = data.nodes.length>0;
    if (!data.nodes.length) $('graphStatus').replaceChildren(element('strong','','No sampled articles at this date'));
    renderRanking();
    if (state.selected && byId.has(state.selected)) selectNode(state.selected);
    else if (state.selected) { state.selected=null; $('detail').replaceChildren(element('p','detail-note','This article did not yet exist at the selected date. Choose another node.')); }
  } catch (e) {
    if (request !== graphRequest) return;
    $('connection').textContent = 'Database unavailable';
    $('graphStatus').hidden = false;
    $('graphStatus').replaceChildren(element('strong','','Unable to load the graph'),element('p','',e.message));
    toast('Could not load data. Confirm MariaDB and the backend are running.');
  }
}
function renderRanking() {
  const nodes = state.nodes.filter(n=>shown(n)&&matches(n)).sort((a,b)=> state.mode==='volume' ? b.historicalVolume-a.historicalVolume : b.score-a.score);
  $('listCount').textContent = nodes.length; $('ranking').replaceChildren();
  for (const n of nodes) {
    const row = element('button',`rank${state.selected===n.id?' selected':''}`); row.setAttribute('aria-label',`${n.title}, ${metric(n)}${n.enoughData?'':', insufficient data'}`);
    row.setAttribute('aria-pressed',String(state.selected===n.id));
    const dot=element('i','dot'); dot.style.setProperty('--c',color(n));
    row.append(dot,element('span','name',n.title),element('span','metric',n.enoughData?metric(n):'—'));
    row.onclick=()=>{selectNode(n.id);state.panX=-n.x*state.zoom;state.panY=-n.y*state.zoom;};
    $('ranking').append(row);
  }
  if (!nodes.length) $('ranking').append(element('p','detail-note','No articles match these filters.'));
}
function statCard(value,label) { const d=element('div');d.append(element('strong','',fmt(value)),element('span','',label));return d; }
async function selectNode(id) {
  const n=state.nodes.find(n=>n.id===id); if (!n) return;
  state.selected=id; renderRanking(); $('inspector').classList.add('open');
  const request=++detailRequest;
  $('detail').replaceChildren(element('h2','article-name',n.title),element('p','detail-note','Loading revision evidence…'));
  try {
    const d=await fetchJSON(`/api/article?${params()}&id=${id}`); if(request!==detailRequest)return;
    const root=$('detail');root.replaceChildren(element('h2','article-name',n.title));
    const link=element('a','article-link','Read this Wikipedia revision ↗');link.href=`https://fi.wikipedia.org/?oldid=${n.revId}`;link.target='_blank';link.rel='noreferrer';root.append(link);
    const card=element('section','score-card');card.style.setProperty('--score',color(n));
    const top=element('div','score-top');top.append(element('span','',state.mode==='volume'?'HISTORICAL CONFLICT VOLUME':'EDIT-CONFLICT INTENSITY'),element('span','',n.veryControversial?'♨ HOTSPOT':'◉ OBSERVED'));
    const big=element('div','big-score',n.enoughData?metric(n):'—');
    card.append(top,big,element('p','',n.enoughData ? `${fmt(n.mutual)} mutual-reversal events among ${fmt(n.edits)} revisions in this window.` : `Only ${n.edits} revisions in this window. Insufficient observations for a confident color.`));root.append(card);
    const stats=element('div','stat-grid');stats.append(statCard(n.reverts,'EXACT RESTORATIONS'),statCard(n.participants,'MUTUAL PARTICIPANTS'),statCard(n.edits,'REVISIONS IN WINDOW'),statCard(Math.round(n.sizeBytes/1024),'WIKITEXT SIZE / KB'));root.append(stats);
    const heading=element('div','detail-heading');heading.append(element('h3','','THE EDITING RECORD'),element('span','','Monthly activity'));root.append(heading);
    const spark=element('div','spark'); const buckets=new Map();
    // Quarterly bins include quiet periods, avoiding a misleading equal-width active-month chart.
    for(const t of d.timeline){const key=t.month.slice(0,4)+'-'+Math.floor((Number(t.month.slice(5))-1)/3);const v=buckets.get(key)||{edits:0,reverts:0};v.edits+=t.edits;v.reverts+=t.reverts;buckets.set(key,v);}
    const first=d.timeline.length?Number(d.timeline[0].month.slice(0,4)):2004,last=Number(state.date.slice(0,4));
    const max=Math.max(1,...[...buckets.values()].map(v=>v.edits));
    for(let year=first;year<=last;year++)for(let q=0;q<4;q++){if(year===last&&q>Math.floor((Number(state.date.slice(5,7))-1)/3))continue;const v=buckets.get(`${year}-${q}`)||{edits:0,reverts:0};const bar=element('i');bar.style.height=`${Math.max(1,v.edits/max*100)}%`;bar.title=`${year} Q${q+1}: ${v.edits} edits, ${v.reverts} restorations in selected window`;const red=element('b');red.style.height=`${v.reverts/Math.max(1,v.edits)*100}%`;bar.append(red);spark.append(bar);}
    root.append(spark); const labels=element('div','spark-labels');labels.append(element('span','',first),element('span','','Red: restorations in window'),element('span','',last));root.append(labels);
    const evidenceHeading=element('div','detail-heading');evidenceHeading.append(element('h3','','REVISION EVIDENCE'),element('span','',`${d.stats.reverts} events`));root.append(evidenceHeading);
    root.append(element('p','detail-note','Mutual events first, then newest. Attribution identifies the preceding editor; a restoration may undo several edits.'));
    for(const e of d.events){
      const item=element('article','event');const meta=element('div','event-meta');meta.append(element('span','',e.timestamp.slice(0,10)),element('span',`tag${e.mutual?' mutual':''}`,e.mutual?'MUTUAL REVERSAL':'RESTORATION'));item.append(meta);
      item.append(element('p','',`${e.actor} restored earlier text after ${e.target}’s revision.`));
      if(e.comment)item.append(element('p','',e.comment.slice(0,220)));
      const a=element('a','','Inspect exact Wikipedia diff ↗');a.href=`https://fi.wikipedia.org/w/index.php?diff=${e.rev_id}&oldid=${e.reverted_rev_id}`;a.target='_blank';a.rel='noreferrer';item.append(a);
      const diff=element('details');diff.append(element('summary','','Show text change'),element('pre','',e.diff||'No line-level preview available.'));item.append(diff);root.append(item);
    }
    if(!d.events.length)root.append(element('p','no-events','No exact cross-editor restorations detected in this window. Partial reversals and discussion disputes are not captured.'));
    if(d.article){const excerpt=element('details');excerpt.style.marginTop='25px';excerpt.append(element('summary','detail-note',`Article excerpt · ${d.article.date.slice(0,10)} revision (raw markup)`),element('pre','excerpt',d.article.excerpt));root.append(excerpt);}
  }catch(e){if(request===detailRequest)$('detail').append(element('p','detail-note',`Evidence unavailable: ${e.message}`));}
}

function simulate(){
  const nodes=state.nodes.filter(shown), active=state.motion||state.dragging;
  if(!active)return;
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
    const a=nodes[i],b=nodes[j];let dx=b.x-a.x,dy=b.y-a.y;let ds=dx*dx+dy*dy;
    if(ds<.01){dx=.2;dy=.1;ds=.05;}const dist=Math.sqrt(ds),min=a.r+b.r+20;
    // Soft electrostatic repulsion plus a stronger collision cushion near a dragged ball.
    const force=Math.min(3,2100/(ds+180))+(dist<min?(min-dist)*.04:0);
    const fx=dx/dist*force,fy=dy/dist*force;a.vx-=fx;a.vy-=fy;b.vx+=fx;b.vy+=fy;
  }
  const seen=new Set();
  for(const e of state.edges){const a=e.source,b=e.target;if(!shown(a)||!shown(b))continue;const key=[a.id,b.id].sort((a,b)=>a-b).join(':');if(seen.has(key))continue;seen.add(key);
    const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||1;const f=(dist-155)*.0009;a.vx+=dx/dist*f;a.vy+=dy/dist*f;b.vx-=dx/dist*f;b.vy-=dy/dist*f;}
  for(const n of nodes){if(state.dragging===n){n.vx=n.vy=0;continue;}n.vx=(n.vx-n.x*.00045)*.86;n.vy=(n.vy-n.y*.00045)*.86;n.x+=Math.max(-7,Math.min(7,n.vx));n.y+=Math.max(-7,Math.min(7,n.vy));}
}
function screen(n){return{x:width/2+state.panX+n.x*state.zoom,y:height/2+state.panY+n.y*state.zoom};}
function world(x,y){return{x:(x-width/2-state.panX)/state.zoom,y:(y-height/2-state.panY)/state.zoom};}
function hit(x,y){return state.nodes.filter(shown).slice().reverse().find(n=>{const p=screen(n);return Math.hypot(x-p.x,y-p.y)<n.r*state.zoom+7;});}
function flame(n,time){
  const phase=state.motion&&!reduced?time*.003:0;
  for(let i=0;i<5;i++){
    const angle=i*Math.PI*2/5+Math.sin(phase*.25)*.12;
    const size=Math.min(8,n.r*.38),r=n.r+5+Math.sin(phase+i)*1.5;
    ctx.save();ctx.rotate(angle);ctx.translate(0,-r);ctx.rotate(Math.sin(phase+i)*.15);
    const gradient=ctx.createLinearGradient(0,0,0,-size*1.8);gradient.addColorStop(0,'#ff7132');gradient.addColorStop(.5,'#ffc15c');gradient.addColorStop(1,'#ffe4a599');ctx.fillStyle=gradient;
    ctx.beginPath();ctx.moveTo(-size*.43,0);ctx.bezierCurveTo(-size*.8,-size*.55,size*.13,-size*.7,Math.sin(phase*1.5+i)*size*.3,-size*1.6);ctx.bezierCurveTo(size*.38,-size*.7,size*.85,-size*.2,size*.35,.2);ctx.quadraticCurveTo(0,size*.38,-size*.43,0);ctx.fill();ctx.restore();
  }
}
function draw(time){
  simulate();ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);ctx.clearRect(0,0,width,height);
  ctx.save();ctx.translate(width/2+state.panX,height/2+state.panY);ctx.scale(state.zoom,state.zoom);
  const seen=new Set();
  for(const e of state.edges){const a=e.source,b=e.target;if(!shown(a)||!shown(b))continue;
    // One visible stroke per pair; directed links remain in the API and count.
    const key=[a.id,b.id].sort((a,b)=>a-b).join(':');if(seen.has(key))continue;seen.add(key);
    const focused=a.id===state.selected||b.id===state.selected;ctx.strokeStyle=focused?'#aacbb25e':'#50697c33';ctx.lineWidth=Math.min(3.8,Math.max(.55,Math.min(a.r,b.r)*.10));
    if(state.query&&!matches(a)&&!matches(b))ctx.globalAlpha=.2;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.globalAlpha=1;
  }
  for(const n of state.nodes){if(!shown(n))continue;ctx.save();ctx.translate(n.x,n.y);const c=color(n),selected=n.id===state.selected,hovered=state.hover===n;
    ctx.globalAlpha=matches(n)?1:.19;
    if(n.veryControversial)flame(n,time);
    if(selected||hovered){ctx.strokeStyle=selected?'#d0e9d6aa':'#a3bac45c';ctx.lineWidth=1/state.zoom;ctx.beginPath();ctx.arc(0,0,n.r+8,0,Math.PI*2);ctx.stroke();}
    ctx.shadowColor=c;ctx.shadowBlur=selected?22:9;ctx.fillStyle=c;ctx.beginPath();ctx.arc(0,0,n.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    const shine=ctx.createRadialGradient(-n.r*.3,-n.r*.4,0,0,0,n.r);shine.addColorStop(0,'#ffffff30');shine.addColorStop(.6,'#ffffff00');shine.addColorStop(1,'#00000038');ctx.fillStyle=shine;ctx.fill();
    ctx.strokeStyle='#ffffff24';ctx.lineWidth=.7;ctx.stroke();
    if(state.zoom>.5||selected){ctx.font=`${selected?'600':'400'} ${selected?11:10}px 'DM Sans',sans-serif`;ctx.textAlign='center';ctx.fillStyle=selected?'#e6eee9':'#a3b8c5';ctx.shadowColor='#080e14';ctx.shadowBlur=6;const label=n.title.length>26&&!selected?n.title.slice(0,24)+'…':n.title;ctx.fillText(label,0,n.r+17);}
    ctx.restore();
  }
  ctx.restore();requestAnimationFrame(draw);
}
let pointer=null;
canvas.addEventListener('pointerdown',e=>{
  const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;const n=hit(x,y);
  pointer={id:e.pointerId,x,y,startX:x,startY:y,panX:state.panX,panY:state.panY,node:n,moved:false};state.dragging=n||null;canvas.setPointerCapture(e.pointerId);$('tooltip').hidden=true;
});
canvas.addEventListener('pointermove',e=>{
  const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  if(pointer){if(Math.hypot(x-pointer.startX,y-pointer.startY)>4)pointer.moved=true;if(pointer.node){const p=world(x,y);pointer.node.x=p.x;pointer.node.y=p.y;pointer.node.vx=pointer.node.vy=0;}else{state.panX=pointer.panX+x-pointer.startX;state.panY=pointer.panY+y-pointer.startY;}return;}
  const n=hit(x,y);state.hover=n||null;canvas.style.cursor=n?'grab':'default';const tip=$('tooltip');tip.hidden=!n;
  if(n){tip.replaceChildren(element('strong','',n.title),element('small','',`${metric(n)} · ${fmt(n.mutual)} mutual events${n.enoughData?'':' · low data'}`));tip.style.left=`${Math.max(8,Math.min(width-235,x+15))}px`;tip.style.top=`${Math.max(8,Math.min(height-70,y+15))}px`;}
});
function endPointer(e){if(!pointer)return;if(!pointer.moved&&pointer.node)selectNode(pointer.node.id);state.dragging=null;pointer=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}
canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);canvas.addEventListener('pointerleave',()=>{state.hover=null;$('tooltip').hidden=true;});
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;const before=world(x,y);state.zoom=Math.max(.25,Math.min(3,state.zoom*Math.exp(-e.deltaY*.001)));state.panX=x-width/2-before.x*state.zoom;state.panY=y-height/2-before.y*state.zoom;},{passive:false});
function zoom(factor){state.zoom=Math.max(.25,Math.min(3,state.zoom*factor));}
$('zoomIn').onclick=()=>zoom(1.2);$('zoomOut').onclick=()=>zoom(1/1.2);$('resetView').onclick=()=>{state.zoom=Math.min(1,Math.max(.45,Math.min(width,height)/650));state.panX=state.panY=0;};
$('hotOnly').onclick=()=>{state.hot=!state.hot;$('hotOnly').setAttribute('aria-pressed',state.hot);renderRanking();};
$('motion').setAttribute('aria-pressed',state.motion);$('motion').textContent=state.motion?'Ⅱ Motion':'▷ Motion';
$('motion').onclick=()=>{state.motion=!state.motion;$('motion').setAttribute('aria-pressed',state.motion);$('motion').textContent=state.motion?'Ⅱ Motion':'▷ Motion';};
function setMode(mode){state.mode=mode;$('intensityMode').classList.toggle('chosen',mode==='intensity');$('volumeMode').classList.toggle('chosen',mode==='volume');$('legendTitle').textContent=mode==='intensity'?'EDIT-CONFLICT INTENSITY':'CONFLICT VOLUME / LOG SCALE';renderRanking();if(state.selected)selectNode(state.selected);}
$('intensityMode').onclick=()=>setMode('intensity');$('volumeMode').onclick=()=>setMode('volume');
$('search').oninput=e=>{state.query=e.target.value;renderRanking();};
$('window').onchange=e=>{state.days=Number(e.target.value);loadGraph();};
$('date').oninput=e=>{clearTimeout(dateTimer);state.date=Number(e.target.value)===2026?'2026-10-01':`${e.target.value}-12-31`;dateTimer=setTimeout(loadGraph,220);};
$('methodBtn').onclick=()=>$('methodDialog').showModal();$('closeMethod').onclick=()=>$('methodDialog').close();$('methodDialog').onclick=e=>{if(e.target===$('methodDialog'))$('methodDialog').close();};
$('mapTab').onclick=()=>{$('methodDialog').close();$('resetView').click();};
$('closeDetail').onclick=()=>{$('inspector').classList.remove('open');state.selected=null;++detailRequest;renderRanking();$('detail').replaceChildren(element('p','detail-note','Select an article to inspect its revision evidence.'));};
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('search').focus();}});
resize();$('resetView').click();requestAnimationFrame(draw);loadGraph();
