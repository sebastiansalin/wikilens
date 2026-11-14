# WikiLens atlas, method v2

The question is: **which articles, and which passages, have editors repeatedly changed back and forth?** This is an exploratory retrieval tool, not a truth, bias, reliability, or consensus classifier. Independent accuracy evaluation is pending.

## Changes from the audited pilot

The ten-source review remains in [CONFLICT-RESEARCH.md](CONFLICT-RESEARCH.md); the real-data v1 audit remains in [qa/conflict-score-audit.md](qa/conflict-score-audit.md). V1 is preserved in `pipeline/score-v1.mjs`. The passage detector is v2 (published captures retain `wikilens-passages-v2`; future builds use `wikilens-passages-v2.2`). The displayed index is `wikilens-index-v2.2` and has a different formula; the numeric scores are not comparable across versions.

V2 scores recurring normalized passage changes, including selected infobox fields. It therefore finds partial reversals even when unrelated changes prevent a whole-page checksum match. It groups passage tracks sharing a return revision into episodes, reducing the multiplication of evidence in bulk restorations. It separates content candidates, cleanup patterns, maintenance and uncertain cases, and reports monthly counts with recent-window controls.

These are concrete behavior changes. They do not establish higher population precision, recall or rank validity than previous systems. The seven inspected articles are a development set, not independent validation.

## Deterministic detection

1. Sort by original UTC timestamp and revision ID. Deduplicate identical records and reject conflicting revision IDs. Parent gaps reset the passage and checksum memories. A missing text interrupts passage continuity. Missing identities cannot create interactions.
2. Normalize NFC and whitespace; strip comments, refs, simple templates and link markup. Eligible units are lines/paragraphs of 40–6,000 characters. Selected infobox values (`lopputulos`, `tyylilajit`, `päätyylilaji`, combatants, casualties, strengths) can be as short as eight characters. This is an intentionally limited wikitext parser, not semantic sentence or token attribution.
3. Record removed units. A return within 30 days by an editor different from the remover is a reversal candidate. Match an alternative of the same field with token overlap at least 0.45, using the current or deletion transition. Anonymous status is never itself a cleanup signal.
4. Within each pair of passage states, use non-chaining 30-day chunks and require at least two distinct return revisions, involving at least two known editor identities. This does **not** require an identical reciprocal editor pair; changing participants are allowed. Merge qualifying tracks sharing a return revision, taking the most conservative category. This merge can connect tracks whose combined span exceeds 30 days; the constituent tracks still satisfy the window.
5. Bot flags and bot-declared edit summaries, markup/reference-only transitions, explicit cleanup summaries, bulk deletion/restoration (length ratio below 0.35 on texts over 500 characters), and a small abuse lexicon are separated from content candidates. Bot-declared summaries are not independently verified bot status. More than 40 changed units, lead-name-only swaps, number-only swaps and unmatched insertion/deletion alternatives are uncertain. Broken template/category fragments are not scored as prose. This can exclude real disputes and still admit subtle vandalism, jokes, stylistic changes and coordinated manipulation.
6. One episode enters its monthly series when its second distinct return qualifies. The final category uses the complete snapshot retrospectively. Monthly views are filtered observations, not leakage-free predictions of what was knowable on that date. Evidence includes up to 12 return diffs and one before/after example, truncated to 1,600 characters per side; the underlying counts include all returns in the episode.

## Formula and missing data

For the selected calendar-month window, let E be content candidate episodes and C be eligible content-changing transitions. C includes uncertain transitions but excludes detected cleanup and maintenance. Rate = `100 * E / C`; index = `100 * E / (E + 0.01 * (C + 20))`, rounded to one decimal place. The old index clipped every rate of 5 or more episodes per 100 edits to 100. This smooth saturation preserves differences at the top, while 20 zero-episode prior edits reduce small-sample extremes. Version 2.2 changes the saturation constant from 0.05 to 0.01, making non-zero evidence more visible without changing episode detection, raw rates, or eligibility. The 20-edit prior remains. On the complete eligible lifetime capture, the 674 non-zero articles have a median index of 54.3 (previously 19.2), 112 score at least 70, and the highest score is 85.0. Articles with no content candidates still score zero; no data is recolored as a fabricated dispute. Constants are heuristic design choices, not fitted research parameters.

