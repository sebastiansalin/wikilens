# WikiLens

A living Wikipedia atlas by **Sebastian, Aksu and Leo**, for Junction 2026.

One persistent workspace combines a star map, directed route finder, article inspector, language comparison and revision history. Paper, Ink and Galaxy are appearances of the same app. Old Atlas/Prism/Cosmos links open the unified workspace.

## Editing-disagreement pilot

The current direction is a graph of **20 Finnish-history articles from MariaDB's M dataset**, with node color showing a transparent 0–100 editing-conflict index. Selecting an article exposes its observed revision period, disputed-revision count, yearly timeline, returning paragraphs and Wikipedia diffs. Blue means less observed conflict, amber/red more, and gray insufficient evidence. This is not a truth, reliability, political-bias or cross-language disagreement score.

The existing explorer remains usable in explicit live-Wikipedia mode. Once `public/data/conflict-pilot.json` exists, an unqualified visit opens the pilot automatically; `?mode=conflict&lang=fi&title=...` links directly to a pilot article. The pilot shows actual links between its 20 articles. Other Wikipedia pages are available by switching back to live mode.

See [the ten-source review and formula](docs/CONFLICT-RESEARCH.md). This prototype has not been shown to outperform previous research.

### Reproduce the real pilot

On this Windows machine, run `npm install`, then `node scripts/bootstrap-local.mjs` for the project-local setup and calculations. Git publication is also available independently with `node scripts/bootstrap-local.mjs --git-only`; it does not require the database or dataset. The script uses your existing GitHub CLI login and performs a normal push to the existing private `sebastiansalin/wikilens` repository. It never force-pushes.

```sh
python -m pip install -r pipeline/requirements.txt
npm run pilot:prepare
```

Preparation downloads all 16 official M release partitions (about 315 MB compressed), verifies the pinned checksum manifest, scans page metadata, selects the 20 most-revised pages before scoring and exports their full available histories. This selection is activity-biased, not representative. Raw text expands substantially; allow disk/RAM headroom. Scoring holds one article's history at a time. For a chosen set, use `python pipeline/prepare_m.py --titles path/to/twenty-titles.json` with exactly 20 unique titles.

For the **MariaDB pipeline**, configure the existing server-side environment variables, then:

```sh
npm run pilot:database
npm run pilot:build:database
```

This creates dedicated `m_article_versions` system-versioned tables, inserts original revision times, and reads the input back using `FOR SYSTEM_TIME ALL` before scoring. Same-second edits receive deterministic microsecond offsets. The importer is immutable and skips an identical capture; it refuses a different capture under the same dataset ID. Use a dedicated MariaDB 10.11+ database. The SQL path still needs execution against an actual server before it can be called validated.

Without MariaDB, `npm run pilot:build` calculates directly from the verified Parquet export. Its provenance explicitly says no MariaDB execution. Both paths write a small public JSON bundle for the frontend; no revision-history processing runs inside a Vercel request. Editor names and raw dumps stay local. Displayed Wikipedia excerpts retain source revision links and CC BY-SA attribution.

Then run `npm test` and `npm run build`. Only deploy after inspecting real scores and source diffs. The app has an explicit missing-data state and does not ship manufactured example scores.

### Current verification and publication status

- Scoring edge-case tests and a synthetic 20-article export test pass; these do not constitute calculations on 20 real Wikipedia pages.
- TypeScript and the production build pass. The existing live Talvisota graph and honest missing-pilot state were visually checked.
- **Real M calculations are not complete:** shell downloads are denied by the environment; the browser download also failed. No public score bundle has been generated.
- **MariaDB execution is not verified:** no connection is configured in this session.
- **GitHub upload is blocked:** the connector returns 404 for `sebastiansalin/wikilens`; its installed-repository search finds no WikiLens repository. Local `git add` also fails because `.git/index.lock` cannot be written. Source is in this working directory; no commit or push was created.
- **Vercel deployment is blocked:** creation of `wikilens` in the connected team returned 403 permission denied. No deployment URL exists for this change.

## Existing explorer features

