# Conflict pilot verification — 2026-11-13

## Verified

- Ten-source research comparison saved in docs/CONFLICT-RESEARCH.md.
- Pure scorer tests: constructive histories, reciprocal restores, isolated cleanup, self-reverts, unchanged saves, duplicates, conflicting duplicate IDs, missing hashes/users, parent gaps, time-separated events, multi-target deduplication, cleanup discount, paragraph recurrence and link normalization.
- A clearly synthetic temporary 20-article integration fixture exercises JSONL → score export, internal graph edges, exact row-count checks and checksum tampering. It is deleted after testing and never written to public/data.
- TypeScript compilation and Vite production build.
- Browser: live Finnish Talvisota map loaded 49 real nodes (48 displayed). Existing graph renders; the new disagreement panel explicitly reports that the M pilot has not been calculated. Screenshot inspected in the browser tool.
- Direct pilot URLs with no dataset show an explicit error and an exit to live Wikipedia; the exit removes pilot mode from the URL and restores the Finnish language selector.

## Not verified / not completed

- No real M article scores were calculated. Public release downloads were denied from the local shell; browser download timed out. No substitute scores were published.
- MariaDB SVT import and readback need a configured server; source timestamps, transaction rollback and duplicate capture behavior are implemented but have not run against MariaDB in this session.
- Score-color/timeline/passage UI with real M results cannot be checked until the public export exists.
- GitHub connector cannot access sebastiansalin/wikilens (404; search returned no accessible WikiLens repository).
- Local staging is also blocked: Git cannot create .git/index.lock (permission denied). No commit or push was created.
- Vercel project creation returned 403 permission denied. A compute sandbox also requires the missing new project ID; unrelated projects were not used.

No accuracy, human-review, comparative-superiority, GitHub-upload, production-deployment or MariaDB-compliance claims follow from passing unit tests.