The scale is fixed across articles and does not change when more articles are loaded. It is not a probability or learned calibration. Small samples are moderated but remain uncertain; inspect the visible episode and edit counts. The minimum is 20 revisions and 10 content edits in the window. More than 10% missing text, missing editor identities or parent gaps over the full captured history also makes the score null. Zero means no qualifying candidate was detected, not peace or consensus.

The displayed whole-history baseline is exact checksum restoration within 100 revisions and 30 days, excluding consecutive identical saves. It includes cleanup. It is an identity-restoration baseline inspired by mwreverts, not a claim to reproduce every detail of mwreverts, Contropedia, Yasseri's M, or Controversy Rank.

## All-data pipeline and graph

All 16 pinned-checksum M Parquet partitions supply 19,742 articles and 862,076 revisions. M is the Finnish-history collection, **not all Finnish Wikipedia**. Raw text totals about 11.3 GiB. Import is additive under `m-2026-10-atlas`; original pilot capture is retained. Per-page transactions/checkpoints permit resumption. System-versioned rows preserve original timestamps with deterministic microsecond offsets for ties.

The builder verifies the source export hash, reads `FOR SYSTEM_TIME ALL`, and compares canonical row digests for every article before scoring. Digests include page/title, revision/parent, timestamp, editor identity, flags, summary, checksum, byte count and text. First-parent null becomes zero as in the importer. These private identities are never written to public data.

The browser loads a compact searchable catalog and fetches evidence from 64 versioned shards only when needed. All article titles remain searchable. The graph starts with at most 64 nodes, expands through incoming and outgoing neighbors to 160, and can recenter on any article. Neighbor priority is degree in the captured collection, not the changing score, to avoid jumping layouts while scrubbing time. The horizon count is the distinct set of directly connected, currently hidden articles, not the total collection size.

Connections are explicit links in each article's latest M text. Redirect aliases and out-of-collection targets are omitted. The time slider changes counts and colors; it does not reconstruct historical link topology. Production serves a static MariaDB-derived export and needs neither a public database nor a running desktop.

## Independent review protocol

`/?review=1` hides algorithm labels and scores. It presents deterministic samples by category plus random transitions, with the article history and diff links. Two reviewers work independently and export local JSON; neither reviewer may use the prediction key while labeling. Reviewer aliases must differ. The split is by article: SHA-256(page ID) first 32 bits modulo 5 equals zero for heldout articles; the rest are development. Do not tune thresholds using heldout labels.

The pack samples up to 12 cases per predicted category and split, so it is balanced/stratified rather than population representative. Candidate episodes and random central transitions are different units and must be evaluated separately. For a random transition, judge whether the central edit belongs to repeated content disagreement, reading surrounding history beyond the limited excerpts. The prediction is whether that central revision appears in retained candidate evidence; truncation can limit this diagnostic.

`node pipeline/evaluate-review.mjs reviewer-a.json reviewer-b.json` validates versions, reports coverage, raw agreement and Cohen's kappa, and gives content confusion counts and sample precision/recall for consensus non-uncertain labels, separately by split and unit. Missing labels and disputed judgments remain visible in coverage. These diagnostics are not population accuracy estimates; proper prevalence weighting, adjudication, additional negative sampling and faithfully implemented published comparators are still needed before a superiority claim. No independent labels or results are fabricated in this repository.

## Timeline and filtering

The minimum-index filter applies to the ranking and graph, including both endpoints of every shown link. Zero includes insufficient-evidence nodes; positive thresholds exclude them. Scores are recomputed from captured monthly counts with prefix sums. Playback offers 0.5×, 1×, 2×, 4×, and 8× speed and moves continuously between month boundaries, updates scores at monthly resolution, pauses on manual navigation, and stops at the final month. No intermediate revision history is invented. The index transformation does not require reimporting or redetecting episodes in the existing capture.

## Attribution

Wikipedia contributor text is CC BY-SA 4.0. Each excerpt links the originating article and revision diffs. Dataset: [MariaDB M, October 2026](https://github.com/MariaDB/mariadb-wikipedia-datasets/releases/tag/m-2026-10). UI appearance is adapted from this repository's `feature/conflict-explorer` at `62db465ff78447a6c6b60b14caed6264787ea0e9`; the React architecture, bounded graph physics and live explorer remain.

