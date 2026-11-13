import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTopic, compareSets, articleFromPage, ApiError } from '../server/core.mjs';
import { getLinks, metadata, getCrossLinks, wikiRequest } from '../server/wikipedia.mjs';
import { buildSnapshot, compareQuery, directionalGraph, resolveTopic, graphQuery, articleQuery } from '../server/service.mjs';
import { readSnapshot, writeSnapshot, databaseHealth } from '../server/database.mjs';

test('Wikipedia URL parsing retains source language and decodes title without fetching arbitrary origins', () => {
  assert.deepEqual(parseTopic('https://fi.wikipedia.org/wiki/Albert_Einstein#Historia', 'en'), { title: 'Albert Einstein', lang: 'fi' });
  assert.deepEqual(parseTopic('https://en.m.wikipedia.org/w/index.php?title=Quantum_mechanics'), { title: 'Quantum mechanics', lang: 'en' });
  for (const value of ['https://en.wikipedia.org.evil.test/wiki/Apple', 'https://localhost/wiki/Apple', 'https://en.wikipedia.org:999/wiki/Apple', 'https://user:pass@en.wikipedia.org/wiki/Apple', 'https://en.wikipedia.org/wiki/%ZZ']) assert.throws(() => parseTopic(value), ApiError);
  assert.throws(() => parseTopic('https://xx.wikipedia.org/wiki/Apple'), /supported/);
  assert.throws(() => parseTopic('Apple|Banana'), /title/);
});

test('Jaccard handles identical, disjoint, duplicated and empty concept sets honestly', () => {
  assert.deepEqual(compareSets(['Q1', 'Q1', 'Q2'], ['Q2', 'Q3']), { score: 33.3, shared: 1, union: 3, uniqueA: 1, uniqueB: 1 });
  assert.equal(compareSets(['Q1'], ['Q1']).score, 100);
  assert.equal(compareSets(['Q1'], ['Q2']).score, 0);
  assert.equal(compareSets([], []).score, null);
  assert.equal(compareSets([], ['Q1']).score, 0);
});

test('continuation is followed and caps preserve incomplete status', async () => {
  const calls = [];
  const request = async (_, params) => {
    calls.push(params);
    return calls.length === 1
      ? { continue: { plcontinue: 'cursor', continue: '||' }, query: { pages: [{ links: [{ title: 'A' }, { title: 'B' }] }] } }
      : { query: { pages: [{ links: [{ title: 'B' }, { title: 'C' }] }] } };
  };
  assert.deepEqual(await getLinks('Root', 'en', 'outgoing', request, 10), { titles: ['A', 'B', 'C'], complete: true });
  assert.equal(calls[1].plcontinue, 'cursor');
  const capped = await getLinks('Root', 'en', 'outgoing', async () => ({ continue: { plcontinue: 'next' }, query: { pages: [{ links: [{ title: 'A' }, { title: 'B' }] }] } }), 2);
  assert.deepEqual(capped, { titles: ['A', 'B'], complete: false });
});

test('backlink requests are namespace-limited, directed and exclude redirect articles', async () => {
  const data = await getLinks('Root', 'en', 'incoming', async (_, params) => {
    assert.equal(params.blnamespace, '0'); assert.equal(params.blfilterredir, 'nonredirects');
    return { query: { backlinks: [{ title: 'Source' }, { title: 'Root' }] } };
  });
  assert.deepEqual(data, { titles: ['Source'], complete: true });
});

test('metadata resolves normalized titles and redirect chains without inventing missing QIDs', async () => {
  const result = await metadata(['old_name', 'Missing'], 'en', async () => ({ query: {
    normalized: [{ from: 'old_name', to: 'Old name' }], redirects: [{ from: 'Old name', to: 'Current name' }],
    pages: [{ pageid: 14, ns: 0, title: 'Current name', pageprops: { wikibase_item: 'Q99' }, length: 100 }, { ns: 0, title: 'Missing', missing: true }],
  } }));
  assert.equal(result[0].article.qid, 'Q99');
  assert.equal(result[0].article.id, 'en:14');
  assert.equal(result[1].article, null);
});

test('neighbour edges include only verified links between selected articles', async () => {
  const articles = [{ id: 'en:1', title: 'One' }, { id: 'en:2', title: 'Two' }];
  const result = await getCrossLinks(articles, 'en', async (_, params) => {
    assert.equal(params.pltitles, 'One|Two');
    return { query: { pages: [{ title: 'One', links: [{ title: 'Two' }, { title: 'Outside' }, { title: 'One' }] }] } };
  });
  assert.deepEqual(result, [{ source: 'en:1', target: 'en:2' }]);
});

