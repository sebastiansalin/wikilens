import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedDirectedPath } from '../server/pathfinding.mjs';
import { pathQuery, wikipediaShortestPath } from '../server/service.mjs';
import { pathAdjacency } from '../server/wikipedia.mjs';
import { shortestPath } from '../server/database.mjs';

const article = id => ({ id, title: id, lang: 'en', qid: null, length: 0, description: '', extract: '', url: `https://en.wikipedia.org/wiki/${id}` });
const reader = (edges, { complete = true, calls = [] } = {}) => async (frontier, direction) => {
  calls.push({ frontier: frontier.map(node => node.id), direction });
  const ids = new Set(frontier.map(node => node.id));
  const links = edges.filter(([source, target]) => ids.has(direction === 'outgoing' ? source : target)).map(([source, target]) => ({ source, target }));
  return { links, articles: [...new Set(links.flatMap(link => [link.source, link.target]))].map(article), complete };
};

test('directed bidirectional BFS finds a shortest route despite cycles and competing longer routes', async () => {
  const edges = [['A', 'X'], ['X', 'Y'], ['Y', 'Z'], ['Z', 'T'], ['A', 'B'], ['B', 'T'], ['B', 'A'], ['T', 'A']];
  const result = await boundedDirectedPath(article('A'), article('T'), reader(edges), { engine: 'test', scope: 'fixture', maxDepth: 6 });
  assert.equal(result.status, 'found');
  assert.equal(result.hops, 2);
  assert.deepEqual(result.articles.map(node => node.id), ['A', 'B', 'T']);
  assert.deepEqual(result.links, [{ source: 'A', target: 'B' }, { source: 'B', target: 'T' }]);
  assert.equal(result.complete, true);
});

test('reverse exploration preserves edge orientation and does not invent undirected routes', async () => {
  const calls = [];
  const edges = [['A', 'B'], ['A', 'C'], ['A', 'D'], ['B', 'E'], ['E', 'T']];
  const result = await boundedDirectedPath(article('A'), article('T'), reader(edges, { calls }), { engine: 'test', scope: 'fixture' });
  assert.ok(calls.some(call => call.direction === 'incoming'));
  assert.deepEqual(result.articles.map(node => node.id), ['A', 'B', 'E', 'T']);
  const reverse = await boundedDirectedPath(article('T'), article('A'), reader(edges), { engine: 'test', scope: 'fixture' });
  assert.equal(reverse.status, 'not-found');
  assert.equal(reverse.complete, true);
});

test('bidirectional results agree with exhaustive BFS over 120 deterministic directed graphs', async () => {
  let state = 17;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  for (let trial = 0; trial < 120; trial++) {
    const ids = Array.from({ length: 15 }, (_, i) => `N${i}`), edges = [];
    for (const from of ids) for (const to of ids) if (from !== to && random() < .12) edges.push([from, to]);
    const seen = new Map([[ids[0], 0]]), queue = [ids[0]];
    for (let cursor = 0; cursor < queue.length; cursor++) for (const [from, to] of edges) {
      if (from === queue[cursor] && !seen.has(to)) { seen.set(to, seen.get(from) + 1); queue.push(to); }
    }
    const expected = seen.get(ids.at(-1));
    const result = await boundedDirectedPath(article(ids[0]), article(ids.at(-1)), reader(edges), { engine: 'test', scope: 'fixture', maxDepth: 6 });
    if (expected !== undefined && expected <= 6) {
      assert.equal(result.status, 'found', `Trial ${trial}`);
      assert.equal(result.hops, expected, `Trial ${trial}`);
      assert.equal(result.complete, true);
      assert.ok(result.links.every(link => edges.some(([from, to]) => from === link.source && to === link.target)));
    } else assert.notEqual(result.status, 'found', `Trial ${trial}`);
  }
});

test('same-article path is zero hops and performs no adjacency queries', async () => {
  const result = await boundedDirectedPath(article('A'), article('A'), () => { throw new Error('Must not query'); }, { engine: 'test', scope: 'fixture' });
  assert.equal(result.hops, 0);
  assert.deepEqual(result.links, []);
  assert.equal(result.complete, true);
});

test('sampled paths are found without falsely claiming shortestness; incomplete absence is limited', async () => {
  const found = await boundedDirectedPath(article('A'), article('T'), reader([['A', 'B'], ['B', 'T']], { complete: false }), { engine: 'test', scope: 'fixture' });
  assert.equal(found.status, 'found');
  assert.equal(found.complete, false);
  assert.ok(found.notices.some(notice => notice.includes('shorter route may exist')));
  const absent = await boundedDirectedPath(article('A'), article('T'), reader([], { complete: false }), { engine: 'test', scope: 'fixture' });
  assert.equal(absent.status, 'limited');
  assert.equal(absent.complete, false);
});

