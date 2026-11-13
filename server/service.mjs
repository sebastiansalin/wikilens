import { parseTopic, language, compareSets, sample, mapLimit, ApiError } from './core.mjs';
import { getArticle, getLinks, metadata, getCrossLinks, getSitelinks, wikiRequest, searchTopics, getPageviews, pathAdjacency } from './wikipedia.mjs';
import { snapshotKey, readSnapshot, writeSnapshot, databaseNotice, databaseHealth, neighbourhood, shortestPath } from './database.mjs';
import { boundedDirectedPath } from './pathfinding.mjs';
import { historyQuery } from './history.mjs';

const memory = new Map(), inFlight = new Map();
const TTL = 60 * 60_000;

export async function buildSnapshot(title, lang, request = wikiRequest) {
  const root = await getArticle(title, lang, request);
  const [outgoing, incomingResult] = await Promise.all([
    getLinks(root.title, lang, 'outgoing', request),
    getLinks(root.title, lang, 'incoming', request).then(value => ({ value })).catch(() => ({ error: true })),
  ]);
  const incoming = incomingResult.value || { titles: [], complete: false };
  const outgoingMetadata = await metadata(outgoing.titles, lang, request);
  const outgoingArticles = [...new Map(outgoingMetadata.filter(item => item.article && item.article.id !== root.id).map(item => [item.article.id, item.article])).values()];
  const incomingMetadata = await metadata(sample(incoming.titles, 35), lang, request);
  const incomingArticles = [...new Map(incomingMetadata.filter(item => item.article && item.article.id !== root.id).map(item => [item.article.id, item.article])).values()];
  const outIds = new Set(outgoingArticles.map(article => article.id));
  const inIds = new Set(incomingArticles.map(article => article.id));
  const incomingTitles = new Set(incoming.titles);
  for (const article of outgoingArticles) if (incomingTitles.has(article.title)) inIds.add(article.id);
  let selected = [...new Map([...sample(outgoingArticles, 36), ...sample(incomingArticles, 12)].map(article => [article.id, article])).values()];
  const rootEdges = selected.flatMap(article => [
    ...(outIds.has(article.id) ? [{ source: root.id, target: article.id }] : []),
    ...(inIds.has(article.id) ? [{ source: article.id, target: root.id }] : []),
  ]);
  const notices = [];
  let crossLinks = [];
  try { crossLinks = await getCrossLinks(selected, lang, request); }
  catch { notices.push('Some connections between neighbouring articles could not be loaded.'); }
  try {
    const views = await getPageviews(selected, lang, request);
    selected = selected.map(article => ({ ...article, ...views.get(article.id) }));
  } catch { notices.push('Some readership statistics are unavailable; use observed links for node sizing.'); }
  if (!outgoing.complete) notices.push('Outgoing links are capped at 500; the count is a lower bound.');
  if (!incoming.complete) notices.push(incomingResult.error ? 'Backlinks could not be loaded; the incoming count is unavailable.' : 'Backlinks are capped at 500; the count is a lower bound.');
  const concepts = [...new Map(outgoingArticles.filter(article => article.qid && article.qid !== root.qid).map(article => [article.qid, { qid: article.qid, title: article.title }])).values()];
  const missingMappings = outgoingMetadata.filter(item => !item.article?.qid).length;
  if (missingMappings) notices.push(`${missingMappings} outgoing targets have no resolved Wikidata concept and are excluded from similarity.`);
  const allArticles = [...new Map([...outgoingArticles, ...incomingArticles, ...selected].map(article => [article.id, article])).values()];
  return {
    graph: {
      root, nodes: [{ ...root, root: true, group: 0 }, ...selected.map(article => ({ ...article, group: outIds.has(article.id) && inIds.has(article.id) ? 3 : outIds.has(article.id) ? 1 : 2, direction: outIds.has(article.id) && inIds.has(article.id) ? 'both' : outIds.has(article.id) ? 'outgoing' : 'incoming' }))],
      links: [...new Map([...rootEdges, ...crossLinks].map(link => [`${link.source}>${link.target}`, link])).values()],
      stats: { outgoing: outgoing.titles.length, incoming: incoming.titles.length, outgoingComplete: outgoing.complete, incomingComplete: incoming.complete, incomingAvailable: !incomingResult.error, mapped: concepts.length },
      fetchedAt: new Date().toISOString(), source: 'wikipedia', notices,
    },
    concepts, conceptsComplete: outgoing.complete && missingMappings === 0,
    allArticles, allLinks: [ ...outgoingArticles.map(article => ({ source: root.id, target: article.id })), ...allArticles.filter(article => inIds.has(article.id)).map(article => ({ source: article.id, target: root.id })) ],
  };
}

