# WikiLens

A Wikipedia editing-disagreement atlas by **Sebastian, Aksu and Leo**, for Junction 2026.

**Production:** https://wikilens-junction2026.vercel.app

## The question

Which articles—and which passages—have editors repeatedly changed back and forth?

The atlas covers **all 19,742 articles and 862,076 revisions in MariaDB's Finnish-history M dataset**. Search the full collection, expand the graph's event horizon or recenter on another article. At most 160 nodes are drawn. Green, amber and red show the selected-window disagreement index; gray means insufficient evidence. This measures editing patterns, not truth, bias, article reliability or cross-language agreement.

The UI adapts the mint/charcoal palette, DM Sans and Space Grotesk, three-column layout and inspector from `feature/conflict-explorer`, retaining the React graph physics and live explorer. Charts and the timeline use **calendar months**, with all-history, five-year, twelve-month and three-month windows.

## Pipeline

1. Verify all 16 official M Parquet partitions and export complete histories.
2. Additively import into MariaDB system-versioned tables under `m-2026-10-atlas`, with transactional per-page checkpoints.
3. Read every history with `FOR SYSTEM_TIME ALL` and verify canonical row digests against the source.
4. Detect repeated passage/selected-infobox reversals. Group tracks sharing return revisions into episodes. Separate content candidates, cleanup, maintenance and uncertain cases.
5. Export a searchable catalog and 64 evidence shards. Production serves static aggregates; raw dumps, editor identifiers, credentials and database files stay local and ignored.

Index = `round(min(100, 2000 × content candidate episodes / content edits))`. Rate and counts are visible. The scale and thresholds are uncalibrated design choices. Small samples are gray. See [ATLAS-METHOD.md](docs/ATLAS-METHOD.md) for full rules, failure modes and review protocol.

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

- MariaDB import completed: **19,742 articles / 862,076 revisions**. Original pilot capture preserved.
- **93 Node tests passed, zero skipped**, including real database integration; two Python tests passed. TypeScript and production build passed before the final export.
- Full canonical readback verification and scoring completed: all **19,742** database histories matched the source digest. The [calculation report](docs/qa/atlas-calculation.json) records 138,735 connections and 2,846 classified episodes (1,190 content candidates, 376 cleanup, 627 maintenance and 653 uncertain).
- The complete public export passes [atlas validation](docs/qa/atlas-validation.json), including all 64 evidence shards and monthly/count consistency. 7,118 articles have sufficient evidence for a lifetime numeric index; the remainder stay gray.
- Release verification is in progress. Production still serves the prior pilot until the atlas release is confirmed. See [release checks](docs/qa/atlas-release.md) and the [demo guide](docs/DEMO.md).

## Existing explorer

`/?mode=live&title=Talvisota&lang=fi` opens live search, incoming/outgoing links, previews, bounded expansion, directed routing and cross-language link overlap via Wikidata. Similarity is link overlap, not truth or political agreement. Paper, Ink and Galaxy remain available. Drag, zoom, pinning, stable layouts and reduced motion remain in the shared graph.

API/database adapters stay in `api/` and `server/`. Cache, recursive queries, historical import and `FOR SYSTEM_TIME AS OF` API work when configured. See [database setup](db/README.md), [graph architecture](docs/MAP-ARCHITECTURE.md) and [challenge mapping](docs/CHALLENGE.md) for boundaries and unverified claims.

## Publication and maintenance

Private repository: [sebastiansalin/wikilens](https://github.com/sebastiansalin/wikilens). Target: existing **wikilens** project, Vercel team **mv-c84d**, connected to `main`. Never deploy to unrelated projects.

This managed workspace has read-only Git metadata and cannot read GitHub CLI credentials. Publish through the connected GitHub API, preserving the latest remote tree with an expected-head, non-force update. Local Git metadata is not synchronized. A normal writable checkout may use the bootstrap's `--git-only` path; never force-push this stale workspace.

Read [AGENTS.md](AGENTS.md), [pipeline/AGENTS.md](pipeline/AGENTS.md) and [scripts/AGENTS.md](scripts/AGENTS.md). Wikipedia contributor text is CC BY-SA 4.0; article/revision attribution accompanies excerpts. Wikidata data is CC0. WikiLens is independent of Wikimedia. Vendored Wikigraph code is copyright 2026 Toby Penner, MIT, with license retained. Original team code has no selected distribution license yet.
