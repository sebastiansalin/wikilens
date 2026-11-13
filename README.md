# WikiLens

A living Wikipedia atlas by **Sebastian, Aksu and Leo**, for Junction 2026.

**Live site: https://wikilens-junction2026.vercel.app**

One persistent workspace combines a star map, directed route finder, article inspector, language comparison and revision history. Paper, Ink and Galaxy are appearances of the same app. Old Atlas/Prism/Cosmos links open the unified workspace.

## Editing-disagreement pilot

The current direction is a graph of **20 Finnish-history articles from MariaDB's M dataset**, with node color showing a transparent 0–100 editing-conflict index. Selecting an article exposes its observed revision period, disputed-revision count, yearly timeline, returning paragraphs and Wikipedia diffs. Blue means less observed conflict, amber/red more, and gray insufficient evidence. This is not a truth, reliability, political-bias or cross-language disagreement score.

The existing explorer remains usable in explicit live-Wikipedia mode. Once `public/data/conflict-pilot.json` exists, an unqualified visit opens the pilot automatically; `?mode=conflict&lang=fi&title=...` links directly to a pilot article. The pilot shows actual links between its 20 articles. Other Wikipedia pages are available by switching back to live mode.

See [the ten-source review and formula](docs/CONFLICT-RESEARCH.md). This prototype has not been shown to outperform previous research.

### Reproduce the real pilot

On this Windows machine, run `npm install`, then `node scripts/bootstrap-local.mjs` for the project-local setup and calculations. Git publication is also available independently with `node scripts/bootstrap-local.mjs --git-only` from a checkout with writable Git metadata and the existing remote history; it does not require the database or dataset. The script uses your existing GitHub CLI login and performs a normal push to the existing private `sebastiansalin/wikilens` repository. It never force-pushes. The current managed workspace cannot write `.git` or read GitHub CLI configuration, so its source was published through the connected GitHub API instead. Its local Git metadata has not been synchronized with the remote commits.

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

This creates dedicated `m_article_versions` system-versioned tables, inserts original revision times, and reads the input back using `FOR SYSTEM_TIME ALL` before scoring. Same-second edits receive deterministic microsecond offsets. The importer is immutable and skips an identical capture; it refuses a different capture under the same dataset ID. This path has been executed on MariaDB 11.4.12: 37,318 historical revisions and 20 current rows. An `AS OF` query for Talvisota on 2010-01-01 returned the expected revision 7751713.

Without MariaDB, `npm run pilot:build` calculates directly from the verified Parquet export. Its provenance explicitly says no MariaDB execution. Both paths write a small public JSON bundle for the frontend; no revision-history processing runs inside a Vercel request. Editor names and raw dumps stay local. Displayed Wikipedia excerpts retain source revision links and CC BY-SA attribution.

Then run `npm test` and `npm run build`. Only deploy after inspecting real scores and source diffs. The app has an explicit missing-data state and does not ship manufactured example scores.

### Current verification and publication status