function makeSnapshot(lang, concepts, complete = true, qid = 'QROOT') {
  const root = { id: `${lang}:1`, title: `Root ${lang}`, lang, qid };
  return { graph: { root, nodes: [root], links: [], stats: { outgoing: concepts.length, incoming: 0, outgoingComplete: complete, incomingComplete: true, mapped: concepts.length }, notices: [], source: 'wikipedia' }, concepts: concepts.map(qid => ({ qid, title: qid })), conceptsComplete: complete };
}
test('language comparison matches sitelinks, handles missing editions and reports partial sets', async () => {
  const snapshots = { en: makeSnapshot('en', ['Q1', 'Q2']), ru: makeSnapshot('ru', ['Q2', 'Q3'], false) };
  const result = await compareQuery(new URLSearchParams({ title: 'Root', lang: 'en', languages: 'en,ru,uk' }), {
    getSnapshot: async (_, lang) => snapshots[lang], getSitelinks: async qid => { assert.equal(qid, 'QROOT'); return { ruwiki: { title: 'Root ru' } }; },
  });
  assert.equal(result.pairs[0].score, 33.3);
  assert.equal(result.pairs[0].complete, false);
  assert.equal(result.pairs[1].score, null);
  assert.equal(result.editions[2].article, null);
  assert.deepEqual(result.sharedConcepts, [{ qid: 'Q2', title: 'Q2', languages: ['en', 'ru'] }]);
});

test('comparison rejects a sitelink that resolves to a different Wikidata concept', async () => {
  const result = await compareQuery(new URLSearchParams({ title: 'Root', languages: 'en,ru' }), {
    getSnapshot: async (_, lang) => makeSnapshot(lang, ['Q1'], true, lang === 'en' ? 'QROOT' : 'QOTHER'),
    getSitelinks: async () => ({ ruwiki: { title: 'Different' } }),
  });
  assert.equal(result.pairs[0].score, null);
  assert.match(result.editions[1].error, /different concept/);
});

test('direction filters preserve only relevant root arrows and visible endpoints', () => {
  const graph = { root: { id: 'root' }, nodes: [{ id: 'root', root: true }, { id: 'a', direction: 'outgoing' }, { id: 'b', direction: 'incoming' }, { id: 'c', direction: 'both' }], links: [{ source: 'root', target: 'a' }, { source: 'b', target: 'root' }, { source: 'root', target: 'c' }, { source: 'c', target: 'root' }, { source: 'a', target: 'b' }] };
  assert.deepEqual(directionalGraph(graph, 'outgoing').links, [{ source: 'root', target: 'a' }, { source: 'root', target: 'c' }]);
  assert.deepEqual(directionalGraph(graph, 'incoming').links, [{ source: 'b', target: 'root' }, { source: 'c', target: 'root' }]);
});

test('API errors are not cached and upstream errors never expose internals', async () => {
  const unique = { list: 'search', srsearch: `unavailable-${Date.now()}` };
  await assert.rejects(wikiRequest('en', unique, async () => ({ ok: false, status: 429 })), error => error.status === 429);
  const result = await wikiRequest('en', unique, async () => ({ ok: true, json: async () => ({ query: { search: [] } }) }));
  assert.deepEqual(result, { query: { search: [] } });
});

test('article length remains bytes and rich text is rendered as plain strings', () => {
  const article = articleFromPage({ pageid: 3, title: 'A & B', length: 300, description: '<b>A</b> &amp; B', extract: 'Words' }, 'en');
  assert.equal(article.length, 300); assert.equal(article.description, 'A & B'); assert.equal(article.qid, null);
  assert.match(article.url, /A_%26_B$/);
});

test('graph display sampling does not truncate the concept set used for comparison', async () => {
  const targets = Array.from({ length: 80 }, (_, index) => ({ pageid: index + 2, ns: 0, title: `Concept ${index}`, pageprops: { wikibase_item: `Q${index + 10}` }, length: index * 100 }));
  const request = async (_, params) => {
    if (params.prop?.includes('extracts')) return { query: { pages: [{ pageid: 1, ns: 0, title: 'Root', pageprops: { wikibase_item: 'Q1' }, extract: 'Root article' }] } };
    if (params.list === 'backlinks') return { query: { backlinks: [{ title: 'Concept 0' }] } };
    if (params.prop === 'links' && params.pltitles) return { query: { pages: [{ title: 'Concept 0', links: [{ title: 'Concept 2' }] }] } };
    if (params.prop === 'links') return { query: { pages: [{ links: targets.map(target => ({ title: target.title })) }] } };
    return { query: { pages: targets.filter(target => params.titles.split('|').includes(target.title)) } };
  };
  const snapshot = await buildSnapshot('Root', 'en', request);
  assert.equal(snapshot.concepts.length, 80);
  assert.ok(snapshot.graph.nodes.length < 50);
  assert.equal(snapshot.graph.stats.outgoing, 80);
  assert.equal(snapshot.graph.stats.mapped, 80);
  assert.equal(snapshot.graph.nodes.find(node => node.id === 'en:2').direction, 'both');
  assert.ok(snapshot.graph.links.some(link => link.source === 'en:2' && link.target === 'en:1'));
  assert.ok(snapshot.graph.links.some(link => link.source === 'en:2' && link.target === 'en:4'));
  assert.equal(snapshot.conceptsComplete, true);
});

