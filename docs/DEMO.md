# WikiLens demo

Open https://wikilens-junction2026.vercel.app after checking the release status in [atlas-release.md](qa/atlas-release.md).

## Ninety-second walkthrough

1. Start at **Talvisota**. Explain that all 19,742 articles and 862,076 revisions in the Finnish-history M dataset were imported into MariaDB system-versioned tables and verified on readback. The graph shows a bounded neighborhood; search covers the entire collection.
2. Search **Nightwish**, select it and open a content-candidate episode. The prototype detects partial genre-wording reversals missed by the retained exact-restore baseline. Show the passage alternatives and follow a source diff. This is a known development example, not an independent accuracy result.
3. Change the observation window to **Last 5 years**. Historical activity should not imply a recent dispute. Move one month with the arrow: counts and colors use calendar months. Connections remain the latest captured links.
4. Return to **All captured history**. Use **Expand** to reveal more of the neighborhood; the event horizon stops at 160 drawn nodes. Gray means insufficient evidence, not agreement.
5. Open **Methodology**. Explain content candidates versus cleanup, maintenance and uncertain cases, the uncalibrated display index, and the pending independent review. The 120-case blind-review workspace and evaluator are ready for reviewers; no labels or accuracy numbers have been invented.

## Technical evidence

- [Calculation](qa/atlas-calculation.json): source fingerprint, dataset size, canonical readback matches, method version and category counts.
- [Export validation](qa/atlas-validation.json): all evidence shards, monthly aggregates, link integrity and known regression cases.
- [Method](ATLAS-METHOD.md): definition, limits and review protocol.
- [Research](CONFLICT-RESEARCH.md): relationship to prior approaches.
- [Challenge fit](CHALLENGE.md): implemented features and explicit limitations.

The hosted atlas is a static export of verified MariaDB calculations. It runs when the development PC is off. Live Wikipedia exploration is explicitly separate; neither live link overlap nor the atlas index is a truth score.
