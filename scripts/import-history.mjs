import { existsSync, readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { pathToFileURL } from 'node:url';
import { ApiError, parseTopic } from '../server/core.mjs';
import { wikiRequest } from '../server/wikipedia.mjs';
import { wikiLinkTargets } from '../server/history.mjs';

const MAX_REVISIONS = 100;
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
function utcSql(value) { return new Date(value).toISOString().replace('T', ' ').replace('Z', ''); }
function microSql(value) {
  const milliseconds = value / 1000n;
  const date = new Date(Number(milliseconds)).toISOString();
  return date.slice(0, 19).replace('T', ' ') + '.' + String(value % 1_000_000n).padStart(6, '0');
}

export function prepareRevisions(input) {
  if (!input.length || input.length > MAX_REVISIONS) throw new Error(`Supply 1–${MAX_REVISIONS} revisions.`);
  const ids = new Set();
  const rows = input.map(revision => {
    if (!Number.isSafeInteger(revision.revid) || revision.revid <= 0 || ids.has(revision.revid)) throw new Error('Revision IDs must be unique positive integers.');
    ids.add(revision.revid);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(revision.timestamp) || !Number.isFinite(Date.parse(revision.timestamp))) throw new Error('A revision has no valid Wikipedia timestamp.');
    const slot = revision.slots?.main;
    if (slot?.contentmodel && slot.contentmodel !== 'wikitext') throw new Error('Only Wikipedia wikitext articles are supported.');
    const content = typeof slot?.content === 'string' && !revision.texthidden && !slot.texthidden ? slot.content : null;
    if (content !== null && Buffer.byteLength(content, 'utf8') > MAX_TEXT_BYTES) throw new Error('A revision exceeds the safe per-row import size.');
    return { revid: revision.revid, parentid: revision.parentid, timestamp: revision.timestamp, wikitext: content, links: content === null ? null : wikiLinkTargets(content), byteLength: Number.isSafeInteger(revision.size) ? revision.size : (content === null ? null : Buffer.byteLength(content, 'utf8')) };
  }).sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.revid - b.revid);
  let previous = -1n;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (index > 0 && row.parentid !== rows[index - 1].revid) throw new Error('The API returned a gap in revision history; refusing to invent the missing interval.');
    const exact = BigInt(Date.parse(row.timestamp)) * 1000n;
    const start = exact > previous ? exact : previous + 1n;
    if (start >= BigInt(Date.UTC(2038, 0, 19, 3, 14, 7)) * 1000n) throw new Error('A revision exceeds the supported MariaDB timestamp range.');
    row.rowStart = microSql(start); previous = start;
    if (index > 0) rows[index - 1].rowEnd = row.rowStart;
  }
  rows.at(-1).rowEnd = null; // Let MariaDB supply its version-specific current-row sentinel.
  return rows;
}

export async function fetchRevisionCapture(title, lang = 'en', limit = MAX_REVISIONS, request = wikiRequest) {
  const topic = parseTopic(title, lang);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_REVISIONS) throw new ApiError(`Choose 1–${MAX_REVISIONS} revisions.`);
  let continuation = {}, pageId, canonicalTitle, capturedAt, hasEarlier = false;
  const revisions = [];
  while (revisions.length < limit) {
    const data = await request(topic.lang, { prop: 'revisions', ...(pageId ? { pageids: String(pageId) } : { titles: topic.title, redirects: '1' }), rvprop: 'ids|timestamp|size|content|contentmodel', rvslots: 'main', rvdir: 'older', rvlimit: String(Math.min(50, limit - revisions.length)), curtimestamp: '1', ...continuation });
    const page = data.query?.pages?.[0];
    if (!page || page.missing || page.invalid || page.ns !== 0) throw new ApiError('Choose an existing Wikipedia article.', 404);
    if (pageId && pageId !== page.pageid) throw new Error('The page identity changed during import.');
    if (!capturedAt) {
      if (!data.curtimestamp || !Number.isFinite(Date.parse(data.curtimestamp))) throw new Error('Wikipedia did not return the capture time.');
      capturedAt = data.curtimestamp;
    }
    pageId = page.pageid; canonicalTitle = page.title;
    if (!page.revisions?.length) throw new Error('Wikipedia returned an empty history page.');
    revisions.push(...page.revisions);
    hasEarlier = Boolean(data.continue?.rvcontinue);
    if (!hasEarlier) break;
    if (continuation.rvcontinue === data.continue.rvcontinue) throw new Error('Wikipedia repeated its continuation token.');
    continuation = data.continue;
  }
  const rows = prepareRevisions(revisions);
  if (Date.parse(rows.at(-1).timestamp) > Date.parse(capturedAt)) throw new Error('The capture time precedes the latest revision.');
  return { lang: topic.lang, requestedTitle: topic.title, title: canonicalTitle, pageId, capturedAt, hasEarlier, rows };
}