test('depth, visit and upstream-failure bounds never become a false global no-path result', async () => {
  const depth = await boundedDirectedPath(article('A'), article('T'), reader([['A', 'B'], ['B', 'C'], ['C', 'T']]), { maxDepth: 2, engine: 'test', scope: 'fixture' });
  assert.equal(depth.status, 'limited');
  const visits = await boundedDirectedPath(article('A'), article('T'), reader([['A', 'B'], ['A', 'C']]), { maxVisited: 2, engine: 'test', scope: 'fixture' });
  assert.equal(visits.status, 'limited');
  assert.equal(visits.visited, 2);
  const failure = await boundedDirectedPath(article('A'), article('T'), () => { throw new Error('private-host/password'); }, { engine: 'test', scope: 'fixture' });
  assert.equal(failure.status, 'limited');
  assert.ok(!JSON.stringify(failure).includes('password'));
});

test('live fallback obeys its 12-adjacency-request budget and can reuse cached outgoing links', async () => {
  let calls = 0;
  const result = await wikipediaShortestPath(article('A'), article('T'), { maxDepth: 6 }, {
    cachedAdjacency: () => null,
    pathAdjacency: async (node, direction) => {
      calls++;
      const neighbours = Array.from({ length: 20 }, (_, i) => article(`${node.id}-${i}`));
      return { articles: neighbours, links: neighbours.map(other => direction === 'outgoing' ? { source: node.id, target: other.id } : { source: other.id, target: node.id }), complete: true };
    },
  });
  assert.equal(calls, 12);
  assert.equal(result.status, 'limited');
  assert.ok(result.visited <= 1500);
  let directCalls = 0;
  const direct = await wikipediaShortestPath(article('A'), article('T'), {}, {
    cachedAdjacency: node => node.id === 'A' ? { articles: [article('T')], links: [{ source: 'A', target: 'T' }], complete: false } : null,
    pathAdjacency: () => { directCalls++; throw new Error('Must use cache'); },
  });
  assert.equal(directCalls, 0);
  assert.equal(direct.hops, 1);
  assert.equal(direct.complete, true);
});

test('MediaWiki path generator returns directed verified article edges and continuation means incomplete', async () => {
  const result = await pathAdjacency(article('en:1'), 'incoming', async (_, params) => {
    assert.equal(params.generator, 'backlinks');
    assert.equal(params.gblnamespace, '0');
    assert.equal(params.gblredirect, '1');
    assert.equal(params.gbllimit, '125');
    return { continue: { gblcontinue: 'cursor' }, query: { pages: [
      { pageid: 2, title: 'Source', ns: 0 }, { pageid: 3, title: 'Redirect', ns: 0, redirect: true },
      { pageid: 4, title: 'Talk', ns: 1 }, { title: 'Missing', missing: true, ns: 0 },
    ] } };
  });
  assert.equal(result.complete, false);
  assert.deepEqual(result.links, [{ source: 'en:2', target: 'en:1' }]);
});

test('path API validates language and depth, selects SQL when connected, and labels live fallback', async () => {
  const dependencies = {
    getArticle: async title => article(title), databaseHealth: async () => ({ database: 'connected' }),
    shortestPath: async (from, to, options) => ({ engine: 'mariadb-bfs', from: from.title, to: to.title, options }),
  };
  const sql = await pathQuery(new URLSearchParams({ from: 'A', to: 'B', maxDepth: '4' }), dependencies);
  assert.equal(sql.engine, 'mariadb-bfs');
  assert.equal(sql.options.maxDepth, 4);
  await assert.rejects(pathQuery(new URLSearchParams({ from: 'A', to: 'B', maxDepth: '7' }), dependencies), error => error.status === 400);
  await assert.rejects(pathQuery(new URLSearchParams({ from: 'https://en.wikipedia.org/wiki/A', to: 'https://fi.wikipedia.org/wiki/B' }), dependencies), error => error.status === 400);
  const live = await pathQuery(new URLSearchParams({ from: 'A', to: 'B' }), {
    ...dependencies, databaseHealth: async () => ({ database: 'unavailable' }),
    wikipediaShortestPath: async () => ({ engine: 'wikipedia-bounded-bfs', notices: [] }),
  });
  assert.equal(live.engine, 'wikipedia-bounded-bfs');
  assert.ok(live.notices.some(notice => notice.includes('MariaDB is unavailable')));
});

test('MariaDB path batches fresh indexed frontier reads in one consistent read transaction', async () => {
  const statements = [];
  const connection = {
    beginTransaction: async () => statements.push('begin'), rollback: async () => statements.push('rollback'), release: () => statements.push('release'),
    query: async (sql, params) => {
      statements.push({ sql, params });
      if (sql.startsWith('SET TRANSACTION')) return [];
      if (sql.startsWith('SELECT id')) return [{ id: 'A' }, { id: 'T' }];
      assert.match(sql, /s.expires_at > \?/);
      assert.match(sql, /a.lang = \?/);
      assert.match(sql, /max_statement_time=3/);
      assert.match(sql, /l.source_id IN \(\?\)/);
      return [{ source: 'A', target: 'T', article_json: JSON.stringify(article('T')) }];
    },
  };
  const result = await shortestPath(article('A'), article('T'), {}, async () => ({ getConnection: async () => connection }));
  assert.equal(result.engine, 'mariadb-bfs');
  assert.equal(result.hops, 1);
  assert.deepEqual(statements.slice(-2), ['rollback', 'release']);
});
