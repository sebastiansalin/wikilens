# Atlas release verification

Release check started 14 November 2026 (Europe/Helsinki).

## Data and automated checks

- Complete capture: 19,742 articles, 862,076 revisions, 138,735 directed links.
- Canonical readback matched source for all 19,742 histories.
- `WIKILENS_DB_INTEGRATION=1 node --env-file=.env --test tests/*.test.mjs`: 93 passed, zero failures, zero skipped.
- Python preparation tests: two passed.
- `node scripts/validate-atlas.mjs`: passed all 64 evidence shards, monthly totals, graph integrity, episode counts and known-case regressions.
- `npm run build`: TypeScript and Vite production build passed.

## Browser checks

Observed in Sebastian's connected Brave browser against the local Vite app:

- Desktop atlas rendered with the full catalog, Talvisota score 11, eight content candidates and 2,143 revisions.
- Searching Nightwish returned the matching article, score 9 and three candidates. Opening its January 2009 infobox episode displayed the competing genre wording and two source diff links.
- Last-five-years selection produced zero recent Nightwish candidates; Previous month changed the selected month and share URL to September 2026. All-history and next-month controls restored the full period.
- Graph expansion progressed through 112 to 160 visible articles, then disabled expansion at the limit.
- Methodology dialog exposed the formula, provenance and limitations.
- At a verified 390 x 844 CSS-pixel viewport, Map and Inspect tabs rendered without horizontal overflow. Screenshots of the desktop map, mobile map and mobile inspector were inspected in-session.
- No browser console errors observed during those atlas flows.

## Release state

Publication and production verification are in progress. Independent classifier validation remains pending and is not supplied by these checks.