export async function getSnapshot(title, lang) {
  const key = snapshotKey(lang, title);
  const entry = memory.get(key);
  if (entry?.expires > Date.now()) return structuredClone(entry.data);
  if (inFlight.has(key)) return inFlight.get(key).then(structuredClone);
  const job = (async () => {
    let snapshot = await readSnapshot(key);
    if (!snapshot) {
      snapshot = await buildSnapshot(title, lang);
      const persisted = await writeSnapshot(key, snapshot);
      if (persisted) snapshot = (await readSnapshot(key)) || snapshot;
    }
    const warning = databaseNotice();
    if (warning && !snapshot.graph.notices.includes(warning)) snapshot.graph.notices.push(warning);
    if (memory.size >= 60) memory.delete(memory.keys().next().value);
    memory.set(key, { data: snapshot, expires: Date.now() + TTL });
    return structuredClone(snapshot);
  })();
  inFlight.set(key, job);
  try { return await job; } finally { inFlight.delete(key); }
}

export function directionalGraph(graph, direction = 'both') {
  if (!['incoming', 'outgoing', 'both'].includes(direction)) throw new ApiError('Choose incoming, outgoing, or both link directions.');
  if (direction === 'both') return graph;
  const nodes = graph.nodes.filter(node => node.root || node.direction === direction || node.direction === 'both');
  const nodeIds = new Set(nodes.map(node => node.id));
  return { ...graph, nodes, links: graph.links.filter(link => nodeIds.has(link.source) && nodeIds.has(link.target) && (direction === 'outgoing' ? link.target !== graph.root.id : link.source !== graph.root.id)) };
}

export async function resolveTopic(value, languageCode = 'en', sitelinksFor = getSitelinks) {
  const topic = parseTopic(value, languageCode);
  if (!/^Q\d+$/.test(topic.title)) return topic;
  const qid = topic.title;
  const sitelinks = await sitelinksFor(qid);
  const title = sitelinks[`${topic.lang}wiki`]?.title;
  if (!title) throw new ApiError('This concept has no corresponding article in the selected language.', 404);
  return { title, lang: topic.lang, qid };
}

export async function graphQuery(params, dependencies = {}) {
  const { title, lang, qid } = await resolveTopic(params.get('title'), params.get('lang') || 'en', dependencies.getSitelinks || getSitelinks);
  const direction = params.get('direction') || 'both';
  if (!['incoming', 'outgoing', 'both'].includes(direction)) throw new ApiError('Choose incoming, outgoing, or both link directions.');
  const graph = (await (dependencies.getSnapshot || getSnapshot)(title, lang)).graph;
  if (qid && graph.root.qid !== qid) throw new ApiError('The language article resolves to a different concept.', 404);
  return directionalGraph(graph, direction);
}

export async function articleQuery(params, dependencies = {}) {
  const { title, lang, qid } = await resolveTopic(params.get('title'), params.get('lang') || 'en', dependencies.getSitelinks || getSitelinks);
  const article = await (dependencies.getArticle || getArticle)(title, lang);
  if (qid && article.qid !== qid) throw new ApiError('The language article resolves to a different concept.', 404);
  return { article };
}

export async function neighbourhoodQuery(params, dependencies = {}) {
  const depthValue = params.get('depth') || '2';
  if (!/^[1-3]$/.test(depthValue)) throw new ApiError('Choose a neighbourhood depth from 1 to 3.');
  const direction = params.get('direction') || 'both';
  if (!['incoming', 'outgoing', 'both'].includes(direction)) throw new ApiError('Choose incoming, outgoing, or both link directions.');
  // Fail explicitly before making Wikimedia requests; browser mode cannot pretend to do SQL analysis.
  const health = await (dependencies.databaseHealth || databaseHealth)();
  if (health.database !== 'connected') throw new ApiError('MariaDB is not connected. The observed-neighbourhood query requires a configured database.', 503);
  const { title, lang, qid } = await resolveTopic(params.get('title'), params.get('lang') || 'en', dependencies.getSitelinks || getSitelinks);
  const snapshot = await (dependencies.getSnapshot || getSnapshot)(title, lang);
  if (qid && snapshot.graph.root.qid !== qid) throw new ApiError('The language article resolves to a different concept.', 404);
  try {
    // A process cache can predate database setup; persist its real observation before querying SQL.
    if (snapshot.graph.source !== 'mariadb') {
      const stored = await (dependencies.writeSnapshot || writeSnapshot)(snapshotKey(lang, title), snapshot);
      if (!stored) throw new Error('Could not persist the observation.');
    }
    const result = await (dependencies.neighbourhood || neighbourhood)(snapshot.graph.root, { depth: Number(depthValue), direction });
    return { ...snapshot.graph, ...result, source: 'mariadb', notices: [...(snapshot.graph.notices || []),
      'This SQL neighbourhood contains only fresh observations already imported into WikiLens. Expand other articles to grow coverage; missing paths do not imply no Wikipedia connection.',
      'Traversal keeps at most 24 neighbours per frontier and 160 articles; root link statistics refer to the original Wikipedia observation.',
    ] };
  } catch {
    throw new ApiError('MariaDB could not complete the bounded neighbourhood query. Try a smaller depth or check the database connection.', 503);
  }
}

