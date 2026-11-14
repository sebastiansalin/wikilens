# Four-language release checks — 14 November 2026

## Completed before publication

- Source capture: eight M articles, 32 available FI/EN/UK/RU editions; fixed revision IDs and matching Wikidata identities. The capture deployment `ba8bf77` succeeded on the existing WikiLens Vercel project.
- Source file copied from the deployed public capture; every article SHA-256 rechecked by the builder.
- 44 AI-assisted claim axes, 264 pair-axis annotations, 43 measurable pairs. Seven aggregate values and one insufficient aggregate. No independent accuracy validation is claimed.
- Deterministic rebuild matches the committed public index. Every quotation is an exact substring in its associated source edition.
- `node --env-file=.env --test tests/*.test.mjs` with `WIKILENS_DB_INTEGRATION=1`: **100 passed, zero failed, zero skipped**, including MariaDB integration.
- TypeScript and Vite production build passed. No additional dependencies.
- Brave local desktop: two independent score cards, all six Talvisota pair selections, matrix symmetry, original quotations, sparse Kekkonen comparisons, full-catalog Viipuri search and unprepared state, return to monthly editing controls.
- Brave phone viewport (390 × 844): comparison matrix and both scores render within the viewport, with no horizontal document overflow. Screenshot visually inspected.

## Publication

Application publication and production browser verification are pending at this checkpoint. The existing production atlas remains available. This file will be updated with the observed deployment result.