export async function importRevisionCapture(pool, capture) {
  const connection = await pool.getConnection();
  const lockName = `wikilens-history-${capture.lang}-${capture.pageId}`;
  let locked = false, transaction = false, historyEnabled = false;
  try {
    await connection.query("SET time_zone = '+00:00'");
    const locks = await connection.query('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
    if (Number(locks[0]?.acquired) !== 1) throw new Error('Another history import is running for this article.');
    locked = true;
    await connection.beginTransaction(); transaction = true;
    const existing = await connection.query('SELECT revision_count FROM history_imports WHERE lang = ? AND page_id = ?', [capture.lang, capture.pageId]);
    if (existing.length) {
      await connection.rollback(); transaction = false;
      return { status: 'skipped', reason: 'An immutable capture already exists; no history was overwritten.', revisionCount: Number(existing[0].revision_count) };
    }
    const orphan = await connection.query('SELECT revid FROM history_articles FOR SYSTEM_TIME ALL WHERE lang = ? AND page_id = ? LIMIT 1', [capture.lang, capture.pageId]);
    if (orphan.length) throw new Error('Uncatalogued history already exists. Refusing to overwrite it.');
    await connection.query('SET SESSION system_versioning_insert_history = 1'); historyEnabled = true;
    for (const row of capture.rows) {
      const columns = 'lang, page_id, title, revid, revision_time, byte_length, content_available, links_json, wikitext, row_start';
      const values = [capture.lang, capture.pageId, capture.title, row.revid, utcSql(row.timestamp), row.byteLength, row.wikitext === null ? 0 : 1, row.links === null ? null : JSON.stringify(row.links), row.wikitext, row.rowStart];
      if (row.rowEnd) {
        await connection.query(`INSERT INTO history_articles (${columns}, row_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [...values, row.rowEnd]);
      } else {
        await connection.query(`INSERT INTO history_articles (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, values);
      }
    }
    await connection.query(`INSERT INTO history_imports (lang, page_id, title, requested_title, earliest, latest, captured_at, revision_count, has_earlier)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [capture.lang, capture.pageId, capture.title, capture.requestedTitle, capture.rows[0].rowStart, capture.rows.at(-1).rowStart, utcSql(capture.capturedAt), capture.rows.length, capture.hasEarlier ? 1 : 0]);
    await connection.commit(); transaction = false;
    return { status: 'imported', revisionCount: capture.rows.length, earliest: capture.rows[0].timestamp, latest: capture.rows.at(-1).timestamp, capturedAt: capture.capturedAt };
  } catch (error) {
    if (transaction) await connection.rollback().catch(() => {});
    throw error;
  } finally {
    if (historyEnabled) await connection.query('SET SESSION system_versioning_insert_history = 0').catch(() => {});
    if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    connection.release();
  }
}

async function main() {
  if (existsSync('.env')) loadEnvFile('.env');
  const [title, lang = 'fi', rawLimit = '100'] = process.argv.slice(2);
  if (!title) throw new Error('Usage: node scripts/import-history.mjs "Talvisota" fi 100');
  const { getPool, closeDatabase } = await import('../server/database.mjs');
  try {
    const pool = await getPool();
    if (!pool) throw new Error('Configure MARIADB_HOST, MARIADB_USER and MARIADB_DATABASE first.');
    const schema = readFileSync(new URL('../db/history.sql', import.meta.url), 'utf8').replace(/^--.*$/gm, '');
    for (const statement of schema.split(';').map(value => value.trim()).filter(Boolean)) await pool.query(statement);
    const capture = await fetchRevisionCapture(title, lang, Number(rawLimit));
    const result = await importRevisionCapture(pool, capture);
    console.log(JSON.stringify({ title: capture.title, lang: capture.lang, ...result }, null, 2));
  } finally { await closeDatabase(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error instanceof ApiError ? error.message : error.code || error.message); process.exitCode = 1; });
}
