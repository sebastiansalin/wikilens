# Conflict pilot verification - 2026-11-13 UTC

## Data and database

- All 16 m-2026-10 Parquet partitions passed the official pinned SHA-256 manifest check.
- Selected the 20 highest-revision-count articles before scoring: 37,318 revisions, 54 directed internal links. This sample is activity-biased.
- Original JSONL SHA-256: `80c22a84b79a7d083991f889605ca2d1822bdb3ad7675726da7c623cd0b085dd`.
- Imported revision intervals into m_article_versions on MariaDB 11.4.12; read all selected rows back using FOR SYSTEM_TIME ALL; calculated the public bundle from that readback.
- Database: 37,318 historical rows, 20 distinct pages, 20 current rows; earliest timestamp 2003-02-21 13:15:35, latest 2026-09-28 15:05:33 UTC.
- AS OF 2010-01-01 returned Talvisota revision 7751713, matching the independently selected latest source revision at that time.
- Windows UTC conversion no longer depends on system timezone data; tzdata is also declared for Windows installs.
- Fixed Node JSONL reading to split only on LF: an actual Tarja Halonen revision contains U+2029 inside a JSON string. No source text was changed or dropped.

## Validation

- All 77 Node tests passed with WIKILENS_DB_INTEGRATION=1 and the real local database; zero skipped.
- Both Python UTC regression tests passed. TypeScript and Vite production build passed with the real pilot bundle.
- Synthetic fixtures remain temporary and never supply public scores.
- Brave: the real 20-node graph displays score colors and accurate numeric scores; timeline and evidence expand, and source revision links point to Finnish Wikipedia.
- Opened [revision 23674279](https://fi.wikipedia.org/w/index.php?diff=23674279&oldid=23674278) from the highest-scoring article. It is a name-vandalism rollback. Repeated vandalism can contribute even with the cleanup-comment discount. The UI explicitly says so; this is not proof of substantive editorial disagreement.

## Publication and boundaries

- Initial source publication is verified in github-publication.md. The real bundle and fixes were published in commit `236702389fe999acd781a48555bd34fe3b650871`; all seven updated remote file hashes match local bytes.
- Production deployment `dpl_BzMAn1uHwC4vRmxToxfkQwBHDc9X` is Ready (19-second build), serving https://wikilens-junction2026.vercel.app from project wikilens in team mv-c84d.
- Live browser checks: automatic pilot loading, 20 graph nodes, score colors, ranking navigation to Hanoi Rocks (0), correct zero-dispute count, source attribution. Local UI additionally checked Tarja Halonen (73.8) with its one excluded history gap, yearly timeline, returning passages and revision links.
- The public pilot is a portable snapshot computed using MariaDB, not a live connection from Vercel to the local database.
- No human-labeled precision/recall evaluation, comparative superiority, complete bot exclusion, semantic agreement, or cross-language disagreement claim is supported.
- Zero means no qualifying repeated mutual full-text restores in the available history. Partial wording disputes and talk-page debates can be missed.