function cachedAdjacency(article, direction) {
  // Existing graph snapshots collect direct backlinks only. Path search also follows backlinks
  // through redirect aliases, so query that reverse frontier with its own bounded generator.
  if (direction === 'incoming') return null;
  const snapshot = [...memory.values()].find(entry => entry.expires > Date.now() && entry.data.graph.root.id === article.id)?.data;
  if (!snapshot) return null;
  const links = [...new Map([...(snapshot.allLinks || []), ...snapshot.graph.links]
    .filter(link => direction === 'outgoing' ? link.source === article.id : link.target === article.id)
    .map(link => [`${link.source}>${link.target}`, link])).values()];
  const count = direction === 'outgoing' ? snapshot.graph.stats.outgoing : snapshot.graph.stats.incoming;
  const complete = (direction === 'outgoing' ? snapshot.graph.stats.outgoingComplete : snapshot.graph.stats.incomingComplete && snapshot.graph.stats.incomingAvailable !== false) && links.length >= count;
  return { articles: [snapshot.graph.root, ...snapshot.allArticles, ...snapshot.graph.nodes], links, complete };
}

export async function wikipediaShortestPath(from, to, { maxDepth = 6 } = {}, dependencies = {}) {
  let requests = 0;
  const cached = dependencies.cachedAdjacency || cachedAdjacency;
  const read = dependencies.pathAdjacency || pathAdjacency;
  const result = await boundedDirectedPath(from, to, async (frontier, direction) => {
    const articles = new Map(), links = new Map();
    let complete = true, stop = false;
    for (const article of frontier) {
      let adjacency = cached(article, direction);
      if (!adjacency) {
        if (requests >= 12) { complete = false; stop = true; break; }
        requests++;
        adjacency = await read(article, direction);
      }
      complete = complete && adjacency.complete;
      for (const neighbour of adjacency.articles) articles.set(neighbour.id, neighbour);
      for (const link of adjacency.links) links.set(`${link.source}>${link.target}`, link);
      if (articles.size >= 1500) { complete = false; stop = true; break; }
    }
    return { articles: [...articles.values()], links: [...links.values()], complete, stop,
      ...(!complete ? { notice: 'Some Wikipedia link lists or search frontiers were sampled; a shorter route may exist outside the observed links.' } : {}),
    };
  }, { maxDepth, maxVisited: 1500, engine: 'wikipedia-bounded-bfs', scope: 'Bounded live Wikipedia article links and backlinks, including one redirect level, with cached outgoing observations' });
  result.notices.push(`Used ${requests} of 12 additional Wikimedia adjacency requests; at most 1,500 articles are admitted.`);
  result.notices.push('This searches article links in one language. It does not claim to search every link or every redirect in Wikipedia.');
  return result;
}

export async function pathQuery(params, dependencies = {}) {
  const maxDepthValue = params.get('maxDepth') || '6';
  if (!/^[1-6]$/.test(maxDepthValue)) throw new ApiError('Choose a maximum path depth from 1 to 6.');
  const lang = language(params.get('lang') || 'en');
  const fromTopic = parseTopic(params.get('from'), lang), toTopic = parseTopic(params.get('to'), lang);
  if (fromTopic.lang !== toTopic.lang) throw new ApiError('Choose source and destination in the same Wikipedia language.');
  const [fromResult, toResult] = await Promise.all([
    articleQuery(new URLSearchParams({ title: fromTopic.title, lang: fromTopic.lang }), dependencies),
    articleQuery(new URLSearchParams({ title: toTopic.title, lang: toTopic.lang }), dependencies),
  ]);
  const from = fromResult.article, to = toResult.article;
  const health = await (dependencies.databaseHealth || databaseHealth)();
  if (health.database === 'connected') {
    try { return await (dependencies.shortestPath || shortestPath)(from, to, { maxDepth: Number(maxDepthValue) }); }
    catch { throw new ApiError('MariaDB could not complete the bounded path search. Try fewer hops or check the database connection.', 503); }
  }
  const result = await (dependencies.wikipediaShortestPath || wikipediaShortestPath)(from, to, { maxDepth: Number(maxDepthValue) });
  if (health.database === 'unavailable') result.notices.push('MariaDB is unavailable; this result used the explicit live Wikipedia path search.');
  return result;
}

