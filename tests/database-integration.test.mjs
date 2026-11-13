import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPool, writeSnapshot, neighbourhood, shortestPath, closeDatabase } from '../server/database.mjs';

// Opt in only against a dedicated initialized development database. Test rows roll back;
// no existing observations are deleted, and this test never creates database credentials.
test('MariaDB executes directed, fresh, cycle-bounded neighbourhood SQL and temporal observations', {
  skip: process.env.WIKILENS_DB_INTEGRATION !== '1',
}, async () => {
  const pool = await getPool();
  assert.ok(pool, 'Configure a dedicated MariaDB database before enabling this integration test.');
  const connection = await pool.getConnection();
  const prefix = `en:test-${randomUUID().slice(0, 8)}`;
  const articles = ['A', 'B', 'C', 'D', 'Stale'].map(letter => ({
    id: `${prefix}-${letter}`, title: `Test ${letter}`, lang: 'en', qid: null,
    length: 0, extract: '', description: 'Integration fixture', url: '',
  }));
  const [a, b, c, d, stale] = articles;
  const edges = [{ source: a.id, target: b.id }, { source: b.id, target: c.id }, { source: c.id, target: a.id }, { source: c.id, target: d.id }];
  const key = randomUUID().replaceAll('-', '').padEnd(64, '0');
  const staleKey = randomUUID().replaceAll('-', '').padEnd(64, '0');
  const snapshot = links => ({ graph: { root: a, nodes: articles, links, fetchedAt: new Date().toISOString() }, allArticles: articles, allLinks: links });
  // Keep writeSnapshot's operations inside this test's surrounding rollback transaction.
  const owned = {
    query: (...args) => connection.query(...args), batch: (...args) => connection.batch(...args),
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
  };
  const provider = async () => ({ query: (...args) => connection.query(...args), getConnection: async () => owned });
  try {
    await connection.beginTransaction();
    assert.equal(await writeSnapshot(key, snapshot(edges), provider), true);
    assert.equal(await writeSnapshot(staleKey, snapshot([{ source: a.id, target: stale.id }]), provider), true);
    await connection.query('UPDATE graph_snapshots SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR) WHERE cache_key = ?', [staleKey]);
    const result = await neighbourhood(a, { depth: 3, direction: 'outgoing' }, provider);
    assert.deepEqual(Object.fromEntries(result.nodes.map(node => [node.title, node.hopDistance])), {
      'Test A': 0, 'Test B': 1, 'Test C': 2, 'Test D': 3,
    });
    assert.equal(result.nodes.find(node => node.id === d.id).affinity, .25);
    assert.equal(result.links.length, 4);
    const incoming = await neighbourhood(a, { depth: 1, direction: 'incoming' }, provider);
    assert.deepEqual(new Set(incoming.nodes.map(node => node.id)), new Set([a.id, c.id]));
    const both = await neighbourhood(a, { depth: 1, direction: 'both' }, provider);
    assert.deepEqual(new Set(both.nodes.map(node => node.id)), new Set([a.id, b.id, c.id]));
    // Path SQL shares this already-open fixture transaction; suppress nested transaction commands.
    const pathConnection = { ...owned, query: (sql, params) => sql.startsWith('SET TRANSACTION') ? Promise.resolve([]) : connection.query(sql, params) };
    const pathProvider = async () => ({ getConnection: async () => pathConnection });
    const path = await shortestPath(a, d, { maxDepth: 6 }, pathProvider);
    assert.equal(path.hops, 3);
    assert.deepEqual(path.articles.map(article => article.id), [a.id, b.id, c.id, d.id]);
    assert.equal(path.complete, true);
    const noReversePath = await shortestPath(d, a, { maxDepth: 6 }, pathProvider);
    assert.equal(noReversePath.status, 'not-found');
    const observations = await connection.query('SELECT source_id, target_id, observed_at, ROW_START AS recorded_at FROM edge_observations FOR SYSTEM_TIME ALL WHERE snapshot_key = ?', [key]);
    assert.equal(observations.length, 4);
    assert.ok(observations.every(row => row.observed_at && row.recorded_at));
  } finally {
    await connection.rollback();
    connection.release();
    await closeDatabase();
  }
});
