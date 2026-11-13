-- Inspect only fresh observed adjacency. Bind values, never concatenate title input.
SELECT DISTINCT l.target_id FROM article_links l
JOIN graph_snapshots s ON s.cache_key = l.snapshot_key
WHERE l.source_id = ? AND s.expires_at > UTC_TIMESTAMP();

SELECT DISTINCT l.source_id FROM article_links l
JOIN graph_snapshots s ON s.cache_key = l.snapshot_key
WHERE l.target_id = ? AND s.expires_at > UTC_TIMESTAMP();

-- Same Wikidata concept in distinct language editions.
SELECT lang, title, byte_length FROM articles WHERE qid = ? ORDER BY lang;

-- Production bounded recursive SQL (freshness, ranking, timeout, directions, depth 1..3)
-- is maintained in server/database.mjs: neighbourhoodSql(direction).
-- It is executed by GET /api/neighbourhood?title=Apple&lang=en&depth=2.

-- What WikiLens had recorded at a database time, not an asserted past Wikipedia state.
-- observed_at is when the API result was captured; ROW_START/ROW_END are database times.
SELECT source_id, target_id, observed_at
FROM edge_observations FOR SYSTEM_TIME AS OF ?
WHERE snapshot_key = ?;

SELECT source_id, target_id, observed_at, ROW_START, ROW_END
FROM edge_observations FOR SYSTEM_TIME ALL
WHERE snapshot_key = ? ORDER BY ROW_START DESC LIMIT 100;

-- Current snapshot coverage by language; window ranking is computed inside SQL.
SELECT lang, title, observed_neighbours,
  DENSE_RANK() OVER (PARTITION BY lang ORDER BY observed_neighbours DESC) AS observed_rank
FROM (
  SELECT a.lang, a.title, COUNT(DISTINCT l.target_id) AS observed_neighbours
  FROM articles a JOIN article_links l ON l.source_id = a.id
  JOIN graph_snapshots s ON s.cache_key = l.snapshot_key
  WHERE s.expires_at > UTC_TIMESTAMP()
  GROUP BY a.id, a.lang, a.title
) coverage;

-- Deliberate maintenance only; this does not remove versioned audit history.
DELETE FROM graph_snapshots WHERE expires_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY);
