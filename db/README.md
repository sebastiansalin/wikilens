# MariaDB graph storage

The optional persistent backend targets MariaDB 11.4+ with InnoDB and utf8mb4. A real database connection is required for `/api/health` to report `database: connected`; the public API otherwise reports `mode: wikipedia`. No in-memory or live-API response is advertised as a database-backed result.

## Initialize and import

1. Create a database named `wikilens` and an application account with privileges on that database.
2. Copy `.env.example` to `.env` and set the connection fields. Use TLS (`MARIADB_SSL=true`) for a remote database with a trusted certificate. Keep credentials off Git and out of frontend environment variables.
3. Run `node scripts/db-init.mjs`.
4. Run `node scripts/import-topics.mjs Apple "Quantum mechanics" --languages=en,ru,uk`.
5. Run `npm run api`; `GET http://127.0.0.1:8787/api/health` verifies the connection and schema.

`db-init` executes repeatable table creation; it does not create an administrative database user. The importer fails when MariaDB is unavailable, so a successful Wikipedia-only fetch cannot be mistaken for a completed import.

## Data model and freshness

- `articles`: canonical per-language page IDs, titles, Wikidata QIDs, byte lengths and article metadata. Index `(qid, lang)` aligns editions; `(lang, title)` supports title access.
- `graph_snapshots`: bounded neighbourhood observations with capture/expiry timestamps and full outgoing concept sets. Six-hour database expiry; successful snapshots can also be served by a one-hour process cache.
- `article_links`: directed observed edges, indexed both ways, scoped to a snapshot. A separate display flag preserves the difference between the sampled visual neighbourhood and the larger imported outgoing neighbourhood.
- `edge_observations`: a MariaDB **system-versioned table** recording each imported edge and its API observation time. `FOR SYSTEM_TIME AS OF` can reconstruct what WikiLens had recorded at a database time. This is an observation audit, not the original edit history of Wikipedia. No unobserved historical state is inferred.

Cache writes, relational edge replacement and temporal observation replacement are one transaction. Reads retrieve metadata and concept sets from the JSON snapshot and visible edges from the relational `article_links` table. Partial neighbour imports merge JSON metadata without erasing previously loaded introductions or pageview histories. Expired snapshot edges are excluded from analysis immediately; deletion is a deliberate maintenance operation in `queries.sql`. Temporal audit history is retained separately and needs an explicit retention policy before long-running production use. Failed upstream requests are never cached.

`GET /api/neighbourhood?title=Apple&lang=en&depth=2&direction=both` executes the actual SQL analysis. It requires MariaDB and returns HTTP 503 when the database is absent or cannot complete the query. It never silently replaces SQL traversal with live-API data.

The query combines three MariaDB features:

1. **Recursive CTE:** follow the stored graph for one to three hops. `UNION DISTINCT` deduplicates `(article, depth)` states instead of enumerating every path, and depth limits terminate cycles.
2. **Window function:** `ROW_NUMBER() OVER (PARTITION BY source_id ...)` retains at most 24 neighbours per frontier, ranking them by their observed degree. This prefers established hubs and is an explicit sampling decision.
3. **Relational joins and aggregation:** exclude expired snapshots and other languages, deduplicate repeated edge observations, calculate each article's distinct observed degree and minimum hop distance, and read actual directed edges between returned nodes.

Results are capped at 160 articles. Each statement has a three-second timeout and a four-iteration recursion ceiling. A three-hop walk has at most `1 + 24 + 24^2 + 24^3` candidate states before deduplication. The final result limit alone is **not** treated as a bound on intermediate work.

Each node includes `hopDistance`, `degree`, and `affinity = 0.5^(hops-1)` (the root has affinity 1). Distances are shortest paths within the **bounded traversal of fresh imported observations**, not guaranteed shortest paths across all Wikipedia. Degree is observed-neighbour count, not a complete backlink count or popularity score. `analysis` explains the engine, bounds, sampling and timestamp. Root statistics retain their original meaning from the initial Wikipedia observation. `traverse(rootId, depth)` remains a script helper for outgoing traversal.

## Directed article paths

`GET /api/path?from=Apple&to=Fruit&lang=en&maxDepth=6` searches from one article to another. Both endpoints must belong to the same language edition. Wikipedia URLs and Wikidata identifiers are accepted through the same validated topic-resolution flow as the graph endpoints.

With MariaDB connected, bidirectional breadth-first search queries outgoing edges from the source side and incoming edges from the target side. Each frontier is queried in one SQL batch using the corresponding adjacency index. Queries use a consistent read transaction and a fixed freshness cutoff. There is no per-frontier neighbour sampling in this path mode: each SQL query admits up to 10,000 distinct edges, with a three-second timeout, a 5,000-article total bound, and at most six hops. The result is scoped to fresh indexed observations, **not the complete Wikipedia graph**. Missing endpoint imports return a limited result.

