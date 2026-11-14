# WikiLens: Wikipedia Through Time

Team: Sebastian, Aksu and Leo.

## Challenge fit

The authenticated [Junction challenge](https://hackjunction.app/participate/45/challenges/307), read on 13 November 2026, offers native MariaDB vector/RAG and system-versioned-table tracks. WikiLens targets the **SVT track** with a disagreement atlas calculated from the complete Finnish-history M capture in MariaDB. Choose an article and monthly observation window, then inspect repeated passage changes and source revision diffs. Native vector search and a RAG answer generator are not implemented. The earlier live explorer and bounded historical-link API remain separate features.

The published criteria each carry 20%: creative/effective use of MariaDB RAG and/or SVT; implementation and scalability; usefulness; design and demo; originality. These are judging criteria, not scores or a claim that this implementation has passed them.

| Criterion | Concrete evidence to demonstrate | Remaining limitation |
| --- | --- | --- |
| MariaDB | Full M import into system-versioned tables; `FOR SYSTEM_TIME ALL` readback of 19,742 articles / 862,076 revisions; every canonical history digest matched | Production serves the verified static export, not a remotely hosted MariaDB instance |
| Implementation | Transactional article checkpoints, immutable captures, 64 evidence shards, searchable full catalog, 160-node event horizon | No production concurrency/load benchmark; M is a selected collection, not all Finnish Wikipedia |
| Usefulness | Monthly content-candidate rates, passage alternatives, cleanup/maintenance/uncertain categories, exact source diffs | Heuristic classification remains unvalidated; detected reversals do not establish truth or bias |
| Design/demo | Mint/charcoal atlas, monthly controls, graph navigation and responsive article inspector | See release-specific browser checks; automated tests do not establish UI quality |
| Originality | Explore recurring changes in their article-link neighborhood and inspect the evidence | Links use latest captured text, not historical slider dates; language overlap is a separate live feature |

The complete import, readback and scoring are recorded in [atlas-calculation.json](qa/atlas-calculation.json). Export consistency checks are in [atlas-validation.json](qa/atlas-validation.json). Real MariaDB integration tests passed on 14 November 2026. Independent accuracy labels and comparative precision/recall remain pending. The following sections document the separate bounded historical-link API, not the full atlas importer.

## Two different clocks

`edge_observations` records when WikiLens fetched graph edges. Its system time answers **when this app observed an edge**. It does not establish when Wikipedia added or removed that link.

`history_articles` imports actual Wikipedia revisions, retaining their original revision IDs and UTC edit timestamps. Its system period uses those edit times. The next revision ends the previous version. Same-second edits are ordered with microsecond offsets while `revision_time` retains the source timestamp. This is the table used by `/api/history`; it is not interchangeable with observation history.

The implementation follows the timestamp import technique documented by the official [MariaDB system-versioning starter](https://github.com/MariaDB/mariadb-system-versioning-wikipedia): enable `system_versioning_insert_history` for the import session, specify historical interval boundaries, and leave the newest version's end to MariaDB. This requires MariaDB 10.11 or later and a server configuration that permits history insertion.

## Run a bounded real-data import

Configure the existing `MARIADB_*` settings in an ignored `.env` file. Do not commit credentials. Then, from the project root:

```sh
node scripts/import-history.mjs "Talvisota" fi 100
node scripts/import-history.mjs "Finland" en 100
```

The importer applies `db/history.sql`, follows the live [MediaWiki Revisions API](https://www.mediawiki.org/wiki/API:Revisions), and imports up to 100 consecutive revisions. Content requests are capped at 50 per API response and continued using the provided token. It uses an article-scoped advisory lock and one transaction. Existing captures are skipped; orphaned rows cause an error. No imported history is deleted, overwritten, or silently refreshed.

The title argument may also be a supported Wikipedia article URL. Supported languages are `en`, `fi`, `ru`, `uk`, `de`, `fr`, `es`, and `ja`. The command prints the actual capture bounds and count only after committing. A fresh database or an explicitly designed refresh procedure is required to replace a capture; this prototype deliberately has no destructive refresh command.

Example requests after a successful import:

```text
/api/history?title=Talvisota&lang=fi
/api/history?title=Talvisota&lang=fi&date=2026-11-01
```

The example date is not a promise of coverage. First inspect `coverage.earliest` and `coverage.capturedAt`, or choose an exact `timeline[].date`. A bare date means midnight UTC. Date/timestamp parameters are validated and passed as SQL parameters.

## Response and interpretation

- `engine`: `mariadb-svt`, emitted only after successful database queries.
- `article`: selected revision ID, original timestamp, byte length and exact Wikipedia `oldid` URL.
- `links`: explicit wikitext targets in the selected revision.
- `added` / `removed`: link titles added or removed **from the selected revision to the latest imported revision**.
- `latest`: the latest revision in this capture, which may no longer be Wikipedia's live latest revision.
- `coverage`: earliest and latest imported boundaries, capture time, count, and whether the API reported older history.
- `timeline`: revision IDs, original timestamps, queryable system-time boundaries, availability and extracted link counts.

Hidden revision content is preserved as an unavailable interval; the app never carries older links through that interval. Dates before the earliest imported revision or after capture return HTTP 422. A missing import returns 404. Missing/unreachable MariaDB or missing tables returns 503. Historical mode never silently falls back to a current Wikipedia graph.

The link parser extracts explicit `[[target]]` syntax, removes captions/sections, ignores comments and literal code/nowiki blocks, deduplicates targets and excludes colon targets. It is **not a full MediaWiki renderer**: template-generated links are absent, valid main-space titles containing colons are excluded, and redirects, title renames and historical Wikidata identity are not resolved. Article titles shown in an imported history are the current canonical title returned by the API, not reconstructed historical page names. Those limits apply to link counts and differences.

Wikipedia and its contributors remain the source. Revision URLs provide attribution and a way to inspect the original; Wikipedia text is available under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

## Scaling path and verification

The official [challenge datasets](https://github.com/MariaDB/mariadb-wikipedia-datasets) provide a larger route beyond small live-API captures. The atlas implements that route for all M histories through `pipeline/import-atlas.mjs` and `pipeline/build-atlas.mjs`, preserving source hashes and article checkpoints. It does not add partitioning, multilingual embeddings or native vector search. Do not scale the separate live-API importer into a whole-Wikipedia crawler.

`node --test tests/history.test.mjs` checks calendar validation, link extraction, same-second boundaries, hidden content, revision-chain gaps, continuation, parameterized time selection, coverage failures, transactional rollback and safe re-import behavior. These tests use fixtures/mocked connections. The additional real MariaDB integration test exercises directed neighborhoods, shortest paths and system-versioned observations; full M import/readback is evidenced separately by the calculation report. Neither is a production performance benchmark or proof of every legacy `/api/history` flow.
