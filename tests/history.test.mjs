import test from 'node:test';
import assert from 'node:assert/strict';
import { historyDate, historyQuery, wikiLinkTargets, linkChanges } from '../server/history.mjs';
import { prepareRevisions, fetchRevisionCapture, importRevisionCapture } from '../scripts/import-history.mjs';

const revision = (revid, parentid, timestamp, content = '[[Finland]]') => ({ revid, parentid, timestamp, slots: { main: { content, contentmodel: 'wikitext' } } });

test('historical link extraction distinguishes source targets from captions, markup and namespace links', () => {
  assert.deepEqual(wikiLinkTargets('[[winter_war#Battle|War]] [[Finland]] [[Finland|Suomi]] [[File:Map.svg]] [[Category:War]] [[:fi:Suomi]] [[#Local]] <!-- [[Hidden]] --> <nowiki>[[Not a link]]</nowiki> <syntaxhighlight lang="js">[[Code]]</syntaxhighlight> [[Україна]]'), ['Finland', 'Winter war', 'Україна']);
  assert.deepEqual(linkChanges(['A', 'B', 'B'], ['B', 'C']), { added: ['C'], removed: ['A'] });
});

test('dates are UTC and calendar-valid, retaining microseconds for revision boundaries', () => {
  assert.equal(historyDate('2024-02-29'), '2024-02-29 00:00:00');
  assert.equal(historyDate('2024-02-29T13:01:02.000001Z'), '2024-02-29 13:01:02.000001');
  assert.equal(historyDate(null), null);
  for (const date of ['2023-02-29', '2024-13-01', '2024-01-01T00:00:00+02:00', "2024-01-01' OR 1=1", '2040-01-01']) assert.throws(() => historyDate(date));
});

test('revision intervals retain hidden revisions and disambiguate edits in the same second', () => {
  const rows = prepareRevisions([
    revision(3, 2, '2024-01-01T00:00:01Z', '[[Sweden]]'),
    { revid: 2, parentid: 1, timestamp: '2024-01-01T00:00:00Z', texthidden: true },
    revision(1, 0, '2024-01-01T00:00:00Z'),
  ]);
  assert.deepEqual(rows.map(row => row.rowStart), ['2024-01-01 00:00:00.000000', '2024-01-01 00:00:00.000001', '2024-01-01 00:00:01.000000']);
  assert.equal(rows[0].rowEnd, rows[1].rowStart);
  assert.equal(rows[1].wikitext, null);
  assert.equal(rows[1].links, null);
  assert.equal(rows[2].rowEnd, null);
  assert.throws(() => prepareRevisions([revision(1, 0, '2024-01-01T00:00:00Z'), revision(3, 2, '2024-01-02T00:00:00Z')]), /gap/);
  assert.throws(() => prepareRevisions([revision(1, 0, '2024-01-01T00:00:00Z'), revision(1, 0, '2024-01-01T00:00:00Z')]), /unique/);
});

test('bounded fetch follows API continuation and anchors continuation to page identity', async () => {
  const requests = [];
  const capture = await fetchRevisionCapture('winter_war', 'en', 3, async (_lang, params) => {
    requests.push(params);
    return requests.length === 1 ? { curtimestamp: '2024-01-04T00:00:00Z', continue: { continue: '||', rvcontinue: 'older' }, query: { pages: [{ pageid: 10, ns: 0, title: 'Winter War', revisions: [revision(3, 2, '2024-01-03T00:00:00Z'), revision(2, 1, '2024-01-02T00:00:00Z')] }] } } : { query: { pages: [{ pageid: 10, ns: 0, title: 'Winter War', revisions: [revision(1, 0, '2024-01-01T00:00:00Z')] }] } };
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].rvlimit, '1');
  assert.equal(requests[1].rvcontinue, 'older');
  assert.equal(requests[1].pageids, '10');
  assert.equal(requests[1].titles, undefined);
  assert.equal(capture.hasEarlier, false);
  assert.equal(capture.rows.length, 3);
  assert.equal(capture.requestedTitle, 'winter war');
});

function historyPool({ imported = true, available = true } = {}) {
  const calls = [];
  const connection = {
    released: false,
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM history_imports')) return imported ? [{ page_id: 10, earliest: '2024-01-01 00:00:00.000000', latest: '2024-02-01 00:00:00.000000', captured_at: '2024-03-01 00:00:00.000000', revision_count: 2, has_earlier: 1 }] : [];
      if (sql.includes('AS OF')) return [{ title: 'Finland', revid: 1, revision_time: '2024-01-01 00:00:00.000000', byte_length: 50, content_available: available ? 1 : 0, links_json: '["Sweden","Old topic"]' }];
      if (sql.includes('FOR SYSTEM_TIME ALL')) return [{ revid: 1, revision_time: '2024-01-01 00:00:00.000000', row_start: '2024-01-01 00:00:00.000000', content_available: 1, link_count: 2 }];
      if (sql.includes('FROM history_articles WHERE')) return [{ revid: 2, revision_time: '2024-02-01 00:00:00.000000', content_available: 1, links_json: '["Sweden","New topic"]' }];
      return [];
    },
    release() { this.released = true; },
  };
  return { connection, calls, provider: async () => ({ getConnection: async () => connection }) };
}

