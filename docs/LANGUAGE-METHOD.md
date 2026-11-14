# Language comparison demo — claims v1

The atlas now has two independent indices: recurring editing reversals in the Finnish M history, and differences in selected claims/framing across Finnish, English, Ukrainian and Russian introductions. Neither is a truth, bias, reliability or national-opinion score. Their denominators differ, so comparing the two numbers directly is not meaningful.

## Frozen sources and selection

The capture at `public/data/languages/capture.json` was collected on 14 November 2026 from public Wikimedia APIs during a Vercel build. It contains eight M articles and 32 available language editions. Selection starts with the 30 most-revised M articles, then takes the eight with the greatest observed Finnish pageview totals in the requested last 30 days, requiring at least 28 reported days. The actual capture has 29–30 reported days per selected article. This is a bounded demo selection, not the most popular articles in all M or all Wikipedia. Candidate rankings, periods and counts are retained.

Wikidata sitelinks establish topic identity. Each edition must resolve back to the same QID, and the parsed introduction must match the queried revision ID. Failure is unavailable, never a fabricated text. `action=parse`, `oldid` and `section=0` freeze each introduction to a known revision. Revision timestamps vary; this is not a simultaneous historical reconstruction. These November sources are separate from the October Finnish M history. The monthly slider does not affect this score.

Only paragraph prose in the lead is captured, excluding tables and superscript references. The raw parse can include citation-error notices; those are not claim evidence. Excerpts link to fixed revisions with Wikipedia contributor attribution. Content is CC BY-SA; English paraphrases are marked as AI-assisted.

## Annotation and function

`pipeline/language-demo-labels.mjs` contains explicit AI-assisted annotations prepared by an OpenAI assistant reading all 32 captured introductions. There was no independent human review, external model API call, or benchmark. The module is an auditable frozen annotation set, not a general-purpose semantic classifier. Refreshing arbitrary articles does not automatically classify them.

Each article has 5–6 selected axes, chosen after reading its introductions. That selection is subjective and can change the result. Each statement has an exact original-language substring and English paraphrase. The builder verifies every substring against the correct capture and refuses modified captures or stale annotation hashes.

For each of six unordered language pairs, an axis receives one of:

| Label | Meaning | Score denominator |
| --- | --- | --- |
| Compatible | Statements can coexist at their stated precision | Included |
| Different framing | Different emphasis, qualification or attributed interpretation; no necessary contradiction | Included |
| Conflicting claim | Explicit incompatible statement, such as different end dates | Included |
| Not comparable | Omitted statement or different counting/time scope | Excluded |
| Uncertain | Insufficient context, dating or translation confidence | Excluded |

Pair score = `round(100 × (framing differences + conflicting claims) / comparable axes)`, with at least **three** comparable axes. Overall score = rounded equal mean of measured pair scores, requiring **three** measured pairs. Coverage is always visible. These thresholds and equal weights are design choices, not calibrated statistics. One added axis can move a small-sample score substantially. Zero means no difference found on the measured axes only.

Framing and contradictions contribute equally to the display index but their counts and labels are separate. Reporting an attributed perspective is not treated as the Wikipedia editors' own belief. Additional detail, genre overlap, broader date precision and reasonable rounding are not factual contradictions. Potential update lag is not an opinion difference. No edition is privileged as ground truth.

## Captured results

| Article | Aggregate | Measured pairs | Axes |
| --- | ---: | ---: | ---: |
| Nightwish | 17 | 6/6 | 5 |
| Urho Kekkonen | Unknown | 1/6 | 5 |
| Alexander Stubb | 0 | 6/6 | 5 |
| Carl Gustaf Emil Mannerheim | 8 | 6/6 | 5 |
| Sauli Niinistö | 0 | 6/6 | 6 |
| Suomen sisällissota | 13 | 6/6 | 6 |
| Jatkosota | 17 | 6/6 | 6 |
| Talvisota | 9 | 6/6 | 6 |

There are 44 selected axes, 264 pair-axis decisions and 43 measured article pairs. The other five pairs are explicitly insufficient. These results describe the frozen annotations; they are not accuracy estimates.

Source context matters: a browser check of [Russian Winter War revision 155688701](https://ru.wikipedia.org/w/index.php?oldid=155688701) found an attached note clarifying that actual hostilities ended on 13 March. Its introduction says 12 March. That apparent difference was removed from the numerator and denominator because the dates describe different boundaries; this qualification is not in the paragraph-only capture. This check is not independent validation. Missing footnotes and context can still produce errors elsewhere.

A second check of [Ukrainian Mannerheim revision 49146020](https://uk.wikipedia.org/w/index.php?oldid=49146020) found June in the introduction but July in its own infobox for the regency end. All pairs involving that Ukrainian date are uncertain and excluded. The final demo contains framing differences, but no remaining annotations labelled conflicting claims. The implementation supports that category; it does not manufacture examples of it.

## Reproduce and extend

```
npm run languages:build
node --test tests/language-model.test.mjs
```

The builder recomputes source hashes, validates evidence and deterministically generates `public/data/languages/index.json`. Production rebuilds from the committed capture and labels without upstream requests. On a network-enabled environment, `npm run languages:capture -- --refresh` creates a new source capture; review and re-annotate it before rebuilding. Preserve earlier captures when comparing versions. Add independent multilingual reviewers and a fixed axis-selection protocol before making accuracy or generalisation claims.

Primary API references: [PageViewInfo](https://www.mediawiki.org/wiki/Extension:PageViewInfo), [Revisions](https://www.mediawiki.org/wiki/API:Revisions), [Parsing wikitext](https://www.mediawiki.org/wiki/API:Parsing_wikitext). Tests establish calculation and provenance behavior, not semantic correctness.
