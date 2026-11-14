# WikiLens

A Wikipedia editing-disagreement atlas by **Sebastian, Aksu and Leo**, for Junction 2026.

**Production:** https://wikilens-junction2026.vercel.app

## The question

Which articles—and which passages—have editors repeatedly changed back and forth?

The atlas covers **all 19,742 articles and 862,076 revisions in MariaDB's Finnish-history M dataset**. Search the full collection, expand the graph's event horizon or recenter on another article. At most 160 nodes are drawn. Green, amber and red show the selected-window disagreement index; gray means insufficient evidence. This measures editing patterns, not truth, bias, article reliability or cross-language agreement.

The UI adapts the mint/charcoal palette, DM Sans and Space Grotesk, three-column layout and inspector from `feature/conflict-explorer`, with the classic canvas graph and article inspector. Charts and the timeline use **calendar months**, with all-history, five-year, twelve-month and three-month windows.

## Pipeline

1. Verify all 16 official M Parquet partitions and export complete histories.
2. Additively import into MariaDB system-versioned tables under `m-2026-10-atlas`, with transactional per-page checkpoints.
3. Read every history with `FOR SYSTEM_TIME ALL` and verify canonical row digests against the source.
4. Detect repeated passage/selected-infobox reversals. Group tracks sharing return revisions into episodes. Separate content candidates, cleanup, maintenance and uncertain cases.
5. Export a searchable catalog and 64 evidence shards. Production serves static aggregates; raw dumps, editor identifiers, credentials and database files stay local and ignored.

Index = `100 * E / (E + 0.01 * (C + 20))`, rounded to one decimal, where E is content candidate episodes and C is content edits. Smooth saturation replaces the old 100-point ceiling; 20 zero-episode prior edits moderate small samples. Rate and counts remain visible. Constants are uncalibrated design choices. Insufficient samples are gray. See [ATLAS-METHOD.md](docs/ATLAS-METHOD.md) for full rules, failure modes and review protocol.

M is a selected Finnish-history collection, not all Finnish Wikipedia. Links use the latest captured text; the slider does not reconstruct historical connections. Classification uses the full snapshot retrospectively. Cleanup detection is imperfect. Independent accuracy validation is pending; no superiority over published methods is claimed.

## Run

Use Node 22.12+ (tested with 24.11), Python/PyArrow and MariaDB 11.4. Run `npm install`. The project-local `node scripts/bootstrap-local.mjs` sets up portable MariaDB and the original pilot. For the full atlas, reuse the downloaded files and configured database:

```powershell
.local/python/Scripts/python.exe pipeline/prepare_m.py --count 0 --output .local/m-atlas.jsonl
npm run atlas:import
npm run atlas:build
npm run dev
```

Raw revision text is about 11.3 GiB; allow additional room for JSONL, database and checkpoints. Import and calculation are resumable. Different source data cannot overwrite an existing capture. `--count 1000` selects the most-revised 1,000 pages; `--titles path/to/titles.json` selects explicit unique titles. The public atlas uses the complete capture.

The database is loopback-only. See [.env.example](.env.example); never commit real credentials. For server-backed live exploration, run `npm run api` alongside `npm run dev`. `npm run dev:browser` uses anonymous Wikimedia requests and identifies that mode.

## Review and validation

The [ten-source review](docs/CONFLICT-RESEARCH.md) and [v1 audit](docs/qa/conflict-score-audit.md) explain why whole-page restores alone were misleading. V1 and its 20-page export remain reproducible. V2 adds partial-passage detection and exclusions, with a different numeric scale.

`/?review=1` opens blind review: independent reviewers inspect source diffs, classify cases and export labels locally. No labels are sent to a server. Heldout splits are by article; random transitions are included.

```powershell
node pipeline/evaluate-review.mjs reviewer-a.json reviewer-b.json
$env:WIKILENS_DB_INTEGRATION='1'
node --env-file=.env --test tests/*.test.mjs
.local/python/Scripts/python.exe -m unittest discover -s tests -p 'test*.py'
npm run build
```

The evaluator reports agreement, Cohen's kappa, coverage and sample confusion counts separately by split and unit. These are stratified diagnostics, not population accuracy estimates. Independent labels are not yet available; never invent them.

## Current status

- **Previous atlas release (14 November 2026, 21:28 Europe/Helsinki):** Leo's reviewed main version `7e6e120` is deployed at the production URL through release commit `d1ff35c`. Both commits use the exact same source tree. Vercel deployment `DSW8bPJssb4QyykqrYccrrcXupKq` reached Ready / Production / Current after an 18-second build. Brave checks confirmed the atlas, Talvisota index 35, the monthly previous-month control, and no captured console errors. This release exposes the atlas-only interface described below.

