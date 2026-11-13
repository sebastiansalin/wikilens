import test from 'node:test';
import assert from 'node:assert/strict';
import { neighbourhood, neighbourhoodSql, writeSnapshot, NODE_LIMIT } from '../server/database.mjs';
import { neighbourhoodQuery } from '../server/service.mjs';
import { summarizePageviews } from '../server/core.mjs';
import { getPageviews } from '../server/wikipedia.mjs';

const root = { id: 'en:1', title: 'Root', lang: 'en', qid: 'Q1', length: 10 };
const base = { graph: { root, nodes: [root], links: [], notices: [], source: 'mariadb' } };

test('SQL neighbourhood fails explicitly before live API access when the database is absent', async () => {
  let read = false;
  await assert.rejects(neighbourhoodQuery(new URLSearchParams({ title: 'Root' }), {
    databaseHealth: async () => ({ database: 'not-configured' }),
    getSnapshot: async () => { read = true; },
  }), error => error.status === 503 && /not connected/.test(error.message));
  assert.equal(read, false);
});

test('SQL neighbourhood rejects invalid depth and direction before touching database', async () => {
  for (const depth of ['0', '4', '2.1', '2 OR 1=1', '-1']) {
    await assert.rejects(neighbourhoodQuery(new URLSearchParams({ title: 'Root', depth }), {
      databaseHealth: () => { throw new Error('Must not access database'); },
    }), error => error.status === 400);
  }
  assert.throws(() => neighbourhoodSql('both; DROP TABLE articles'), /direction/);
});

test('bounded SQL traversal excludes expired edges, restricts language, deduplicates depth states and ranks fanout', async () => {
  const calls = [];
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    return calls.length === 1 ? [
      { article_json: JSON.stringify(root), id: root.id, hop_distance: 0, observed_degree: 1, affinity: 1 },
      { article_json: { ...root, id: 'en:2', title: 'Second' }, id: 'en:2', hop_distance: 2, observed_degree: 4, affinity: '0.5' },
    ] : [{ source: 'en:2', target: root.id }];
  } };
  const result = await neighbourhood(root, { depth: 3, direction: 'incoming' }, async () => pool);
  assert.match(calls[0].sql, /expires_at > UTC_TIMESTAMP\(\)/);
  assert.match(calls[0].sql, /a.lang = \? AND b.lang = \?/);
  assert.match(calls[0].sql, /max_statement_time=3, max_recursive_iterations=4/);
  assert.match(calls[0].sql, /UNION DISTINCT/);
  assert.match(calls[0].sql, /ROW_NUMBER\(\) OVER/);
  assert.match(calls[0].sql, /neighbour_rank <= 24/);
  assert.match(calls[0].sql, /SELECT target_id AS source_id, source_id AS target_id FROM fresh_edges/);
  assert.deepEqual(calls[0].params, ['en', 'en', 'en:1', 3]);
  assert.match(calls[1].sql, /expires_at > UTC_TIMESTAMP\(\)/);
  assert.deepEqual(calls[1].params, ['en:1', 'en:2', 'en:1', 'en:2']);
  assert.equal(result.nodes[1].hopDistance, 2);
  assert.equal(result.nodes[1].affinity, .5);
  assert.equal(result.nodes[1].degree, 4);
  assert.equal(result.nodes[1].direction, 'incoming');
  assert.deepEqual(result.links, [{ source: 'en:2', target: 'en:1' }]);
  assert.equal(result.analysis.sampled, true);
});

test('SQL neighbourhood reports the node cap and does not expose a fabricated zero on failures', async () => {
  let calls = 0;
  const pool = { query: async () => ++calls === 1 ? Array.from({ length: NODE_LIMIT + 1 }, (_, i) => ({
    article_json: { ...root, id: `en:${i + 1}` }, id: `en:${i + 1}`, hop_distance: i ? 1 : 0, observed_degree: 1, affinity: 1,
  })) : [] };
  const result = await neighbourhood(root, { depth: 1 }, async () => pool);
  assert.equal(result.nodes.length, NODE_LIMIT);
  assert.equal(result.analysis.limited, true);
  await assert.rejects(neighbourhoodQuery(new URLSearchParams({ title: 'Root' }), {
    databaseHealth: async () => ({ database: 'connected' }), getSnapshot: async () => base,
    neighbourhood: async () => { throw new Error('Private database host and password must not escape'); },
  }), error => error.status === 503 && !error.message.includes('password'));
});