- Live Wikipedia search, incoming/outgoing links, previews and bounded neighbourhood expansion.
- A force simulation with draggable stars, neighbour movement, pinning, zoom, collision avoidance and reduced-motion support. Node size uses actual pageviews where available, otherwise loaded-map degree. A visible spacing control changes spring distances.
- Directed bidirectional BFS: MariaDB indexed observations when connected, or a bounded live Wikipedia search. Partial results do not claim globally shortest routes. A failed bounded search does not prove no route exists.
- Cross-language outgoing concept overlap, aligned through Wikidata IDs. Similarity measures link overlap, **not truth or political agreement**.
- MariaDB schema, transactional graph cache, indexed adjacency, bounded recursive neighbourhoods and system-versioned edge observations.
- Historical article importer and `FOR SYSTEM_TIME AS OF` API using actual Wikipedia edit times. The sidebar can compare historical source links against the latest imported revision.

## Current limits

The local preview explicitly uses **live Wikipedia**, not MariaDB. Actual MariaDB execution is still unverified; database integration tests require a configured server. Graph display is capped at 160 articles. Full-Wikipedia tiles, global PageRank, Leiden clustering and GPU layout have not been generated. No Vercel deployment has been verified. An independent initial unified UI review scored 7/10; follow-up fixes do not constitute an automatic 9/10 pass.

The authenticated challenge brief has been checked: its focus is MariaDB RAG and/or system-versioned tables. See [challenge mapping](docs/CHALLENGE.md). Existing SQL cache usage alone is not evidence of meeting that requirement.

## Run

Node 22.12+ is required (tested with Node 24.11).

```sh
npm install
npm run dev:browser
```

This serves the live-Wikipedia preview at `http://127.0.0.1:5173`. It makes anonymous Wikimedia requests directly from the browser and never substitutes sample content for real data.

For the server-backed application, use two terminals:

```sh
npm run api
npm run dev
```

Configure a dedicated MariaDB database according to [db/README.md](db/README.md), then initialize it and import one bounded article history:

```sh
node scripts/db-init.mjs
node scripts/import-history.mjs "Talvisota" fi 100
```

Environment variables and credentials stay server-side. `.env`, local runtimes and generated artifacts are ignored. The history importer skips existing captures; it is not a continuously updating Wikipedia mirror.

```sh
npm test
npm run build
npm run build:previews
```

`build` writes the server-backed frontend to `dist`. `build:previews` writes one explicit browser-only build to `previews/wikilens`.

## Map architecture

We are adapting the architecture documented in [Toby Penner's Wikigraph](https://github.com/tfpgh/wikigraph): offline graph processing and tiled map imagery, with a separate routing graph and interactive foreground. The MIT-licensed offline pipeline is pinned in [vendor/wikigraph](vendor/wikigraph/UPSTREAM.md). It is preparation for a larger dataset, not a claim that those data have been built or integrated into this preview. The separate website frontend has not been copied.

See [the architecture decision](docs/MAP-ARCHITECTURE.md) for the data boundary, MariaDB role and scale-up path. Large-scale preprocessing must run outside the browser and request-serving functions. At full scale, keep a versioned compact adjacency export for routing rather than fetching millions of SQL rows per request.

## Team and deployment

Private repository: https://github.com/sebastiansalin/wikilens

Invitations to `leosuojarvi` and `pitkenin` were visible as pending on 2026-11-13. Source publication is still blocked: the GitHub connector cannot access this new repository, and this session cannot stage local Git metadata. The repository's existence does not mean the working tree has been pushed.

Deploy one **new** WikiLens Vercel project after repository access is available. Use Vite, `npm run build`, output `dist`, Node 24 and server-side MariaDB configuration. A local loopback database is not reachable by a deployed Vercel function. Leave `VITE_DATA_MODE` unset for server mode; explicitly set it to `browser` only for the live-Wikipedia alternative. Do not alter unrelated Vercel projects.

## Measurement boundaries

Pageviews are reads, not unique people; missing days and missing articles remain visible. Node degree and multi-hop affinity refer to the loaded graph. Layout ignores direction for physical attraction, but routes follow directed hyperlinks. Link-overlap comparisons cap each edition's outgoing link collection at 500 and distinguish incomplete data. Article length is source bytes, not comparable translated word count.

Historical source-link extraction is narrower than MediaWiki's rendered links: it excludes templates and colon-prefixed targets. Captured revision history has explicit start/end coverage and unavailable revisions stay unavailable. Edge observation timestamps and original article edit timestamps are separate concepts.

## Attribution

Wikipedia contributors: applicable CC BY-SA terms, linked through each article/revision. Wikidata structured data: CC0. WikiLens is independent of Wikimedia. Vendored Wikigraph code: copyright 2026 Toby Penner, MIT; the full license is retained. The team's original application code does not yet have a selected distribution license.
