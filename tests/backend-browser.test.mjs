import test from 'node:test';
import assert from 'node:assert/strict';
import { wikiRequest } from '../server/wikipedia.mjs';
import * as database from '../src/browser-database.mjs';

test('browser data mode explicitly reports no database and cannot persist or traverse', async () => {
  assert.equal(database.databaseConfigured(), false);
  assert.deepEqual(await database.databaseHealth(), { mode: 'wikipedia', database: 'not-configured', transport: 'browser' });
  assert.equal(await database.readSnapshot('key'), null);
  assert.equal(await database.writeSnapshot('key', {}), false);
  await assert.rejects(database.traverse('en:1', 2), /unavailable in browser data mode/);
});

test('browser Wikimedia transport enables anonymous CORS without setting forbidden User-Agent', async () => {
  const previous = globalThis.window;
  globalThis.window = { document: {} };
  try {
    await wikiRequest('en', { list: 'search', srsearch: `browser-mode-${Date.now()}` }, async (url, init) => {
      assert.equal(url.searchParams.get('origin'), '*');
      assert.equal(url.hostname, 'en.wikipedia.org');
      assert.equal(Object.hasOwn(init.headers, 'User-Agent'), false);
      return { ok: true, json: async () => ({ query: { search: [] } }) };
    });
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test('server Wikimedia transport retains identification and omits browser CORS parameter', async () => {
  await wikiRequest('en', { list: 'search', srsearch: `server-mode-${Date.now()}` }, async (url, init) => {
    assert.equal(url.searchParams.has('origin'), false);
    assert.match(init.headers['User-Agent'], /^WikiLens\//);
    return { ok: true, json: async () => ({ query: { search: [] } }) };
  });
});