test('language changes resolve QIDs through exact Wikidata sitelinks before reading a graph', async () => {
  const sitelinksFor = async qid => {
    assert.equal(qid, 'Q89'); return { fiwiki: { title: 'Omena' }, enwiki: { title: 'Apple' } };
  };
  assert.deepEqual(await resolveTopic('Q89', 'fi', sitelinksFor), { title: 'Omena', lang: 'fi', qid: 'Q89' });
  assert.deepEqual(await resolveTopic('Q89x', 'en', () => { throw new Error('Must not interpret as a QID'); }), { title: 'Q89x', lang: 'en' });
  await assert.rejects(resolveTopic('Q89', 'uk', sitelinksFor), error => error.status === 404);
  const graph = await graphQuery(new URLSearchParams({ title: 'Q89', lang: 'fi' }), {
    getSitelinks: sitelinksFor,
    getSnapshot: async (title, lang) => {
      assert.equal(title, 'Omena'); assert.equal(lang, 'fi'); return makeSnapshot('fi', [], true, 'Q89');
    },
  });
  assert.equal(graph.root.qid, 'Q89');
});

test('unavailable backlinks are distinguished from a true zero count', async () => {
  const request = async (_, params) => {
    if (params.prop?.includes('extracts')) return { query: { pages: [{ pageid: 1, ns: 0, title: 'Root', pageprops: { wikibase_item: 'Q1' } }] } };
    if (params.list === 'backlinks') throw new ApiError('Unavailable', 502);
    return { query: { pages: [{ links: [] }] } };
  };
  const snapshot = await buildSnapshot('Root', 'en', request);
  assert.equal(snapshot.graph.stats.incoming, 0);
  assert.equal(snapshot.graph.stats.incomingAvailable, false);
  assert.equal(snapshot.graph.stats.incomingComplete, false);
  assert.ok(snapshot.graph.notices.some(notice => notice.includes('unavailable')));
});

test('pool initialization errors degrade cache operations without escaping the API', async () => {
  const failure = async () => { throw new Error('Private connection details must not escape'); };
  assert.equal(await readSnapshot('key', failure), null);
  assert.equal(await writeSnapshot('key', {}, failure), false);
  assert.deepEqual(await databaseHealth(failure, true), { mode: 'wikipedia', database: 'unavailable' });
});

test('database health checks schema as well as connection before reporting MariaDB mode', async () => {
  const statements = [];
  const missingSchema = async () => ({ query: async sql => {
    statements.push(sql);
    if (sql.includes('VERSION()')) return [{ version: '11.4.0-MariaDB' }];
    throw new Error('Missing table');
  } });
  assert.deepEqual(await databaseHealth(missingSchema, true), { mode: 'wikipedia', database: 'unavailable' });
  assert.match(statements[1], /graph_snapshots/);
  assert.match(statements[1], /articles/);
  assert.match(statements[1], /article_links/);
});

test('long multilingual metadata queries use a bounded URL with form parameters', async () => {
  await wikiRequest('ru', { prop: 'info', titles: `${'\u044f'.repeat(1500)}-${Date.now()}` }, async (url, init) => {
    assert.equal(init.method, 'POST');
    assert.equal(url.search, '');
    assert.equal(new URLSearchParams(init.body).get('prop'), 'info');
    return { ok: true, json: async () => ({ query: { pages: [] } }) };
  });
});

test('article previews resolve QIDs in the selected language and only fetch article metadata', async () => {
  const calls = [];
  const result = await articleQuery(new URLSearchParams({ title: 'Q89', lang: 'fi' }), {
    getSitelinks: async qid => { calls.push(['sitelinks', qid]); return { fiwiki: { title: 'Omena' } }; },
    getArticle: async (title, lang) => { calls.push(['article', title, lang]); return { id: 'fi:1', qid: 'Q89', title, lang, extract: 'An article preview.' }; },
  });
  assert.equal(result.article.title, 'Omena');
  assert.equal(result.article.extract, 'An article preview.');
  assert.deepEqual(calls, [['sitelinks', 'Q89'], ['article', 'Omena', 'fi']]);
  await assert.rejects(articleQuery(new URLSearchParams({ title: 'Q89', lang: 'fi' }), {
    getSitelinks: async () => ({ fiwiki: { title: 'Other' } }), getArticle: async () => ({ qid: 'Q90' }),
  }), error => error.status === 404);
});
