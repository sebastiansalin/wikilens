# Language neighborhood comparison

This layer combines Leo Suojärvi's `feature/article-size-scaling` at `bd1d7602a1c7caa1dc64d3c317a3b0d476a0a28a` with a reproducible four-edition comparison for 100 Finnish M articles connected from Talvisota. Leo's classic graph physics, article-size scaling, score filtering, smooth monthly playback (up to 8×), wording previews and change overview are retained.

## What the new number means

**Coverage distance**, not an opinion or contradiction score. The old selected introduction axes were too narrow to generalize automatically. The new function compares how much paragraph-linked concepts feature across the article's prose, aligning those concepts by Wikidata ID. It exposes the largest differences with exact source paragraphs. Original-language introductions and article outlines are additional views, separate from the number.

No LLM inference, translation, embeddings or national-opinion labels are produced by this pipeline. The earlier eight-article AI-assisted claim study remains under a separate disclosure where available. Its source capture, annotations, context corrections and independent formula are preserved.

## Selection and sources

1. Build undirected connections from the latest Finnish M atlas links. Start with Talvisota, then breadth-first traversal, ordering each frontier by in-dataset degree descending and numeric page ID ascending. Include the seed and stop at 100. This dataset gives the seed plus 99 direct neighbors. This is not a popularity sample.
2. Resolve each selected page's Wikidata identity and FI/EN/UK/RU sitelinks. Missing editions remain missing.
3. Check each edition resolves to the same QID. Query its revision ID and timestamp, then `action=parse&oldid=...` for text and sections. Verify the returned revision ID. This freezes the page revision, but rendered templates and link-to-QID mappings reflect capture time; this is not a perfect historical rendering.
4. Extract paragraph prose outside tables and superscripts. Lists, images and infoboxes are excluded. Resolve linked main-namespace article titles, including redirects, to Wikidata IDs. Store those mappings and all original paragraph text in the capture. Capture dates are independent of the monthly editing-history slider.
5. Store a SHA-256 over each full article capture. Rebuilding rejects altered captures. Persist failed/missing edition states; no fabricated zero or inferred text.

The committed source manifest references 100 files in `captures/`; the compact index loads computed `details/` on demand. The 2026-11-14 capture has 323 available editions, 71 missing sitelinks and six unavailable editions. There are 417 measurable pairs and 72 aggregate scores. All 100 article hashes and 6,493 emitted quotations were verified against the saved source.

## Formula

For each edition and each linked concept other than the article's own QID, count at most one occurrence per paragraph. The first three prose paragraphs receive weight 2; later paragraphs weight 1. Normalize the vector to total weight 1.

For distributions P and Q, let M=(P+Q)/2. Pair distance is `100 × sqrt((KL₂(P||M)+KL₂(Q||M))/2)`, rounded to one decimal. Zero means identical captured concept distributions; 100 means disjoint distributions. Unlinked discussions are invisible to this method. Distribution weights do not estimate actual word count, sentiment, factual disagreement or importance.

Each edition needs at least five distinct resolved concepts and at least 60% of its distinct prose-linked titles resolved to QIDs. Pairs failing this stay null. The article aggregate is an equal mean over at least three of six measurable pairs, rounded to one decimal; pair coverage remains visible. Thresholds and lead weights are uncalibrated design choices.

The initial capture did not extract citation URLs because MediaWiki encoded underscores in citation IDs. This limitation is explicit: the Sources tab is hidden and no domain-overlap result is claimed for this snapshot. The extractor now accepts those encoded IDs, with a regression check, for a future intentional refresh; the frozen capture is preserved. Citation-source overlap, when available, is the Jaccard overlap of hostname sets extracted from citation-list URLs. It is null when either set is empty. Hostnames strip `www.` only; archives, mirrors and subdomains are not reconciled. Print-only citations may be absent. Different domains do not imply different facts. Section headings are shown in their original language, not semantically aligned.

## Limits and verification

Linking conventions, article scope, translations, short editions and update lag can all inflate distance. The method cannot infer omissions from missing links, distinguish positive from negative claims, or decide which edition is correct. No independent accuracy benchmark is claimed.

Tests cover symmetry, scaling invariance, empty sets, alias collapse, paragraph weighting, missing/low-coverage editions, source-score separation, connected deterministic selection and stale capture rejection. Full-source evidence validation must also check every emitted quote and score against the saved captures. UI checks and publication status belong in `docs/qa/neighborhood-release.md`.

`node pipeline/capture-neighborhood.mjs` uses the existing capture when present; otherwise it captures from Wikimedia. `--offline` requires the saved capture and never requests upstream sources. Archive or intentionally rename the existing capture before any refresh. The older `languages:build` remains separately reproducible.

Attribution: Wikipedia contributors, CC BY-SA, with revision URLs per edition. Wikidata identities are CC0. API references: https://www.mediawiki.org/wiki/API:Parsing_wikitext and https://www.wikidata.org/wiki/Wikidata:Data_access.
