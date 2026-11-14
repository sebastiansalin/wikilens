# Optional language differences tab

The tab compares linked-concept coverage in Finnish, English, Ukrainian and Russian paragraph prose. It is separate from the editing disagreement atlas: no blended score, no language-based graph coloring and no change to the editing ranking or monthly calculations. Closing it preserves the atlas article, graph and month. `?languages=1` opens the tab directly; `languageArticle=<Finnish page ID>` selects a captured article.

## Exact sample

`pipeline/top-language-selection.mjs` selects 100 eligible M articles using the same full-history v2.2 editing index and tie-breakers as the atlas: descending index, descending possible-dispute count, descending revision count, ascending page ID. All captured months through October 2026 participate. The sample is fixed independently of the monthly slider. Belomorsk is first (85.0); Lentokenttämetro is 100th (70.9).

This is a ranking by an unvalidated editing heuristic, not an independently established list of controversial topics. No article is replaced because translations are missing. Missing editions, inaccessible editions and insufficient comparable evidence remain distinct.

## Capture and calculation

The capture verifies each edition's Wikidata identity and retrieves a fixed revision with its exact prose, links, revision URL and timestamp. Linked titles are resolved to shared Wikidata concepts. Per-article SHA-256 hashes guard source integrity. Revision timestamps can differ, and live Wikipedia can subsequently change. Source text is CC BY-SA with linked revision attribution; Wikidata identities are CC0.

Each concept contributes once per prose paragraph. The first three paragraphs have weight two, subsequent paragraphs weight one. For each of the six language pairs, normalized concept weights produce `100 × sqrt(Jensen–Shannon divergence)`: zero means identical distributions, 100 means no shared resolved concepts. A pair requires at least five resolved concepts in each edition and 60% link-identity coverage. Unmeasured pairs are null, never zero. This tab exports no aggregate language score and no combined editing/language score.

Coverage distance measures focus and linking choices. It does not establish contradictory facts, political bias, truth or national opinion. It excludes tables, lists and unlinked mentions. Different article lengths, linking habits and revision dates affect results. The displayed original-language passages anchor the largest concept-share differences; missing links do not prove a topic is absent.

## Reproduction and verification

`npm run languages:build` reproduces the committed output offline. `npm run languages:validate` checks the exact selected 100 against the atlas, all capture hashes, every pair against recalculation and every displayed concept quotation against its captured paragraph and QID. `npm run languages:capture` captures only when no saved manifest exists; it never silently refreshes an existing capture.

The capture workflow runs on the dedicated feature branch and publishes public source shards only after the calculation succeeds. Requests start at least 650 ms apart, use bounded concurrency and back off on failures. The report records elapsed time, request count, retries, available/missing/unavailable editions, measured pairs and source bytes. Ordinary Vercel builds serve the committed static output without calling Wikipedia or an LLM.

## Scaling

100 articles require at most 400 edition captures and 600 pair comparisons. Network retrieval and Wikidata link resolution dominate; the distance calculation itself is cheap. 1,000 articles (at most 4,000 editions / 6,000 pairs) are practical as paced batches. Processing all 19,742 is technically possible, but should use durable per-article checkpoints, shared identity caches and background batches rather than one deployment build. Missing translations remain missing at every scale. There is no LLM inference cost in this method. Timing extrapolations from a single sample are estimates, not benchmarks for other article sets.

Measured results are in `public/data/language-differences/report.json`. Release verification is recorded in `docs/qa/language-differences-release.md`.
