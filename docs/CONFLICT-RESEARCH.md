# Research behind the WikiLens conflict pilot

**Current implementation:** see [ATLAS-METHOD.md](ATLAS-METHOD.md) for the full-collection passage detector. The v1 formula below is retained for reproducibility. The current `wikilens-index-v2.2` uses a smooth saturating display scale with a 20-edit prior to reduce ceiling ties and small-sample extremes. These constants are design choices, not a validated published controversy formula; episode detection and raw counts are unchanged. No comparative superiority claim has been validated.

Reviewed 2026-11-13. Ten distinct sources, including primary research papers and the authors' own tools/documentation. These methods measure different phenomena; there is no evidence that our prototype outperforms all of them.

| # | Source | What it measures / how it works | Decision for WikiLens |
|---|---|---|---|
| 1 | Viégas, Wattenberg & Dave (2004), [History flow](https://research.ibm.com/publications/studying-cooperation-and-conflict-between-authors-with-history-flow-visualizations) | Visualizes authorship and content survival through successive revisions, revealing deletion/restoration patterns. It is an exploratory visualization rather than a calibrated scalar score. | Preserve a timeline and inspectable text evidence. |
| 2 | Kittur et al. (2007), [He Says, She Says](https://research.google/pubs/he-says-she-says-conflict-and-coordination-in-wikipedia/) ([paper](https://gwern.net/doc/wikipedia/2007-kittur.pdf)) | Uses conflict tags as labels for article-level models; also introduces a revert graph to examine user disputes. Tags and coordination work do not perfectly identify substantive disagreement. | Keep article and editor interaction evidence separate; do not assume tagged or heavily edited means unreliable. |
| 3 | Brandes & Lerner (2007/2008), [Visual Analysis of Controversy](https://www.inf.uni-konstanz.de/exalgo/publications/bl-vacuge-07.pdf) | Builds a network of who revises whom and visualizes opposing groups and contributor roles. The interpretation of a revision relationship remains important. | Require reciprocal interactions; the public product maps articles without publishing editor rankings. |
| 4 | Vuong et al. (2008), [On Ranking Controversies](https://ink.library.smu.edu.sg/sis_research/1261/) | Basic dispute counts and Controversy Rank models incorporating article–contributor relationships, with age-aware extensions. | Show raw counts as a baseline; avoid equating raw volume with intensity. Do not claim to reproduce CR. |
| 5 | Yasseri et al. (2012), [Dynamics of Conflicts in Wikipedia](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0038869) | Exact restorations identify reverts; mutual reverts, participant experience and the number of disputants help separate sustained conflict from isolated vandalism. | Use repeated mutual restores as the core signal, with bounded time windows. Our formula is not their M metric. |
| 6 | Borra et al. (2015), [Contropedia](https://www.contropedia.net/) | Scores linked topics in substantive disagreeing edits and exposes disputes in article context. | Show passages and source diffs beside the score. Our paragraph recurrence detector is simpler and does not reproduce their sentence-level method. |
| 7 | Flöck/Acosta and maintainers, [WikiWho / WhoColor](https://www.mediawiki.org/wiki/WikiWho/en) | Tracks additions, removals and reintroductions of exact tokens across complete revision histories. Primarily an attribution/persistence system. | Detect repeated paragraph returns separately; token attribution is a future improvement, not a feature we have implemented. |
| 8 | Halfaker, [mwreverts](https://pythonhosted.org/mwreverts/detection.html) | Detects checksum matches in a bounded revision stream and returns the reverting, reverted and restored-to revisions. It detects identity reverts, not their intent. | Explicitly retain source revision IDs, skip no-op saves, and treat missing hashes as unknown. |
| 9 | [WikiWar](https://wikiwar.net/) | Its published UI combines battle evidence, participation and governance, with cleanup filtering, reciprocal qualification and linked wording changes. Historical examples were visible; a functioning live feed was not established. | Borrow evidence-first presentation. Do not claim our prototype has governance/talk-page coverage or better validation. |
| 10 | Dror Poleg, [Wikipedia Edits Tracker](https://www.drorpoleg.com/charts/wikipedia-editing-surges/) | Published weighted index: mutual reversal, rejected-edit rate, churn, persistence and rejected volume; analyzes bounded histories. The public page is a frozen snapshot. | Combine interpretable factors, expose the history period and separate counts from the score. |

## What is different in this version

The proposed improvement is a reproducible Finnish M-data pipeline with transparent exclusions, parent-gap handling, immutable source manifests, source diffs, a timeline, and the existing linked-article graph. These are engineering/design properties, not evidence of higher classification accuracy. Several earlier tools have more sophisticated content analysis.

The first version uses full-text restores for the numeric score. Paragraph removal/restoration is an additional investigation aid, deliberately excluded from the score: a paragraph returning does not by itself establish disagreement. Partial semantic reversals, talk-page negotiation and cross-language disagreement remain outside scope.

## Versioned formula: wikilens-conflict-v1

1. Sort one article's revisions by UTC timestamp and revision ID. Deduplicate identical rows; reject conflicting IDs. Reset detection across missing parent transitions.
2. A candidate exact revert restores a prior nonempty SHA-1 within both 100 revisions and 30 days. Consecutive identical saves are not reverts. Retain all distinct non-self editors whose intervening revisions were undone.
3. Qualify an editor pair only if it has both directions and at least three distinct reverting revisions in one sliding 30-day window. Count each qualifying revision once, even when it undoes several contributors.
4. Explicit bot flags exclude interactions. M does not provide a bot flag; no claim is made to have filtered all bots. Never infer vandalism from anonymous status. A small English/Finnish cleanup-comment pattern discounts a qualifying revision to 0.25; otherwise its weight is 1. This is fallible and visible in the evidence.
5. Let W be weighted qualifying revisions, N comparable adjacent transitions, D distinct qualifying UTC days, and U distinct participating editor identities. Components are R = 1-exp(-W/8), F = min(1, W/(N+20)/0.12), P = 1-exp(-D/5), B = 1-exp(-(U-1)/3) for U>0, otherwise 0. Score = round(100 × (0.45R + 0.30F + 0.15P + 0.10B), 1 decimal).
6. Return **null**, not zero, with fewer than 20 revisions, fewer than 15 comparable transitions, or more than 10% missing hashes or editor identities. Zero means no qualifying signal detected in the observed data; it does not prove consensus.

Constants and weights are explicit design choices, not trained parameters. The index is not a percentage probability. It is not normalized against the selected pilot, so adding another article does not change an existing article's score. Identity changes, shared IPs, suppressed revisions, undetected bots, mass restorations and routine maintenance remain sources of error.

Paragraphs are whitespace/NFC normalized, 80–2,000 characters, with basic non-prose filtering. A return is a previously removed paragraph restored within 30 days by a different known editor. At least two returns are needed for display. Up to eight passages and six source diffs each are retained; this is not a comprehensive semantic diff.

## Selection and evaluation

Default pilot: the 20 most-revised pages in M, selected **before scoring**, ties by page ID. This makes an activity-biased demonstration, not a representative sample. An explicit JSON list of 20 titles can replace it. The public JSON records the policy, checksums, input count, gaps, periods, formula version and calculation engine.

Tests cover isolated cleanup, sustained mutual reversal, self-reverts, no-op saves, duplicates, missing evidence, time separation, history gaps, mass-revert deduplication and paragraph recurrence. These are synthetic algorithm tests, not an accuracy benchmark.

Before claiming superiority: independently annotate actual revision episodes as substantive dispute, cleanup, other, or ambiguous; blind reviewers to scores; compare precision/recall and ranking quality against raw revert count/rate and faithfully implemented published baselines. Use held-out articles, report reviewer agreement, include negative examples, and evaluate sensitivity to the time window and weights. Twenty pages can support a pilot review, not a universal superiority claim.

## Data and attribution

[Official M release](https://github.com/MariaDB/mariadb-wikipedia-datasets/releases/tag/m-2026-10): 19,742 Finnish Wikipedia articles about Finnish history, 862,076 revisions, 16 Parquet files, snapshot 2026-10-01. It is not the entirety of Finnish Wikipedia. Original text: Wikipedia contributors, CC BY-SA 4.0. Source revision links accompany displayed excerpts. Graph edges are explicit links in each selected article's last M revision; redirects and targets outside the pilot are not resolved.

MariaDB ingestion uses the [official system-versioning approach](https://github.com/MariaDB/mariadb-system-versioning-wikipedia): original revision timestamps in system-time periods, deterministic microsecond ordering for same-second edits, and `FOR SYSTEM_TIME ALL` to read the scoring input. Suppressed/missing revisions can leave unknown intervals; as-of queries represent the last observed state, not a guarantee of complete source history.

