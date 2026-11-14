# Language differences release checks — 14 November 2026

Prepared on Leo's reviewed main (`a570f564160f4a1df5000b0de05dcf8317764ddf`). The editing score, graph, dataset and monthly calculations are unchanged. The optional language tab has separate state and lazy-loaded code, stylesheet, index and article evidence.

Capture completed in GitHub Actions run [43646804217](https://github.com/sebastiansalin/wikilens/actions/runs/43646804217); source commit `6bc54bc96054166ced1deb59d00be58e667ee206`. Exactly 100 topics were selected by all-history score and the atlas tie-breakers, without replacing missing translations. Of 400 possible editions, 210 were captured, 189 had no sitelink, and one English sitelink for Sankarivainaja failed identity verification and was rejected. 55 topics have at least one measurable pair; 173 pairs measured, 427 insufficient. No aggregate language score or blended score is exported.

Capture: 347 seconds, 535 paced requests, zero retries. Raw source shards: 2,311,881 bytes. All capture, detail and manifest/report files: 4,865,702 bytes (decimal 4.9 MB). Extrapolation to 1,000 similar topics is about 58 minutes and 49 MB; larger samples have not been benchmarked. No LLM calls occur.

Validation completed:

- 111 Node tests passed; one real-database integration test skipped in this session. No database recalculation was necessary for this independent static layer.
- TypeScript and Vite production build passed. The new lazy chunk is approximately 3.3 kB gzipped JavaScript and 1.6 kB gzipped CSS, plus a tiny shared icon chunk. These assets are deferred until the language tab opens.
- Offline rebuild succeeded. The audit verified all 100 source hashes, exact full-history ranking, 173 pair calculations and 2,553 concept quotations against the captured paragraph/link/QID. Null pairs stayed null.
- Connected Brave desktop: tab opens; six Belomorsk pair scores load; FI/RU switching updates the passages; search selects Ahti Myrsky and shows three missing editions and six insufficient pairs.
- Connected Brave at 390 × 844: tab navigation, search, selected article, missing-edition states and vertical scrolling remained usable. Viewport override reset after testing.
- Close button and Escape restored Livvinkarjala / September 2026 in the atlas. Reopening retained the independent language article. No captured browser console errors after these checks.

Publication status at this record: source and data prepared and locally verified; production deployment verification pending.
