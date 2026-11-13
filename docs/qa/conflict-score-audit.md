# Audit of the deployed conflict index

Audit date: 2026-11-13 UTC / 2026-11-14 Finland. Method: `wikilens-conflict-v1`. Dataset: `m-2026-10`. This audit does not change the deployed algorithm or scores.

**Verdict: reproducible calculations, but inadequate validity as a ranking of substantive editorial disagreement. No evidence establishes a relationship to factual truth or present-day article reliability.** The evidence browser is useful; the scalar ranking needs revision and independent evaluation.

## What was checked

- Re-read the scorer and its research rationale.
- Queried all 37,318 selected revisions from MariaDB using `FOR SYSTEM_TIME ALL`; reproduced all 20 numeric scores, qualifying-revision counts, participant counts, active-day counts, comparable-transition counts and weighted counts exactly. Text is unnecessary for the numeric score; original wikitext was fetched separately for inspecting changes.
- Independently reconstructed the candidate/qualified events and verified their counts and formula outputs against the production scorer. There are 289 qualifying revisions on 77 article-days.
- Inspected the first qualifying change on each of those 77 article-days as a diagnostic screen, then inspected all 52 post-2012 qualifying changes on the highest-scoring article. Large multi-change revisions require more context than the compact diagnostic excerpts, so this is not an exhaustive annotation of all 289 events.
- Inspected additional zero-score genre reversals and a whole-page restoration that contributes passage highlights.
- Checked representative vandalism, genuine content disagreement, language-link maintenance and zero-score examples against the original Wikipedia diffs in Sebastian's Brave browser. Re-read the original Yasseri et al. paper.

Audited public JSON SHA-256: `82d951e630853bb53531bfc2ff649e75e507c84cd5bfc386096aff770ee03d64`.

## How v1 works

It finds a whole-page SHA-1 matching an earlier version within both 100 revisions and 30 days. It then requires an editor pair to reverse each other in both directions, with at least three distinct reversing revisions within a 30-day window. Each qualifying revision counts once, including both reinsertion and removal of vandalism when they satisfy these rules.

The 0–100 score combines cumulative recurrence (45%), reversals as a fraction of edits (30%), distinct active days (15%) and participating editor identities (10%). Nonlinear saturation and constants are hand-chosen, not fitted to human judgments. A short comment keyword pattern discounts explicit cleanup descriptions to one quarter. M has no bot flags, so the explicit bot exclusion cannot filter bots in this capture.

The index does not inspect factual sources, infer the two competing claims, determine which claim is true, or establish that the opposing edits were made in good faith. Exact paragraph returns are a separate display feature and do not contribute to the number.

## Findings

### 1. The top score is dominated by obvious vandalism

Sauli Niinistö scores **76.4**, from 67 qualifying revisions. **52 of those 67 (77.6%)** concern insulting name substitutions, obscene inserts, abusive category changes, or whole-page vandalism and their reversals. All 52 receive full weight: the default rollback comments do not contain the cleanup keywords. This is an analyst classification of these inspected revisions, not a blinded assessment or an estimate of global classifier accuracy.

| Date | Counted revisions | Observed change |
|---|---:|---|
| 2013-06-13 | 3 | Abusive name substitution and restoration |
| 2013-06-14 | 26 | Repeated insertion/removal of the same abusive name label |
| 2013-12-12 | 3 | Insulting name substitution and restoration |
| 2014-07-15 | 3 | Whole article replaced by an obscene sentence, then restored |
| 2015-07-21 | 3 | Abusive category insertion/removal |
| 2015-09-10 | 4 | Same category inserted into a broken book citation, then restored |
| 2015-09-11 | 6 | Obscene allegation inserted/removed |
| 2025-11-12 | 4 | Derogatory name substitution and restoration |

