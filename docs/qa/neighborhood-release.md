# Language neighborhood integration — 14 November 2026

## Source integration

- Requested base: Leo Suojärvi's `feature/article-size-scaling`, commit `bd1d7602a1c7caa1dc64d3c317a3b0d476a0a28a`.
- Original language study: main `7027055cf6202cd058b0e4c3f1b7448c576389af`.
- Leo's 18 changed/added files were read from GitHub. Shared Atlas/CSS/README changes were integrated with the language view. ClassicGraph, ForceGraph, physics, monthly index math, extractive change summaries and their tests retain Leo's implementation.
- No Git metadata or credentials were changed. Publication uses the connected GitHub API and an expected-head non-force update.

## Validation before publication

- 117 Node tests passed, zero skipped, including the real MariaDB integration test.
- TypeScript and production Vite build passed.
- Brave local check confirmed the classic graph, varied article sizes, editing score 35 for Talvisota, two distinct score cards, change overview, monthly controls and 8× playback. Playback moved the selected month; switching to languages paused it and removed the editing timeline.
- The first capture preview hit Wikimedia HTTP 429. The second capture uses request pacing and bounded backoff. Failed captures were not deployed to production.
- Completed capture: 100 articles, 323 available editions, 71 missing sitelinks and six unavailable editions. 417 measurable pairs; 72 aggregate scores; 28 articles correctly unscored. See `neighborhood-validation.json`.
- All 100 SHA-256 capture hashes, deterministic M selection, computed details and 6,493 exact quote anchors verified. No independent semantic-accuracy claim.
- Brave local checks confirmed six Talvisota pair scores, pair switching, original introductions and outlines, and missing-evidence states. The Sources tab was removed for this capture after detecting encoded citation IDs; a regression check fixes the extractor for future captures. Existing concept scores are unaffected.
- Browser viewport override did not change the actual viewport (it remained 2328px); mobile visual validation is not claimed. The override was reset.
- Production publication is pending at this pre-release checkpoint.
