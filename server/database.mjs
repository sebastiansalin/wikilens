import { createHash } from 'node:crypto';
import { boundedDirectedPath } from './pathfinding.mjs';

let poolPromise;
let lastState = 'not-configured';
export function databaseConfigured() { return Boolean(process.env.MARIADB_HOST && process.env.MARIADB_USER && process.env.MARIADB_DATABASE); }
export function snapshotKey(lang, title) { return createHash('sha256').update(`v3:${lang}:${title}`).digest('hex'); }
function storedArticle(article) {
  const value = { ...article };
  // A lightweight neighbour import must not erase a previously fetched introduction or readership history.
  if (!value.extract) delete value.extract;
  if (value.pageviews == null) for (const key of ['pageviews', 'pageviewDays', 'pageviewStart', 'pageviewEnd']) delete value[key];
  return JSON.stringify(value);
}
export async function getPool() {
  if (!databaseConfigured()) return null;
  if (!poolPromise) poolPromise = import('mariadb').then(({ default: mariadb }) => mariadb.createPool({
    host: process.env.MARIADB_HOST, port: Number(process.env.MARIADB_PORT || 3306), user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD, database: process.env.MARIADB_DATABASE,
    connectionLimit: 3, connectTimeout: 5000, acquireTimeout: 6000, idleTimeout: 30,
    ...(process.env.MARIADB_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
    bigIntAsNumber: true, dateStrings: true, timezone: '+00:00',
  }));
  return poolPromise;
}
export async function databaseHealth(poolProvider = getPool, configured = databaseConfigured()) {
  if (!configured) return { mode: 'wikipedia', database: 'not-configured' };
  try {
    const pool = await poolProvider();
    const rows = await pool.query('SELECT VERSION() AS version');
    // A connected empty schema cannot serve the cache, so test the required tables too.
    await pool.query('SELECT s.cache_key, a.id, l.source_id FROM graph_snapshots s LEFT JOIN articles a ON a.id = s.root_id LEFT JOIN article_links l ON l.snapshot_key = s.cache_key LIMIT 1');
    await pool.query('SELECT source_id, target_id, observed_at, ROW_START FROM edge_observations FOR SYSTEM_TIME ALL LIMIT 1');
    lastState = 'connected';
    return { mode: 'mariadb', database: 'connected', version: rows[0].version, features: ['relational-graph', 'recursive-neighbourhood', 'window-ranking', 'system-versioned-observations'] };
  } catch { lastState = 'unavailable'; return { mode: 'wikipedia', database: 'unavailable' }; }
}
export async function readSnapshot(key, poolProvider = getPool) {
  try {
    const pool = await poolProvider();
    if (!pool) return null;
    const rows = await pool.query('SELECT payload FROM graph_snapshots WHERE cache_key = ? AND expires_at > UTC_TIMESTAMP()', [key]);
    lastState = 'connected';
    if (!rows.length) return null;
    const payload = typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload;
    // Read the visible edges from the indexed relational graph, rather than merely returning the JSON cache.
    const edges = await pool.query('SELECT source_id AS source, target_id AS target FROM article_links WHERE snapshot_key = ? AND displayed = 1', [key]);
    payload.graph.links = edges.map(row => ({ source: row.source, target: row.target }));
    payload.graph.source = 'mariadb';
    return payload;
  } catch { lastState = 'unavailable'; return null; }
}
export async function writeSnapshot(key, snapshot, poolProvider = getPool) {
  let connection;
  try {
    const pool = await poolProvider();
    if (!pool) return false;
    connection = await pool.getConnection(); await connection.beginTransaction();
    const articles = [...new Map([snapshot.graph.root, ...snapshot.allArticles].map(article => [article.id, article])).values()];
    if (articles.length) await connection.batch(`INSERT INTO articles (id, lang, title, qid, byte_length, article_json)
      VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE title = VALUES(title), qid = VALUES(qid), byte_length = VALUES(byte_length), article_json = JSON_MERGE_PATCH(article_json, VALUES(article_json))`,
      articles.map(article => [article.id, article.lang, article.title, article.qid, article.length, storedArticle(article)]));
    await connection.query(`INSERT INTO graph_snapshots (cache_key, root_id, fetched_at, expires_at, payload)
      VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 6 HOUR), ?)
      ON DUPLICATE KEY UPDATE root_id = VALUES(root_id), fetched_at = VALUES(fetched_at), expires_at = VALUES(expires_at), payload = VALUES(payload)`,
      [key, snapshot.graph.root.id, new Date(snapshot.graph.fetchedAt), JSON.stringify(snapshot)]);
    await connection.query('DELETE FROM article_links WHERE snapshot_key = ?', [key]);
    const displayed = new Set(snapshot.graph.links.map(link => `${link.source}>${link.target}`));
    const links = [...new Map([...snapshot.allLinks, ...snapshot.graph.links].map(link => [`${link.source}>${link.target}`, link])).values()];
    if (links.length) await connection.batch('INSERT INTO article_links (snapshot_key, source_id, target_id, displayed) VALUES (?, ?, ?, ?)',
      links.map(link => [key, link.source, link.target, displayed.has(`${link.source}>${link.target}`) ? 1 : 0]));
    await connection.query('DELETE FROM edge_observations WHERE snapshot_key = ?', [key]);
    if (links.length) await connection.batch('INSERT INTO edge_observations (snapshot_key, source_id, target_id, observed_at) VALUES (?, ?, ?, ?)',
      links.map(link => [key, link.source, link.target, new Date(snapshot.graph.fetchedAt)]));
    await connection.commit(); lastState = 'connected'; return true;
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    lastState = 'unavailable'; return false;
  } finally { connection?.release(); }
}
export function databaseNotice() {
  return databaseConfigured() && lastState === 'unavailable' ? 'MariaDB is unavailable; this view uses live Wikipedia data.' : null;
}
export async function closeDatabase() {
  if (poolPromise) {
    try { const pool = await poolPromise; await pool.end(); }
    finally { poolPromise = undefined; }
  }
}

export const NEIGHBOUR_LIMIT = 24;
export const NODE_LIMIT = 160;

export function neighbourhoodSql(direction = 'both') {
  if (!['incoming', 'outgoing', 'both'].includes(direction)) throw new Error('Choose incoming, outgoing, or both link directions.');
  const arcs = direction === 'incoming'
    ? 'SELECT target_id AS source_id, source_id AS target_id FROM fresh_edges'
    : direction === 'outgoing'
      ? 'SELECT source_id, target_id FROM fresh_edges'
      : 'SELECT source_id, target_id FROM fresh_edges UNION SELECT target_id, source_id FROM fresh_edges';
  return `SET STATEMENT max_statement_time=3, max_recursive_iterations=4 FOR
    WITH RECURSIVE fresh_edges AS (
      SELECT DISTINCT l.source_id, l.target_id
      FROM article_links l JOIN graph_snapshots s ON s.cache_key = l.snapshot_key
      JOIN articles a ON a.id = l.source_id JOIN articles b ON b.id = l.target_id
      WHERE s.expires_at > UTC_TIMESTAMP() AND a.lang = ? AND b.lang = ? AND l.source_id <> l.target_id
    ), all_arcs AS (
      SELECT source_id, target_id FROM fresh_edges UNION SELECT target_id, source_id FROM fresh_edges
    ), degrees AS (
      SELECT source_id, COUNT(*) AS degree FROM all_arcs GROUP BY source_id
    ), arcs AS (${arcs}), ranked_arcs AS (
      SELECT e.source_id, e.target_id, ROW_NUMBER() OVER (
        PARTITION BY e.source_id ORDER BY COALESCE(d.degree, 0) DESC, e.target_id
      ) AS neighbour_rank FROM arcs e LEFT JOIN degrees d ON d.source_id = e.target_id
    ), walk (article_id, hops) AS (
      SELECT CAST(? AS CHAR(64)), 0
      UNION DISTINCT
      SELECT e.target_id, w.hops + 1 FROM walk w JOIN ranked_arcs e ON e.source_id = w.article_id
      WHERE w.hops < ? AND e.neighbour_rank <= ${NEIGHBOUR_LIMIT}
    ), distances AS (
      SELECT article_id, MIN(hops) AS hop_distance FROM walk GROUP BY article_id
    )
    SELECT a.article_json, a.id, d.hop_distance, COALESCE(g.degree, 0) AS observed_degree,
      POW(0.5, GREATEST(d.hop_distance - 1, 0)) AS affinity
    FROM distances d JOIN articles a ON a.id = d.article_id LEFT JOIN degrees g ON g.source_id = a.id
    ORDER BY d.hop_distance, observed_degree DESC, a.id LIMIT ${NODE_LIMIT + 1}`;
}

// Depth states are deduplicated in SQL, not enumerated paths. With fanout 24 and depth <=3,
// the walk has at most 1 + 24 + 24^2 + 24^3 states before deduplication; cycles cannot recurse forever.
export async function neighbourhood(root, { depth = 2, direction = 'both' } = {}, poolProvider = getPool) {
  if (!Number.isInteger(depth) || depth < 1 || depth > 3) throw new Error('Traversal depth must be between 1 and 3.');
  const sql = neighbourhoodSql(direction);
  const pool = await poolProvider();
  if (!pool) throw new Error('MariaDB is not configured.');
  const rows = await pool.query(sql, [root.lang, root.lang, root.id, depth]);
  const nodes = rows.slice(0, NODE_LIMIT).map(row => ({
    ...(typeof row.article_json === 'string' ? JSON.parse(row.article_json) : row.article_json),
    id: row.id, root: row.id === root.id, hopDistance: Number(row.hop_distance),
    affinity: Number(row.affinity), degree: Number(row.observed_degree),
  }));
  if (!nodes.some(node => node.id === root.id)) throw new Error('The root article is not stored in MariaDB.');
  const ids = nodes.map(node => node.id), placeholders = ids.map(() => '?').join(',');
  const links = await pool.query(`SET STATEMENT max_statement_time=3 FOR
    SELECT DISTINCT l.source_id AS source, l.target_id AS target
    FROM article_links l JOIN graph_snapshots s ON s.cache_key = l.snapshot_key
    WHERE s.expires_at > UTC_TIMESTAMP() AND l.source_id IN (${placeholders}) AND l.target_id IN (${placeholders})`, [...ids, ...ids]);
  const rootOutgoing = new Set(links.filter(link => link.source === root.id).map(link => link.target));
  const rootIncoming = new Set(links.filter(link => link.target === root.id).map(link => link.source));
  for (const node of nodes) if (!node.root) {
    node.direction = rootOutgoing.has(node.id) && rootIncoming.has(node.id) ? 'both'
      : rootOutgoing.has(node.id) ? 'outgoing' : rootIncoming.has(node.id) ? 'incoming' : undefined;
  }
  lastState = 'connected';
  return { nodes, links: links.map(({ source, target }) => ({ source, target })), analysis: {
    engine: 'mariadb-recursive-cte', depth, direction, nodeLimit: NODE_LIMIT, neighbourLimit: NEIGHBOUR_LIMIT,
    returnedNodes: nodes.length, limited: rows.length > NODE_LIMIT, sampled: true,
    scope: 'Fresh observed Wikipedia links, not the complete Wikipedia graph',
    method: 'Shortest hop distance within the bounded traversal; affinity = 0.5^(hops-1), root = 1. Each frontier keeps its 24 highest observed-degree neighbours. Degree counts distinct neighbours in fresh stored observations.',
    queriedAt: new Date().toISOString(),
  } };
}

// Compatibility helper for importer/team scripts, now excluding expired observations too.
export async function traverse(rootId, depth = 2) {
  const pool = await getPool();
  if (!pool) throw new Error('MariaDB is not configured.');
  const rows = await pool.query('SELECT article_json FROM articles WHERE id = ?', [rootId]);
  if (!rows.length) return [];
  const root = typeof rows[0].article_json === 'string' ? JSON.parse(rows[0].article_json) : rows[0].article_json;
  return (await neighbourhood(root, { depth, direction: 'outgoing' }, async () => pool)).nodes;
}

export async function shortestPath(from, to, { maxDepth = 6, maxVisited = 5000 } = {}, poolProvider = getPool) {
  if (from.lang !== to.lang) throw new Error('A directed article path must stay in one Wikipedia edition.');
  const pool = await poolProvider();
  if (!pool) throw new Error('MariaDB is not configured.');
  const connection = await pool.getConnection();
  const scope = 'Fresh indexed MariaDB observations in one language edition, not all of Wikipedia';
  const observedAt = new Date();
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction();
    const stored = await connection.query('SELECT id FROM articles WHERE id IN (?, ?)', [from.id, to.id]);
    if (new Set(stored.map(row => row.id)).size < (from.id === to.id ? 1 : 2)) {
      return { status: 'limited', articles: [], links: [], hops: null, engine: 'mariadb-bfs', scope,
        visited: stored.length, complete: false, notices: ['One or both articles have not been imported into the MariaDB graph. Explore them to add observations.'] };
    }
    return await boundedDirectedPath(from, to, async (frontier, direction) => {
      const ids = frontier.map(article => article.id), placeholders = ids.map(() => '?').join(',');
      const rootSide = direction === 'outgoing' ? 'source_id' : 'target_id';
      const neighbourSide = direction === 'outgoing' ? 'target_id' : 'source_id';
      // Both directions use their corresponding adjacency index; all frontier nodes are batched.
      const rows = await connection.query(`SET STATEMENT max_statement_time=3 FOR
        SELECT DISTINCT l.source_id AS source, l.target_id AS target, a.article_json
        FROM article_links l JOIN graph_snapshots s ON s.cache_key = l.snapshot_key
        JOIN articles a ON a.id = l.${neighbourSide}
        WHERE l.${rootSide} IN (${placeholders}) AND s.expires_at > ? AND a.lang = ?
        ORDER BY l.${rootSide}, l.${neighbourSide} LIMIT 10001`, [...ids, observedAt, from.lang]);
      const included = rows.slice(0, 10000);
      return { links: included.map(({ source, target }) => ({ source, target })),
        articles: included.map(row => typeof row.article_json === 'string' ? JSON.parse(row.article_json) : row.article_json),
        complete: rows.length <= 10000,
        ...(rows.length > 10000 ? { notice: 'A database frontier exceeded the 10,000-edge query limit.' } : {}),
      };
    }, { maxDepth, maxVisited, engine: 'mariadb-bfs', scope });
  } finally {
    await connection.rollback().catch(() => {});
    connection.release();
  }
}
