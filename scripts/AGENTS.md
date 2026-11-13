# Local setup and publication

`bootstrap-local.mjs` is a reviewable Windows setup script for this workspace. It downloads official MariaDB and M files, verifies checksums, initializes a loopback-only database, calculates the real 20-page pilot, tests/builds, and attempts a normal Git push to the existing private WikiLens repository.

Run `npm install` before the full bootstrap. `node scripts/bootstrap-local.mjs --git-only` publishes the source without requiring MariaDB, PyArrow or the dataset. Its separate `.local/git-publish-status.json` report preserves the database setup report.

- Do not use UI terminals, background helpers or other execution surfaces to evade an executor permission denial. If this session cannot run a step, ask Sebastian to run the concrete command in his normal PowerShell.
- The bootstrap is not a Windows service and does not change PATH, firewall, browser protections or machine policy.
- Generated credentials remain under ignored `.local/` and `.env`. Never print them, paste them into chat, commit them, or include them in the status report.
- Only package source from the explicit allowlist. Verify the destination repository and branch before publishing; never force-push.
- The status file `.local/bootstrap-status.json` is safe to inspect and records actual completed steps. Do not claim a step passed just because a script exists.
- Use Sebastian's own browser for browser tasks. Never fall back to the Codex/in-app browser.
