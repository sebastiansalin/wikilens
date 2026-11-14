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
- Empty search showed an explicit no-match state. The blind-review workspace loaded 120 cases with zero labels; no independent annotations were created.
- Added an accessible name to the mobile graph-motion button. The live explorer now labels its old pilot as an archived v1 baseline and links to the monthly atlas.

## Release state

Published through the GitHub connector with an expected-head, non-force update:

- Repository: `sebastiansalin/wikilens`, branch `main`.
- Previous head: `9f7ac9f23205933ab58b34c7341a66398df336a6`.
- Atlas release commit: `5b843bfe20ec906fce3d0f1ac42dc9aa0dd49073`.
- Release tree: `0b3f7c644faec722281d7373709a379b9ff7351b`.
- All 209 published file hashes matched the checked local snapshot; no missing/extra files and a complete recursive tree response. Existing remote contents were preserved through the base tree.
- Vercel Git integration deployed the existing `wikilens` project in team `mv-c84d`. Dashboard status: **Ready / Production / Current**, build duration 15 seconds.
- Deployment: `dpl_5s8xvUbde666fL6kGbxw8rp6tWs8`, https://wikilens-mg4dbk7n9-mv-c84d.vercel.app.
- Public URL: https://wikilens-junction2026.vercel.app.

Production browser checks confirmed 19,742 articles / 862,076 revisions, Talvisota index 11, Nightwish search and its January 2009 genre alternatives with two diff links, and a five-year window ending September 2026 with zero Nightwish candidate episodes. No console errors were observed in these flows. The hosted live-Wikipedia explorer loaded Talvisota and 49 articles. The local live API could not reach Wikipedia under this session's outbound network restrictions; that did not affect the static atlas or the hosted API.

The Vercel connector returned 404/403 for the configured project. Its existing Git integration and authenticated dashboard remained functional; no project replacement, credential extraction or permission change was needed. Local `.git` metadata remains unsynchronized and read-only. This status record and README correction follow the application release as a documentation-only commit.

Independent classifier validation remains pending and is not supplied by these checks. No population accuracy, research superiority, production load benchmark or judging score is claimed.
