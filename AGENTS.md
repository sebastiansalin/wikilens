# WikiLens — Junction 2026

Team: Sebastian, Aksu, Leo. Build a beautiful Wikipedia graph explorer and honest cross-language connection comparison using MariaDB.

## Current product direction
- Explore all 19,742 articles / 862,076 revisions in the Finnish-history M dataset. Node color represents the selected-window disagreement index; the event horizon limits visible nodes to 160 while search includes every article.
- The index measures repeated editor reversals, not truth, political bias or cross-language agreement. Unmeasured/insufficient evidence is gray, never a fabricated zero.
- Current implementation: pipeline/score-v2.mjs, src/atlas-model.mjs (shared monthly math), pipeline/import-atlas.mjs, pipeline/build-atlas.mjs, public/data/atlas/, src/Atlas.tsx. Keep score-v1.mjs and the twenty-page export reproducible as an audit baseline.
- The v2 labels are heuristic content candidates, cleanup, maintenance or uncertain. Classification is retrospective and unvalidated. Number-only changes and unmatched deletions are deliberately uncertain. Never claim superiority or accuracy without independent labels.
- Default UI ports the feature/conflict-explorer branch's DM Sans / Space Grotesk, mint/charcoal layout. Preserve the React graph physics and explicit live-Wikipedia explorer.
- Time controls and edit bars are monthly. Article links use the latest captured text, not the slider's historical date; say so in the UI.
- Research and formula: docs/CONFLICT-RESEARCH.md. Read pipeline/AGENTS.md before editing the pipeline.
- Maintain README.md with actual validation/publication status. Never equate prepared code with completed calculations, database execution, GitHub upload or deployment.
- The default language layer uses pipeline/language-neighborhood.mjs and capture-neighborhood.mjs to compare linked-concept coverage in FI/EN/UK/RU paragraph prose for 100 M articles connected from Talvisota. It is coverage distance, not opinion or contradiction detection; see docs/LANGUAGE-NEIGHBORHOOD.md. Preserve Leo's feature/article-size-scaling graph, filtering and monthly playback. The earlier separate claim study compares FI/EN/UK/RU introductions for eight popular demo articles. Keep AI-assisted unvalidated annotations distinct from automated editing heuristics and live link overlap. See docs/LANGUAGE-METHOD.md. Capture hashes and exact source quotes must validate; a refreshed capture needs reannotation. The November language snapshot never follows the monthly editing slider. Neither index measures national opinion or truth.

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
- Deployment scope: the existing wikilens project (prj_Kqw8fHTEziyxEvod4W54L0LKbkMQ) in team_lBtXgtam1kgPVZNZWEAqkCNc. Never deploy to unrelated projects or create a replacement project.