- **Real M calculations complete:** all 16 official partitions verified; 20 most-revised articles selected before scoring; 37,318 revisions processed and 54 directed links exported to `public/data/conflict-pilot.json`.
- **MariaDB execution verified:** histories imported into MariaDB 11.4.12 system-versioned tables and read back with `FOR SYSTEM_TIME ALL` before scoring. Coverage across the selected pages is 2003-02-21 through 2026-09-28; each page shows its own period.
- Validation on 2026-11-14 (Europe/Helsinki): all 77 Node tests passed with the real MariaDB integration enabled (zero skipped), both Python regression tests passed, TypeScript and production build passed. The real colored graph and revision evidence were checked in Sebastian's Brave browser.
- A source-diff spot check confirmed a repeated vandalism/cleanup cycle contributes to Sauli Niinistö's score. This is an editing-reversal index, not a validated measure of substantive disagreement. Zero means no qualifying repeated mutual restores were detected, not that an article has never been disputed.
- **GitHub upload is verified:** WikiLens was added to the existing connector's selected repositories on 2026-11-14 (Europe/Helsinki), resolving the 404. All 117 files in the initial source snapshot were uploaded to `main` in commit [`e350134`](https://github.com/sebastiansalin/wikilens/commit/e350134a028f35060bc9882cbb844c6e36958ff4); every remote Git blob hash matched the local source bytes. The repository remains private. Local Git metadata is still read-only in this managed session; subsequent publication can use the connected API. See [publication evidence](docs/qa/github-publication.md).
- **Vercel production deployment verified:** [wikilens-junction2026.vercel.app](https://wikilens-junction2026.vercel.app) serves the real pilot. Deployment `dpl_BzMAn1uHwC4vRmxToxfkQwBHDc9X`, commit `2367023`, became Ready after a 19-second build. The new project is connected to this repository's `main` branch. The connector cannot see the project, so deployment was completed and checked in Sebastian's Brave browser.

## Existing explorer features

- Live Wikipedia search, incoming/outgoing links, previews and bounded neighbourhood expansion.
- A force simulation with draggable stars, neighbour movement, pinning, zoom, collision avoidance and reduced-motion support. Node size uses actual pageviews where available, otherwise loaded-map degree. A visible spacing control changes spring distances.
- Directed bidirectional BFS: MariaDB indexed observations when connected, or a bounded live Wikipedia search. Partial results do not claim globally shortest routes. A failed bounded search does not prove no route exists.
- Cross-language outgoing concept overlap, aligned through Wikidata IDs. Similarity measures link overlap, **not truth or political agreement**.
- MariaDB schema, transactional graph cache, indexed adjacency, bounded recursive neighbourhoods and system-versioned edge observations.
- Historical article importer and `FOR SYSTEM_TIME AS OF` API using actual Wikipedia edit times. The sidebar can compare historical source links against the latest imported revision.

## Current limits

The pilot serves a static snapshot calculated from a verified MariaDB readback. Live-Wikipedia exploration is a separate mode. The local loopback database is not a hosted database. Graph display is capped at 160 articles; the pilot has 20. Full-Wikipedia tiles, global PageRank, Leiden clustering and GPU layout have not been generated. An independent initial unified UI review scored 7/10; follow-up fixes do not constitute an automatic 9/10 pass.

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

Invitations to `leosuojarvi` and `pitkenin` were visible as pending on 2026-11-13. Source publication to `main` was verified on 2026-11-14 (Europe/Helsinki) through the connected GitHub API. This session's local Git metadata remains unsynchronized; use the connector for further publication or a normal clone in a Git-enabled session.

The new deployment project is `wikilens` (`prj_Kqw8fHTEziyxEvod4W54L0LKbkMQ`) in team `mv-c84d`. Use Vite, `npm run build`, output `dist` and Node 24. A local loopback database is not reachable by a deployed Vercel function: the public conflict bundle carries the computed results without exposing the database. Leave `VITE_DATA_MODE` unset for server mode; explicitly set it to `browser` only for the live-Wikipedia alternative. Do not alter unrelated Vercel projects.

## Measurement boundaries

Pageviews are reads, not unique people; missing days and missing articles remain visible. Node degree and multi-hop affinity refer to the loaded graph. Layout ignores direction for physical attraction, but routes follow directed hyperlinks. Link-overlap comparisons cap each edition's outgoing link collection at 500 and distinguish incomplete data. Article length is source bytes, not comparable translated word count.

Historical source-link extraction is narrower than MediaWiki's rendered links: it excludes templates and colon-prefixed targets. Captured revision history has explicit start/end coverage and unavailable revisions stay unavailable. Edge observation timestamps and original article edit timestamps are separate concepts.

## Attribution

Wikipedia contributors: applicable CC BY-SA terms, linked through each article/revision. Wikidata structured data: CC0. WikiLens is independent of Wikimedia. Vendored Wikigraph code: copyright 2026 Toby Penner, MIT; the full license is retained. The team's original application code does not yet have a selected distribution license.
