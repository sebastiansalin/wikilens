# WikiLens — Junction 2026

Team: Sebastian, Aksu, Leo. Build a beautiful Wikipedia graph explorer and honest cross-language connection comparison using MariaDB.

## Current product direction
- Add an evidence-backed editing-disagreement map for a 20-article pilot from the Finnish-history M dataset. Reuse the existing graph; node color represents the conflict index.
- The index measures repeated editor reversals, not truth, political bias or cross-language agreement. Unmeasured/insufficient evidence is gray, never a fabricated zero.
- Implementation: pipeline/score.mjs, verified Parquet selection, optional MariaDB SVT import/readback, public/data/conflict-pilot.json, src/pilot.ts and ConflictPanel.
- Research and formula: docs/CONFLICT-RESEARCH.md. Read pipeline/AGENTS.md before editing the pipeline.
- Maintain README.md with actual validation/publication status. Never equate prepared code with completed calculations, database execution, GitHub upload or deployment.

## Collaboration
- Always use Sebastian's own connected browser (currently Brave), never the Codex/in-app browser. If it is unavailable or a browser action is blocked, ask for help instead of switching browsers.
- Root owns shared UI, contracts, package.json and deployment.
- Delegated agents may edit only their assigned directories. Do not undo another agent's work.
- Do not read, print, or commit credentials. Keep .env and local runtime files ignored.
- GitHub access was repaired on 2026-11-14: `sebastiansalin/wikilens` is selected in the existing connector installation. Source is published to private `main`; see docs/qa/github-publication.md.
- This managed session has read-only `.git` metadata and cannot read the GitHub CLI configuration. Use the connected GitHub API for publication, preserving the current remote tree and using an expected-head, non-force branch update. Do not run denied commands through a UI terminal or alter sandbox protections. Local Git metadata has not been synchronized with the remote history.
- Never invent data, similarity scores, API success, screenshots, reviews, or grading compliance.
- Connection similarity measures link overlap, not truth or political agreement.
- Unknown challenge requirements must remain marked unverified.

## Architecture
- Vite/React/TypeScript frontend: one persistent sidebar workspace, with Paper/Ink/Galaxy appearances.
- One shared API and MariaDB adapter, Vercel Node functions in api/.
- Language codes allowed: en, fi, ru, uk, de, fr, es, ja.
- Work must function without a database via explicit live-Wikipedia mode; never label that MariaDB mode.
- Test algorithms, normalization, continuation, and missing-data behavior. Test UI flows manually with screenshots.
- Deployment scope: one new wikilens project in the connected Vercel team, never existing projects.