Examples: [June 2013](https://fi.wikipedia.org/w/index.php?diff=13322269&oldid=13322263), [November 2025](https://fi.wikipedia.org/w/index.php?diff=23674279&oldid=23674278). All 52 revision IDs are in the accompanying aggregate audit JSON. The remaining 15 have not been uniformly labeled substantive: they include campaign-finance content, source suitability and election-result timing.

Across all 289 qualifying revisions, only **4** receive any cleanup discount. This is not proof that every other revision is vandalism. It does demonstrate that the narrow comment rule failed on the concrete examples above. Repeating vandalism is reciprocal in the algorithm's sense and therefore passes the main qualification rule.

### 2. Mechanical maintenance contributes to the score

Martti Ahtisaari scores **40.5** from seven revisions. Four are alternations of a Hindi interlanguage link on 25–27 February 2011, with bot-add/bot-remove summaries. They change navigation metadata rather than competing claims about Ahtisaari. [Original diff](https://fi.wikipedia.org/w/index.php?diff=9843733&oldid=9842890).

The other three concern whether to include a detail about presidential term dates. That is an editorial inclusion dispute, but should not be treated as comparable to a major historical dispute without an explicit definition and validation.

### 3. Zero does not mean no disagreement

Nightwish scores **0**, although the lead, infobox and genre paragraph were repeatedly changed between gothic-metal and power-metal descriptions. See [12 November 2007](https://fi.wikipedia.org/w/index.php?diff=3791251&oldid=3790673) and [13 November 2007](https://fi.wikipedia.org/w/index.php?diff=3796989&oldid=3792689). Its history contains 172 non-self exact restorations, but none qualify under the strict repeated reciprocal-pair rule. The separate paragraph-return detector does expose the genre wording.

Matti Vanhanen likewise scores 0 despite 245 non-self exact restorations. Those counts alone do not establish substantive conflict; they establish that zero means failure to meet this particular detector's conditions, not absence of reversals or proof of consensus.

Whole-page hashing also cannot recognize a partial reversal when unrelated changes leave the final text different from every earlier full-page version. This is a structural limitation, not a measured recall estimate.

### 4. Genuine historical content disputes are detected

Suomen sisällissota scores **67.1**. Its evidence includes competing wording about executions, prisoner deaths and the explanation of casualties. Both editors' summaries refer to discussion, and the text changes materially alter the account. [26 March 2008 diff](https://fi.wikipedia.org/w/index.php?diff=4531275&oldid=4529626).

Jatkosota and Talvisota also contain reversals over whether the outcome should explicitly say Soviet victory; see [Jatkosota example](https://fi.wikipedia.org/w/index.php?diff=14002301&oldid=14002284). This is useful evidence of framing disagreement. The audit does not decide which historical formulation is correct. Finding these examples does not validate their ranking below vandalism-heavy biographies.

### 5. The colors mostly describe old history

Re-running the unchanged scoring function on revisions from **2021-10-01 through the snapshot** gives zero qualifying signal for **13 of the 15 articles with positive lifetime scores**. All 20 have enough revisions to satisfy the scorer's minimum-data rules in this five-year window. The five-year calculations are diagnostic only, not deployed replacements.

| Article | Published lifetime score | Last qualifying event | Five-year score |
|---|---:|---|---:|
| Sauli Niinistö | 76.4 | 2025-11-12 | 27.0 |
| Tarja Halonen | 73.8 | 2017-01-20 | 0.0 |
| Suomen sisällissota | 67.1 | 2017-08-28 | 0.0 |
| Urho Kekkonen | 62.5 | 2009-12-15 | 0.0 |
| Alexander Stubb | 61.5 | 2026-09-08 | 39.1 |
| Vanhoillislestadiolaisuus | 52.2 | 2006-03-06 | 0.0 |

Old events do not lose weight with elapsed time. Additional ordinary edits can dilute the rate component, but cannot erase the accumulated recurrence/day/participant components. Sauli's four recent qualifying events are the November 2025 name-vandalism cycle, so a recent window alone does not solve intent classification.

### 6. The scale is arbitrary and sensitive to design choices

For Sauli, approximately 69 of its 76.4 points come from cumulative recurrence, active-day and participant components; only about 7.4 come from the normalized reversal rate. Thus a relatively small number of bursts across decades can produce a high score.

Changing both the exact-restoration time bound and episode window from 30 to seven days changes Stubb from 61.5 to **50.1**, and Jatkosota from 50.0 to **38.5**. Raising the exact-restoration lookback from 100 to 1,000 revisions changes none of the 20 scores in this pilot. These are sensitivity checks, not reasons to select whichever setting gives a preferred ranking.

A value of 76.4 is neither a 76.4% probability nor a statistically calibrated quantity. Decimal precision describes rounding, not measurement certainty. Editor identities are not guaranteed to correspond one-to-one with people. The 20 most-revised pages are an activity-biased selection, not a representative benchmark.

### 7. Passage highlights can inherit unrelated whole-page cleanup

On [14 April 2015](https://fi.wikipedia.org/w/index.php?diff=14828465&oldid=14828458), a blank Sauli page was restored to 43,167 characters. This single change reintroduced **22 detector-eligible paragraphs**. It appears among the evidence for all eight displayed Sauli passages, including unrelated biographical topics.

Those returns are real, but do not prove that editors specifically disputed each paragraph's content. Paragraph highlights need to distinguish targeted wording changes from collateral restoration of a vandalized page. The numeric score currently keeps these passage events separate, which is appropriate.

## Relation to prior research

[Yasseri et al. (2012)](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0038869) explicitly distinguish vandalism from substantive conflict. Their method weights mutual reverts using editor experience and removes the strongest pair's contribution; it also reports comparison with human judgments. WikiLens borrowed mutual-revert detection but does not implement that full measure or its evaluation. Our bounded windows and transparent provenance are useful engineering choices, not evidence that our classifier is more accurate. Experience itself would only be a feature, not proof of good faith or truth.

## Recommended next version

1. Define the target as **substantive editorial disagreement**, with separate outputs for vandalism/repair, maintenance, and ambiguous changes. Keep factual correctness outside this index.
2. Track competing sentence/passage versions, including partial restores; separate substantive prose, infobox claims, navigation metadata and whole-page blanking. Display the actual wording alternatives and dates.
3. Group repeated reversals into dispute episodes around a passage/topic. Limit the contribution of a single repetitive pair or burst. Use verified bot metadata when available; do not equate anonymity, short edits or quick reversions with vandalism.
4. Separate a selected recent period from lifetime history, with visible dates, last-event date, coverage, and unknown states. A recent zero still must not imply consensus.
5. Before choosing a new scalar formula, obtain independent labels on sampled episodes and also on non-detected edits. Include substantive disputes, obvious vandalism, routine maintenance and ambiguous cases. Blind reviewers to scores, report reviewer agreement, and reserve articles/time periods for evaluation rather than tuning.
6. Compare precision/recall and article-ranking agreement against raw revert baselines and faithfully implemented published methods. Keep uncertainty and evidence visible; use score bands until numerical calibration is defensible.

Do not simply increase the keyword list, count every paragraph return, or tune weights until familiar controversial topics rank higher. Those changes can conceal the same problems. There is currently no measured accuracy percentage and no basis for claiming superiority to the ten reviewed approaches.

## Reproduction and artifacts

Run `node --env-file=.env scripts/audit-conflict.mjs` with the existing local pilot database. It performs SELECT queries only, verifies the 20 numeric results, writes private diagnostic excerpts to the ignored `.local/conflict-audit.json`, and prints aggregate results. It does not modify production data or database rows. Raw diagnostic excerpts and editor-bearing comments must remain uncommitted.

The accompanying [aggregate audit JSON](conflict-score-audit.json) contains numeric results and revision IDs without editor identities or raw comments. No independent human review, comprehensive precision/recall benchmark, truth assessment, or v2 deployment was completed by this audit.
