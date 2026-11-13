-- Historical Wikipedia edits, distinct from the app's edge observation timestamps.
-- MariaDB 10.11+ is required for inserting the original edit times.
CREATE TABLE IF NOT EXISTS history_imports (
  lang VARCHAR(8) CHARACTER SET ascii NOT NULL,
  page_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  requested_title VARCHAR(255) NOT NULL,
  earliest TIMESTAMP(6) NOT NULL,
  latest TIMESTAMP(6) NOT NULL,
  captured_at TIMESTAMP(6) NOT NULL,
  revision_count INT UNSIGNED NOT NULL,
  has_earlier BOOLEAN NOT NULL,
  PRIMARY KEY (lang, page_id),
  KEY history_title (lang, title),
  KEY history_requested_title (lang, requested_title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS history_articles (
  lang VARCHAR(8) CHARACTER SET ascii NOT NULL,
  page_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  revid BIGINT UNSIGNED NOT NULL,
  revision_time TIMESTAMP(6) NOT NULL,
  byte_length INT UNSIGNED NULL,
  content_available BOOLEAN NOT NULL,
  links_json JSON NULL,
  wikitext MEDIUMTEXT COMPRESSED NULL,
  row_start TIMESTAMP(6) GENERATED ALWAYS AS ROW START INVISIBLE,
  row_end TIMESTAMP(6) GENERATED ALWAYS AS ROW END INVISIBLE,
  PERIOD FOR SYSTEM_TIME (row_start, row_end),
  PRIMARY KEY (lang, page_id),
  KEY history_asof (lang, page_id, row_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin WITH SYSTEM VERSIONING;
