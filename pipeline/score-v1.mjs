/** WikiLens conflict index v1. Deterministic evidence, not a truth classifier. */
export const METHOD = 'wikilens-conflict-v1';
const DAY = 86400000;
const round = value => Math.round(value * 10) / 10;
const pairKey = (a, b) => JSON.stringify([a, b].sort());
const cleanup = comment => /vandal|roskaa|roskaus|spam|test edit|testimuokkaus/i.test(comment || '');
const bot = row => row.bot === true; // Never infer bot status from a username.
const normalize = text => String(text).normalize('NFC').replace(/\s+/g, ' ').trim();

export function paragraphs(text) {
  if (typeof text !== 'string') return null;
  return new Set(text.replace(/<!--[\s\S]*?-->/g, '').split(/\n\s*\n/)
    .map(normalize).filter(p => p.length >= 80 && p.length <= 2000 && !/^(?:[|!{=*#]|\[\[(?:Tiedosto|File|Kuva|Luokka|Category):)/i.test(p)));
}

export function wikiLinks(text) {
  const links = new Set();
  const clean = String(text || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(nowiki|pre|source|syntaxhighlight|math)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  for (const match of clean.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
    const title = normalize(match[1].split('|')[0].split('#')[0].replaceAll('_', ' '));
    if (title && !/[:{}\u0000-\u001f]/.test(title) && title.length <= 250) links.add(title[0].toUpperCase() + title.slice(1));
  }
  return [...links].sort();
}

export function prepare(rows) {
  const byId = new Map();
  let duplicates = 0;
  for (const input of rows) {
    const id = Number(input.rev_id ?? input.revid), page = Number(input.page_id);
    const time = Date.parse(input.timestamp);
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(page) || page <= 0 || !Number.isFinite(time)) throw new Error('Invalid revision identity or timestamp');
    const row = {...input, rev_id:id, page_id:page, parent_id:Number(input.parent_id || 0), time,
      timestamp:new Date(time).toISOString(), user:typeof input.user === 'string' && input.user.trim() ? input.user : null,
      sha1:typeof input.sha1 === 'string' && input.sha1.trim() ? input.sha1 : null};
    const previous = byId.get(id);
    if (previous) {
      if (previous.sha1 !== row.sha1 || previous.page_id !== row.page_id || previous.timestamp !== row.timestamp || previous.parent_id !== row.parent_id || previous.user !== row.user || previous.text !== row.text) throw new Error(`Conflicting duplicate revision ${id}`);
      duplicates++; continue;
    }
    byId.set(id, row);
  }
  const revisions = [...byId.values()].sort((a,b)=>a.time-b.time || a.rev_id-b.rev_id);
  if (new Set(revisions.map(r=>r.page_id)).size > 1) throw new Error('Score one article at a time');
  return {revisions, duplicates};
}

/** A candidate needs a reciprocal event within 30 days and 3 events in that episode. */
export function qualifyEpisodes(events, windowDays = 30) {
  const pairs = new Map();
  for (const event of events) {
    if (!event.actor || !event.target || event.actor === event.target || event.bot) continue;
    const key = pairKey(event.actor,event.target);
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(event);
  }
  const qualified = new Set(); const episodes = [];
  for (const list of pairs.values()) {
    list.sort((a,b)=>a.time-b.time);
    // Fixed sliding windows avoid chaining years of isolated reversals into one dispute.
    for (let start = 0; start < list.length; start++) {
      let end = start;
      while (end < list.length && list[end].time-list[start].time <= windowDays*DAY) end++;
      const slice = list.slice(start,end);
      const revisions = new Set(slice.map(e=>e.revision));
      if (revisions.size < 3 || new Set(slice.map(e=>e.actor)).size < 2) continue;
      slice.forEach(e=>qualified.add(e));
      episodes.push({start:list[start].timestamp, end:list[end-1].timestamp, revisions:[...revisions]});
    }
  }
  return {qualified, episodes};
}

export function scoreArticle(input, options = {}) {
  const {revisions, duplicates} = prepare(input);
  if (!revisions.length) return {method:METHOD, score:null, status:'no-data', revisions:0, evidence:[], passages:[], timeline:[]};
  const seenHashes = new Map(), removed = new Map(), events = [], passageEvents = [];
  let previous = null, previousParagraphs = null, gaps = 0, missingHashes = 0, missingUsers = 0, missingText = 0, noops = 0, selfReverts = 0, exactReverts = 0, comparable = 0;
  for (let i = 0; i < revisions.length; i++) {
    const row = revisions[i];
    if (!row.sha1) missingHashes++;
    if (!row.user) missingUsers++;
    const currentParagraphs = paragraphs(row.text);
    if (!currentParagraphs) missingText++;
    const gap = previous && row.parent_id !== previous.rev_id;
    if (gap) {gaps++; seenHashes.clear(); removed.clear();}
    if (previous && !gap) comparable++;
    if (previous && !gap && row.sha1 && previous.sha1 === row.sha1) noops++;
    const restoredIndex = row.sha1 ? seenHashes.get(row.sha1) : undefined;
    if (previous && !gap && row.sha1 !== previous.sha1 && restoredIndex !== undefined && i-restoredIndex <= 100 && row.time-revisions[restoredIndex].time <= 30*DAY) {
      exactReverts++;
      const undone = revisions.slice(restoredIndex+1,i);
      const targets = [...new Set(undone.map(r=>r.user).filter(u=>u && u!==row.user))];
      if (!targets.length && row.user && undone.every(r=>r.user === row.user)) selfReverts++;
      for (const target of targets) events.push({kind:'exact', actor:row.user,target,bot:bot(row)||undone.some(r=>r.user===target && bot(r)),
        time:row.time,timestamp:row.timestamp,revision:row.rev_id,parent:previous.rev_id,restored:revisions[restoredIndex].rev_id,
        cleanup:cleanup(row.comment), weight:cleanup(row.comment)?0.25:1});
    }
    if (previous && !gap && currentParagraphs && previousParagraphs) {
      for (const text of previousParagraphs) if (!currentParagraphs.has(text)) removed.set(text,{row,parent:previous.rev_id});
      for (const text of currentParagraphs) if (!previousParagraphs.has(text)) {
        const deletion = removed.get(text);
        if (deletion && row.time-deletion.row.time <= 30*DAY && row.user && deletion.row.user && row.user!==deletion.row.user) {
          const event={kind:'passage',actor:row.user,target:deletion.row.user,bot:bot(row)||bot(deletion.row),time:row.time,timestamp:row.timestamp,
            revision:row.rev_id,parent:previous.rev_id,removedRevision:deletion.row.rev_id,text,cleanup:cleanup(row.comment),weight:cleanup(row.comment)?0.25:1};
          passageEvents.push(event);
        }
        removed.delete(text);
      }
      for (const [text, deletion] of removed) if (row.time-deletion.row.time > 30*DAY) removed.delete(text);
    } else if (!currentParagraphs) removed.clear();
    if (row.sha1) seenHashes.set(row.sha1,i);
    previous=row;previousParagraphs=currentParagraphs;
  }
  const {qualified} = qualifyEpisodes(events);
  // Passage recurrence is reported separately; an unchanged paragraph alone cannot prove opposing positions.
  const passageGroups = new Map();
  for (const event of passageEvents) {
    if (event.bot) continue;
    if (!passageGroups.has(event.text)) passageGroups.set(event.text,[]);
    passageGroups.get(event.text).push(event);
  }
  const passages = [...passageGroups].filter(([,list])=>new Set(list.map(e=>e.revision)).size>=2)
    .map(([text,list])=>({text,returns:list.length,first:list[0].timestamp,last:list.at(-1).timestamp,
      evidence:list.slice(-6).map(e=>({revision:e.revision,parent:e.parent,removedRevision:e.removedRevision}))}))
    .sort((a,b)=>b.returns-a.returns).slice(0,8);
  const byRevision = new Map();
  for (const event of qualified) if (!byRevision.has(event.revision) || byRevision.get(event.revision).weight<event.weight) byRevision.set(event.revision,event);
  const counted = [...byRevision.values()], weighted = counted.reduce((n,e)=>n+e.weight,0);
  const activeDays = new Set(counted.map(e=>e.timestamp.slice(0,10))).size;
  const participants = new Set([...qualified].flatMap(e=>[e.actor,e.target])).size;
  const components = {recurrence:1-Math.exp(-weighted/8), rate:Math.min(1,weighted/(comparable+20)/0.12), persistence:1-Math.exp(-activeDays/5), breadth:participants?1-Math.exp(-(participants-1)/3):0};
  const supported = revisions.length>=20 && comparable>=15 && missingHashes/revisions.length<=0.1 && missingUsers/revisions.length<=0.1;
  const score = supported ? round(100*(0.45*components.recurrence+0.30*components.rate+0.15*components.persistence+0.10*components.breadth)) : null;
  const timeline = new Map();
  for (const row of revisions) {const year=row.timestamp.slice(0,4);if(!timeline.has(year))timeline.set(year,{year,revisions:0,disputedRevisions:0});timeline.get(year).revisions++;}
  counted.forEach(e=>timeline.get(e.timestamp.slice(0,4)).disputedRevisions++);
  const evidence = counted.slice().sort((a,b)=>b.time-a.time).slice(0,30).map(({revision,parent,restored,timestamp,cleanup})=>({revision,parent,restored,timestamp,cleanup}));
  const last = revisions.at(-1);
  return {method:METHOD,score,status:supported?'measured':'insufficient-data',pageId:last.page_id,title:last.title,
    revisions:revisions.length,comparableTransitions:comparable,period:{from:revisions[0].timestamp,to:last.timestamp},
    disputedRevisions:counted.length,weightedDisputedRevisions:round(weighted),participants,activeDays,
    components:Object.fromEntries(Object.entries(components).map(([key,v])=>[key,round(v*100)])),
    baseline:{exactReverts,selfReverts,nonSelfExactReverts:exactReverts-selfReverts,exactRevertRate:comparable?round(100*exactReverts/comparable):null},
    coverage:{parentGaps:gaps,missingHashes,missingUsers,missingText,duplicates,noops,startsAtCreation:revisions[0].parent_id===0,source:options.source||'unspecified'},
    evidence,passages,timeline:[...timeline.values()],links:wikiLinks(last.text), latestRevision:last.rev_id,
    limitations:['Heuristic editing-conflict index, not a truth or bias score.','Exact restores only: partial rewordings and semantic disagreements can be missed.','Cleanup comments receive a discount, not a definitive vandalism label.','Public dump history may omit suppressed revisions.']};
}
