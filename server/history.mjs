import { ApiError, parseTopic } from './core.mjs';
import { getPool } from './database.mjs';

export const HISTORY_SCOPE = 'A bounded capture of Wikipedia revisions. Links are explicit wikitext article targets, not template-expanded links; colon targets are excluded. Titles are not resolved to Wikidata concepts. Added and removed compare the selected revision with the latest imported revision.';

export function historyDate(value) {
  if (!value) return null;
  const date = String(value);
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z)?$/.test(date)) throw new ApiError('Choose a UTC date or ISO timestamp.');
  const full = date.length === 10 ? `${date}T00:00:00Z` : date;
  const parsed = new Date(full);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== full.slice(0, 19)) throw new ApiError('Choose a valid calendar date.');
  if (parsed.getTime() < Date.UTC(1970, 0, 1) || parsed.getTime() >= Date.UTC(2038, 0, 19, 3, 14, 7)) throw new ApiError('Choose a date from 1970 through 2038-01-18.');
  return full.replace('T', ' ').replace('Z', '');
}

export function wikiLinkTargets(wikitext) {
  // This intentionally extracts explicit source links rather than claiming to render MediaWiki.
  const text = String(wikitext || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(nowiki|pre|source|syntaxhighlight|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const targets = new Set();
  for (const match of text.matchAll(/\[\[([^\[\]\n]+)\]\]/g)) {
    let title = match[1].split('|', 1)[0].split('#', 1)[0].replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    if (!title || title.includes(':') || /[{}<>\u0000-\u001f]/.test(title) || title.length > 250) continue;
    title = title.charAt(0).toUpperCase() + title.slice(1);
    targets.add(title);
  }
  return [...targets].sort((a, b) => a.localeCompare(b));
}

export function linkChanges(then, latest) {
  const previous = new Set(then), current = new Set(latest);
  return { added: [...current].filter(title => !previous.has(title)), removed: [...previous].filter(title => !current.has(title)) };
}

function iso(value) {
  if (value instanceof Date) return value.toISOString();
  const text = String(value).replace(' ', 'T');
  return text.endsWith('Z') ? text : `${text}Z`;
}
function sqlMoment(value) { return iso(value).replace('T', ' ').replace('Z', ''); }
function linkList(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(parsed) || parsed.some(title => typeof title !== 'string')) throw new Error('Invalid stored link set.');
  return parsed;
}

export async function historyQuery(params, poolProvider = getPool) {
  const { title, lang } = parseTopic(params.get('title'), params.get('lang') || 'en');
  const requestedDate = historyDate(params.get('date'));
  let connection;
  try {
    const pool = await poolProvider();
    if (!pool) throw new ApiError('Time travel needs MariaDB and an imported Wikipedia revision history.', 503);
    connection = await pool.getConnection();
    await connection.query("SET time_zone = '+00:00'");
    const imports = await connection.query('SELECT * FROM history_imports WHERE lang = ? AND (title = ? OR requested_title = ?) LIMIT 1', [lang, title, title]);
    if (!imports.length) throw new ApiError('No revision history has been imported for this article yet.', 404);
    const capture = imports[0];
    const date = requestedDate || sqlMoment(capture.captured_at);
    const earliest = sqlMoment(capture.earliest), capturedAt = sqlMoment(capture.captured_at);
    // Equal-width strings preserve microsecond ordering; Date would discard those digits.
    const compareTime = value => value.split('.')[0] + '.' + (value.split('.')[1] || '').padEnd(6, '0');
    if (compareTime(date) < compareTime(earliest)) throw new ApiError(`This capture starts at ${iso(capture.earliest)}. Earlier history is unavailable.`, 422);
    if (compareTime(date) > compareTime(capturedAt)) throw new ApiError(`This capture was fetched at ${iso(capture.captured_at)}. Later history is unavailable.`, 422);
    const selected = await connection.query(`SELECT title, revid, revision_time, byte_length, content_available, links_json
      FROM history_articles FOR SYSTEM_TIME AS OF TIMESTAMP ? WHERE lang = ? AND page_id = ?`, [date, lang, capture.page_id]);
    if (!selected.length) throw new ApiError('No imported revision covers that moment.', 422);
    const revision = selected[0];
    if (!revision.content_available) throw new ApiError('The text of this Wikipedia revision is hidden or unavailable; its links cannot be compared.', 422);
    const latestRows = await connection.query('SELECT revid, revision_time, content_available, links_json FROM history_articles WHERE lang = ? AND page_id = ?', [lang, capture.page_id]);
    const latest = latestRows[0];
    if (!latest?.content_available) throw new ApiError('The latest imported revision has unavailable content; comparison is unavailable.', 422);
    const timelineRows = await connection.query(`SELECT revid, revision_time, content_available, JSON_LENGTH(links_json) AS link_count, row_start
      FROM history_articles FOR SYSTEM_TIME ALL WHERE lang = ? AND page_id = ? ORDER BY row_start`, [lang, capture.page_id]);
    const links = linkList(revision.links_json), latestLinks = linkList(latest.links_json);
    return {
      engine: 'mariadb-svt', date: iso(date),
      article: { id: `${lang}:${capture.page_id}`, title: revision.title, lang, revid: Number(revision.revid), timestamp: iso(revision.revision_time), url: `https://${lang}.wikipedia.org/w/index.php?oldid=${revision.revid}`, length: revision.byte_length == null ? null : Number(revision.byte_length) },
      links, ...linkChanges(links, latestLinks),
      latest: { revid: Number(latest.revid), timestamp: iso(latest.revision_time), linkCount: latestLinks.length, url: `https://${lang}.wikipedia.org/w/index.php?oldid=${latest.revid}` },
      coverage: { earliest: iso(capture.earliest), latest: iso(capture.latest), capturedAt: iso(capture.captured_at), revisionCount: Number(capture.revision_count), hasEarlier: Boolean(capture.has_earlier), completeBeforeEarliest: false },
      timeline: timelineRows.map(row => ({ revid: Number(row.revid), timestamp: iso(row.revision_time), date: iso(row.row_start), available: Boolean(row.content_available), linkCount: row.link_count == null ? null : Number(row.link_count) })),
      scope: HISTORY_SCOPE,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('MariaDB revision history is unavailable. Check the connection and run the history importer.', 503);
  } finally { connection?.release(); }
}
