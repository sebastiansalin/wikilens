-- MariaDB 11.4+ / InnoDB. All statements are repeatable. Use utf8mb4 for multilingual titles.
CREATE TABLE IF NOT EXISTS articles (
  id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  lang VARCHAR(8) CHARACTER SET ascii NOT NULL,
  title VARCHAR(512) NOT NULL,
  qid VARCHAR(32) CHARACTER SET ascii NULL,
  byte_length INT UNSIGNED NOT NULL DEFAULT 0,
  article_json JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX concept_language (qid, lang),
  INDEX language_title (lang, title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS graph_snapshots (
  cache_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  root_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  fetched_at DATETIME(3) NOT NULL,
  expires_at DATETIME NOT NULL,
  payload JSON NOT NULL,
  INDEX freshness (expires_at),
  INDEX article_snapshot (root_id, fetched_at),
  CONSTRAINT snapshot_root FOREIGN KEY (root_id) REFERENCES articles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- This records when WikiLens observed an edge. System time is database transaction time,
-- not the time the Wikipedia article was edited. No historical Wikipedia data is invented.
CREATE TABLE IF NOT EXISTS edge_observations (
  snapshot_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  target_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  observed_at DATETIME(3) NOT NULL,
  PRIMARY KEY (snapshot_key, source_id, target_id),
  INDEX observed_outgoing (source_id, target_id),
  INDEX observed_incoming (target_id, source_id)
) ENGINE=InnoDB WITH SYSTEM VERSIONING;

CREATE TABLE IF NOT EXISTS article_links (
  snapshot_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  target_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  displayed BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (snapshot_key, source_id, target_id),
  INDEX outgoing (source_id, target_id),
  INDEX incoming (target_id, source_id),
  CONSTRAINT link_snapshot FOREIGN KEY (snapshot_key) REFERENCES graph_snapshots(cache_key) ON DELETE CASCADE,
  CONSTRAINT link_source FOREIGN KEY (source_id) REFERENCES articles(id),
  CONSTRAINT link_target FOREIGN KEY (target_id) REFERENCES articles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