Without MariaDB, the explicit live mode reuses cached outgoing observations and uses MediaWiki `generator=links` / `generator=backlinks` for further adjacency. Backlink lookup includes one redirect level and excludes redirect pages from route nodes. At most 12 additional adjacency requests and 1,500 articles are admitted. Each query's continuation token is treated as incomplete coverage. This mode does not fetch full graph snapshots for every search step.

Response contract:

```text
{ status: 'found' | 'not-found' | 'limited', articles, links, hops,
  engine: 'mariadb-bfs' | 'wikipedia-bounded-bfs', scope,
  visited, complete, notices }
```

`found` with `complete: true` means a shortest directed route in the stated scope was established. A found route with `complete: false` is valid but may have a shorter alternative outside incomplete link lists. `not-found` is reserved for exhaustion of a complete search scope. Resource/depth limits and incomplete lists return `limited`, never a global no-route claim. A direct edge and a zero-hop identity route are necessarily minimal even if unrelated adjacency is incomplete. Links in the returned route always point from source toward destination.

## What is measured

`GET /api/article?title=Apple&lang=en` returns `{article}` for lightweight node previews. It fetches the article metadata and introduction without loading neighbours or comparison sets. A strict Wikidata ID such as `title=Q89` resolves the corresponding language sitelink first and verifies the returned article matches that concept. This endpoint works in both the server API and explicit browser data mode.

The live importer gathers up to 500 outgoing article links and 500 direct non-redirect article backlinks per edition. It follows MediaWiki continuation tokens until the cap; completeness flags depend on continuation, never on a guessed total. Up to 49 nodes are shown; similarity uses the larger outgoing concept set, not those visible nodes. Neighbour-to-neighbour edges are separately verified through the API.

Wikidata QIDs align corresponding articles and target concepts across languages. Redirects are resolved. Missing articles, unmapped concepts and the root concept are excluded. Pairwise score is `100 * intersection_size / union_size` on unique outgoing concept QIDs. Empty unions and unavailable editions have no score. Incomplete sets are marked incomplete. Template/navigation links are included by MediaWiki's link table. The statistic measures connection overlap; it does not establish agreement, bias, sentiment or factual accuracy.

Article length is source wikitext **bytes**. It is not a language-neutral word count. Backlinks are direct incoming article links, not visits or references. Metadata is fetched at different times rather than from a single synchronized Wikimedia dump.

Displayed articles also request Wikimedia `prop=pageviews` for the most recent 30 days. `pageviews` sums only available daily values, with `pageviewDays`, `pageviewStart` and `pageviewEnd` describing actual coverage. Missing data remains `null`; a known zero remains zero. These are page views, not unique readers. Pageview requests are bounded to the displayed sample and follow continuation. Unavailable readership data does not prevent graph exploration.

## Verification status

Algorithm, continuation, input-validation, redirect and incomplete-data tests are in `tests/backend-core.test.mjs`. Neighbourhood bounds, source honesty, transactional observations and pageview coverage tests are in `tests/database-neighbourhood.test.mjs`. Path tests in `tests/backend-path.test.mjs` compare bidirectional search against exhaustive BFS on 120 deterministic directed graphs, and cover directionality, resource caps, partial results and database/live engine selection. At implementation time, 39 backend fixture tests pass; the separate MariaDB integration test is skipped by default because no running database has been verified. Passing fixture tests does not validate MariaDB SQL execution.

Against an initialized dedicated development database, run `node --env-file=.env --test tests/database-integration.test.mjs` with `WIKILENS_DB_INTEGRATION=1` in the environment. It exercises actual outgoing/incoming/both traversal, cycles, expiry exclusion, depth-decay affinity and versioned observation reads. Its uniquely named fixture rows are written inside a transaction and rolled back. It never deletes unrelated data or creates credentials.

## Sources and attribution

- [MediaWiki links API](https://www.mediawiki.org/wiki/API:Links)
- [MediaWiki backlinks API](https://www.mediawiki.org/wiki/API:Backlinks)
- [Wikidata sitelinks](https://www.wikidata.org/wiki/Help:Sitelinks)
- [MariaDB recursive CTE](https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/selecting-data/common-table-expressions/recursive-common-table-expressions-overview)
- [MariaDB window ranking](https://mariadb.com/docs/server/reference/sql-functions/special-functions/window-functions/row_number)
- [MariaDB system-versioned tables](https://mariadb.com/docs/server/reference/sql-structure/temporal-tables/system-versioned-tables)
- [MariaDB statement timeouts](https://mariadb.com/docs/server/ha-and-performance/optimization-and-tuning/query-optimizations/aborting-statements)
- [MediaWiki PageViewInfo](https://www.mediawiki.org/wiki/Extension:PageViewInfo)

Wikipedia excerpts come from Wikipedia contributors, under CC BY-SA 4.0; each article links to its source and revision history is available there. Wikidata structured data is CC0. Images are referenced from Wikimedia and may have individual licences; this prototype does not relicense them.
