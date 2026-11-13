-- Dedicated immutable M snapshot. Revision times and computation times are distinct.
CREATE TABLE IF NOT EXISTS m_conflict_imports (
  dataset VARCHAR(40) NOT NULL PRIMARY KEY,
  export_sha256 CHAR(64) NOT NULL,
  manifest JSON NOT NULL,
  imported_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS m_article_versions (
  dataset VARCHAR(40) NOT NULL,
  page_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  rev_id BIGINT UNSIGNED NOT NULL,
  parent_id BIGINT UNSIGNED NOT NULL,
  revision_time DATETIME(6) NOT NULL,
  editor VARCHAR(255) NULL,
  anonymous BOOLEAN NOT NULL,
  edit_comment TEXT NULL,
  minor BOOLEAN NOT NULL,
  sha1 VARCHAR(64) NULL,
  byte_length BIGINT UNSIGNED NULL,
  wikitext MEDIUMTEXT COMPRESSED NULL,
  row_start TIMESTAMP(6) GENERATED ALWAYS AS ROW START INVISIBLE,
  row_end TIMESTAMP(6) GENERATED ALWAYS AS ROW END INVISIBLE,
  PERIOD FOR SYSTEM_TIME (row_start,row_end),
  PRIMARY KEY(dataset,page_id),
  KEY article_time(dataset,page_id,row_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin WITH SYSTEM VERSIONING;

-- Original source-time access (last observed revision, not proof that suppressed edits did not exist):
-- SELECT title, rev_id, wikitext FROM m_article_versions
-- FOR SYSTEM_TIME AS OF TIMESTAMP '2010-01-01 00:00:00'
-- WHERE dataset='m-2026-10' AND page_id=?;
-- Scorer input:
-- SELECT ... FROM m_article_versions FOR SYSTEM_TIME ALL
-- WHERE dataset=? AND page_id=? ORDER BY revision_time,rev_id;