export async function compareQuery(params, dependencies = {}) {
  const read = dependencies.getSnapshot || getSnapshot;
  const sitelinksFor = dependencies.getSitelinks || getSitelinks;
  const { title, lang, qid } = await resolveTopic(params.get('title'), params.get('lang') || 'en', sitelinksFor);
  const languages = [...new Set((params.get('languages') || 'en,ru,uk').split(',').map(value => language(value.trim())))];
  if (languages.length < 2 || languages.length > 4) throw new ApiError('Compare between two and four languages.');
  const original = await read(title, lang);
  if (qid && original.graph.root.qid !== qid) throw new ApiError('The language article resolves to a different concept.', 404);
  const sitelinks = await sitelinksFor(original.graph.root.qid);
  const snapshots = new Map();
  const editions = await mapLimit(languages, 2, async selectedLanguage => {
    const localTitle = selectedLanguage === lang ? original.graph.root.title : sitelinks[`${selectedLanguage}wiki`]?.title;
    if (!localTitle) return { lang: selectedLanguage, article: null, graph: null, error: original.graph.root.qid ? 'No corresponding article is linked in Wikidata.' : 'This article has no Wikidata identifier for language matching.' };
    try {
      const snapshot = selectedLanguage === lang ? original : await read(localTitle, selectedLanguage);
      // Sitelinks occasionally point to redirects/merged articles: only compare the verified same concept.
      if (snapshot.graph.root.qid !== original.graph.root.qid) return { lang: selectedLanguage, article: snapshot.graph.root, graph: null, error: 'The language edition resolves to a different concept and was excluded.' };
      snapshots.set(selectedLanguage, snapshot);
      return { lang: selectedLanguage, article: snapshot.graph.root, graph: snapshot.graph };
    } catch (error) { return { lang: selectedLanguage, article: null, graph: null, error: error instanceof ApiError ? error.message : 'This edition could not be loaded.' }; }
  });
  const pairs = [];
  for (let a = 0; a < languages.length; a++) for (let b = a + 1; b < languages.length; b++) {
    const left = snapshots.get(languages[a]), right = snapshots.get(languages[b]);
    const scores = left && right ? compareSets(left.concepts.map(item => item.qid), right.concepts.map(item => item.qid)) : { score: null, shared: 0, union: 0, uniqueA: 0, uniqueB: 0 };
    pairs.push({ a: languages[a], b: languages[b], ...scores, complete: Boolean(left?.conceptsComplete && right?.conceptsComplete) });
  }
  const allConcepts = new Map();
  for (const [editionLanguage, snapshot] of snapshots) for (const concept of snapshot.concepts) {
    const row = allConcepts.get(concept.qid) || { ...concept, languages: [] };
    row.languages.push(editionLanguage); allConcepts.set(concept.qid, row);
  }
  return { editions, pairs, sharedConcepts: [...allConcepts.values()].filter(concept => concept.languages.length > 1).sort((a, b) => b.languages.length - a.languages.length || a.title.localeCompare(b.title)),
    method: 'Connection similarity = 100 * shared outgoing Wikidata concepts / distinct outgoing concepts across the pair (Jaccard). Each edition is capped at 500 main-namespace outgoing links, including template/navigation links. Redirects are resolved; missing/unmapped targets and the root concept are excluded. Partial or unmapped sets are labelled incomplete. Incoming counts are direct non-redirect article backlinks, capped at 500. Article length is wikitext bytes, not translated word count. This measures connection overlap, not truth, agreement, bias, or sentiment.' };
}

export async function dispatch(path, params) {
  if (path === 'health') return { ...await databaseHealth(), provider: 'Wikimedia Action API', attribution: 'Wikipedia contributors, CC BY-SA 4.0; Wikidata structured data, CC0', linkCap: 500 };
  if (path === 'search') {
    const q = params.get('q') || '', lang = language(params.get('lang') || 'en');
    if (/^Q\d+$/.test(q.trim()) || /^https?:\/\//i.test(q.trim())) {
      const topic = await resolveTopic(q, lang);
      return searchTopics(topic.title, topic.lang);
    }
    return searchTopics(q, lang);
  }
  if (path === 'graph') return graphQuery(params);
  if (path === 'article') return articleQuery(params);
  if (path === 'compare') return compareQuery(params);
  if (path === 'neighbourhood') return neighbourhoodQuery(params);
  if (path === 'path') return pathQuery(params);
  if (path === 'history') return historyQuery(params);
  throw new ApiError('Endpoint not found.', 404);
}