test('cached Wikipedia observations must persist before being returned as MariaDB analysis', async () => {
  const events = [];
  const result = await neighbourhoodQuery(new URLSearchParams({ title: 'Root', depth: '2' }), {
    databaseHealth: async () => ({ database: 'connected' }),
    getSnapshot: async () => ({ ...base, graph: { ...base.graph, source: 'wikipedia' } }),
    writeSnapshot: async () => { events.push('persist'); return true; },
    neighbourhood: async (_, options) => { events.push('query'); assert.equal(options.depth, 2); return { nodes: [root], links: [], analysis: { engine: 'mariadb-recursive-cte' } }; },
  });
  assert.deepEqual(events, ['persist', 'query']);
  assert.equal(result.source, 'mariadb');
  assert.equal(result.analysis.engine, 'mariadb-recursive-cte');
  assert.ok(result.notices.some(text => text.includes('only fresh observations')));
});

test('pageview aggregation distinguishes missing days from true zero and retains date coverage', () => {
  assert.deepEqual(summarizePageviews({ '2026-11-01': 10, '2026-11-02': null, '2026-11-03': 0, '2026-11-04': 20, invalid: 100, '2026-11-05': -1 }), {
    pageviews: 30, pageviewDays: 3, pageviewStart: '2026-11-01', pageviewEnd: '2026-11-04',
  });
  assert.equal(summarizePageviews({ '2026-11-01': 0 }).pageviews, 0);
  assert.equal(summarizePageviews({ '2026-11-01': null }).pageviews, null);
});

test('pageview history follows continuation and requests only the displayed titles', async () => {
  const calls = [];
  const result = await getPageviews([root], 'en', async (_, params) => {
    calls.push(params);
    return calls.length === 1
      ? { continue: { pvipcontinue: 'next' }, query: { pages: [{ pageid: 1, ns: 0, pageviews: { '2026-11-01': 5 } }] } }
      : { query: { pages: [{ pageid: 1, ns: 0, pageviews: { '2026-11-02': 8 } }] } };
  });
  assert.equal(calls[0].pvipdays, '30');
  assert.equal(calls[0].titles, 'Root');
  assert.equal(calls[1].pvipcontinue, 'next');
  assert.equal(result.get('en:1').pageviews, 13);
  assert.equal(result.get('en:1').pageviewDays, 2);
});

test('temporal observations and relational edges are written in one transaction', async () => {
  const statements = [];
  const connection = {
    beginTransaction: async () => statements.push(['begin']), commit: async () => statements.push(['commit']),
    rollback: async () => statements.push(['rollback']), release: () => statements.push(['release']),
    query: async (sql, params) => statements.push([sql, params]), batch: async (sql, params) => statements.push([sql, params]),
  };
  const other = { ...root, id: 'en:2', title: 'Second', pageviews: null, extract: '' };
  const snapshot = { graph: { ...base.graph, fetchedAt: '2026-11-13T12:00:00Z', links: [{ source: root.id, target: other.id }] }, allArticles: [other], allLinks: [{ source: root.id, target: other.id }] };
  assert.equal(await writeSnapshot('key', snapshot, async () => ({ getConnection: async () => connection })), true);
  const insert = statements.find(([sql]) => sql.startsWith('INSERT INTO edge_observations'));
  assert.equal(insert[1][0][3].toISOString(), snapshot.graph.fetchedAt.replace('00Z', '00.000Z'));
  assert.ok(statements.findIndex(([sql]) => sql.startsWith('INSERT INTO article_links')) < statements.findIndex(([sql]) => sql === 'commit'));
  assert.ok(statements.findIndex(([sql]) => sql.startsWith('INSERT INTO edge_observations')) < statements.findIndex(([sql]) => sql === 'commit'));
  const articles = statements.find(([sql]) => sql.startsWith('INSERT INTO articles'));
  assert.match(articles[0], /JSON_MERGE_PATCH/);
  assert.equal(Object.hasOwn(JSON.parse(articles[1][1][5]), 'pageviews'), false);
  assert.equal(Object.hasOwn(JSON.parse(articles[1][1][5]), 'extract'), false);
});