- MariaDB import completed: **19,742 articles / 862,076 revisions**. Original pilot capture preserved.
- **93 Node tests passed, zero skipped**, including real database integration; two Python tests passed. TypeScript and production build passed before the final export.
- Full canonical readback verification and scoring completed: all **19,742** database histories matched the source digest. The [calculation report](docs/qa/atlas-calculation.json) records 138,735 connections and 2,846 classified episodes (1,190 content candidates, 376 cleanup, 627 maintenance and 653 uncertain).
- The complete public export passes [atlas validation](docs/qa/atlas-validation.json), including all 64 evidence shards and monthly/count consistency. 7,118 articles have sufficient evidence for a lifetime numeric index; the remainder stay gray.
- **Published and deployed to production on 14 November 2026.** Atlas release `5b843bf` passed Vercel's build and is live at the production URL. Brave checks confirmed desktop/phone layouts, full-catalog search, source evidence, monthly windows, graph expansion and hosted live-Wikipedia exploration. See [release checks](docs/qa/atlas-release.md) and the [demo guide](docs/DEMO.md).

## Reading article changes

The atlas includes a selected-period change overview and compact comparisons of recurring wordings with source diffs. The graph restores the original conflict-explorer canvas balls, lines, and magnetic forces, using cached artwork, batched lines, and a fixed simulation clock. Graph colors update separately from layout. See [change summaries and rendering notes](docs/CHANGE-SUMMARIES.md) for evidence limits, further options, and measured checks. Before release, this version passed 102 Node tests (one database integration test skipped), TypeScript, and a production build. It is now deployed; see the latest release entry above. The earlier test results were not rerun in this deployment-only task.

## Atlas interface

The atlas remains the default interface. The optional language tab described below does not alter its editing scores, graph or timeline. The Live Explorer entry point, navigation, loading-page link, and route selection have been removed. Older live-mode URLs now open the atlas. The archived explorer source and API/database adapters remain available for development, but the explorer UI and its stylesheet are no longer loaded by this entry point.

The main page omits the introductory title, selected metadata labels, and repeated explanatory captions requested for the presentation. Methodology, source attribution, index limitations, and the latest-snapshot link limitation remain available in the Methodology dialog. Graph controls, article search, evidence links, timeline, and change summaries are retained. Graph labels now use double-resolution cached text, a crisp dark outline instead of a blurred shadow, brighter medium-weight lettering, and screen-pixel alignment. TypeScript and production build validation passed for this UI cleanup.

## Publication and maintenance

Public repository (visibility verified on 14 November 2026): [sebastiansalin/wikilens](https://github.com/sebastiansalin/wikilens). Target: existing **wikilens** project, Vercel team **mv-c84d**, connected to `main`. Never deploy to unrelated projects.

This managed workspace has read-only Git metadata and cannot read GitHub CLI credentials. Publish through the connected GitHub API, preserving the latest remote tree with an expected-head, non-force update. Local Git metadata is not synchronized. A normal writable checkout may use the bootstrap's `--git-only` path; never force-push this stale workspace.

Read [AGENTS.md](AGENTS.md), [pipeline/AGENTS.md](pipeline/AGENTS.md) and [scripts/AGENTS.md](scripts/AGENTS.md). Wikipedia contributor text is CC BY-SA 4.0; article/revision attribution accompanies excerpts. Wikidata data is CC0. WikiLens is independent of Wikimedia. Vendored Wikigraph code is copyright 2026 Toby Penner, MIT, with license retained. Original team code has no selected distribution license yet.


## Optional language differences

A closable **Language differences** tab compares FI/EN/UK/RU linked-concept coverage for the exact top 100 eligible articles by full-history editing index. It uses separate pair scores, with no blended editing/language score. This is coverage distance, not contradictory-opinion detection. The November snapshot is independent of the monthly editing slider. See [method and scaling](docs/LANGUAGE-DIFFERENCES.md).

The real capture completed on 14 November 2026: 100 selected topics, 210 available editions, 189 missing sitelinks and one rejected identity mismatch. 55 topics have at least one measurable pair (173 pairs total); the other 45 remain explicit unavailable/insufficient comparisons. Capture took 347 seconds, 535 requests and zero retries; saved sources and computed evidence total about 4.9 MB. At this sample rate, 1,000 topics would take about one hour and 49 MB, an estimate rather than a guaranteed throughput. Several thousand are feasible in resumable background batches.

Validation: 111 Node tests passed, one database integration test skipped; TypeScript and production build passed. The offline audit verified all 100 source hashes, exact top-100 selection, all 173 measured pairs and 2,553 anchored concept quotations. Deployment/browser verification status is recorded in [release checks](docs/qa/language-differences-release.md).