test('time travel queries real system-time boundaries and reports provenance and changes', async () => {
  const db = historyPool();
  const result = await historyQuery(new URLSearchParams({ title: 'Finland', lang: 'en', date: '2024-01-15' }), db.provider);
  assert.equal(result.engine, 'mariadb-svt');
  assert.deepEqual(result.added, ['New topic']);
  assert.deepEqual(result.removed, ['Old topic']);
  assert.equal(result.article.url, 'https://en.wikipedia.org/w/index.php?oldid=1');
  assert.equal(result.coverage.completeBeforeEarliest, false);
  assert.equal(result.coverage.revisionCount, 2);
  assert.equal(result.timeline[0].date, '2024-01-01T00:00:00.000000Z');
  assert.deepEqual(db.calls.find(call => call.sql.includes('AS OF')).values, ['2024-01-15 00:00:00', 'en', 10]);
  assert.equal(db.connection.released, true);
});

test('missing database, missing import, inaccessible content and out-of-coverage dates stay distinct', async () => {
  const params = new URLSearchParams({ title: 'Finland' });
  await assert.rejects(historyQuery(params, async () => null), error => error.status === 503);
  await assert.rejects(historyQuery(params, async () => { throw new Error('connection secret'); }), error => error.status === 503 && !error.message.includes('secret'));
  await assert.rejects(historyQuery(params, historyPool({ imported: false }).provider), error => error.status === 404);
  const hidden = historyPool({ available: false });
  await assert.rejects(historyQuery(params, hidden.provider), error => error.status === 422 && /hidden/.test(error.message));
  assert.equal(hidden.connection.released, true);
  for (const date of ['2023-12-31', '2024-03-02']) {
    const db = historyPool();
    await assert.rejects(historyQuery(new URLSearchParams({ title: 'Finland', date }), db.provider), error => error.status === 422);
    assert.equal(db.calls.some(call => call.sql.includes('AS OF')), false);
    assert.equal(db.connection.released, true);
  }
});

function importPool({ existing = false, fail = false, orphan = false } = {}) {
  const calls = [], state = { committed: false, rolledBack: false, released: false };
  const connection = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('GET_LOCK')) return [{ acquired: 1 }];
      if (sql.includes('SELECT revision_count')) return existing ? [{ revision_count: 8 }] : [];
      if (sql.includes('FOR SYSTEM_TIME ALL')) return orphan ? [{ revid: 9 }] : [];
      if (fail && sql.includes('INSERT INTO history_articles')) throw new Error('write failed');
      return [];
    },
    async beginTransaction() {}, async commit() { state.committed = true; }, async rollback() { state.rolledBack = true; }, release() { state.released = true; },
  };
  return { pool: { getConnection: async () => connection }, calls, state };
}
const capture = { lang: 'fi', pageId: 10, title: 'Suomi', requestedTitle: 'Suomi', capturedAt: '2024-03-01T00:00:00Z', hasEarlier: true, rows: prepareRevisions([revision(1, 0, '2024-01-01T00:00:00Z'), revision(2, 1, '2024-02-01T00:00:00Z')]) };

test('import is atomic, uses original edit times, and lets MariaDB choose the current-row end', async () => {
  const db = importPool();
  const result = await importRevisionCapture(db.pool, capture);
  const inserts = db.calls.filter(call => call.sql.startsWith('INSERT INTO history_articles'));
  assert.equal(result.status, 'imported');
  assert.equal(inserts.length, 2);
  assert.equal(inserts[0].values.at(-1), '2024-02-01 00:00:00.000000');
  assert.equal(inserts[1].values.at(-1), '2024-02-01 00:00:00.000000');
  assert.equal(inserts[1].sql.includes('row_end'), false);
  assert.equal(db.state.committed, true);
  assert.equal(db.state.released, true);
  assert.ok(db.calls.some(call => call.sql === 'SET SESSION system_versioning_insert_history = 0'));
});

test('re-import never overwrites existing history and failures roll back/reset the session', async () => {
  const db = importPool({ existing: true });
  assert.equal((await importRevisionCapture(db.pool, capture)).status, 'skipped');
  assert.equal(db.calls.some(call => call.sql.startsWith('INSERT')), false);
  for (const options of [{ fail: true }, { orphan: true }]) {
    const failed = importPool(options);
    await assert.rejects(importRevisionCapture(failed.pool, capture));
    assert.equal(failed.state.rolledBack, true);
    assert.equal(failed.state.committed, false);
    assert.equal(failed.state.released, true);
    assert.ok(failed.calls.some(call => call.sql.includes('RELEASE_LOCK')));
  }
});
