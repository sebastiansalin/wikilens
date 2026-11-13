# GitHub publication evidence

Verified on 2026-11-14, Europe/Helsinki.

## Access repair

The existing ChatGPT Codex Connector installation was limited to `sebastiansalin/hide-tag`. `sebastiansalin/wikilens` was added to its selected repositories in Sebastian's Brave browser. The existing selection was retained; access was not expanded to all repositories.

After saving, the connector returned WikiLens repository metadata successfully, including push permission and private visibility. Its installation repository list included WikiLens. The original 404 no longer occurred.

## Published source

- Repository: https://github.com/sebastiansalin/wikilens
- Branch: `main`
- Initial source commit: `e350134a028f35060bc9882cbb844c6e36958ff4`
- Initial source tree: `4b4c08beaae41f8fba9e3d8d029607f5bbe5ee79`
- Initial source snapshot: 117 files, 574,409 bytes.
- Verification: all 117 remote blob hashes matched locally calculated Git blob hashes; no missing or extra files; the recursive tree response was complete. The remote `main` ref pointed to the source commit.
- Upload method: GitHub connector tree/commit APIs followed by a normal, non-force branch update with the previous head as a precondition.
- This documentation and the README/AGENTS status correction are a subsequent documentation commit.

Only the source allowlist was packaged. `.env`, `.local`, dependencies, generated build output, raw Parquet/history files and credentials were excluded. The source snapshot passed a credential-pattern check.

## Validation

- `npm test`: 75 passed, zero failed, one MariaDB integration test skipped.
- `npm run build`: TypeScript and Vite production build passed.
- No application behavior changed for this access repair; earlier UI reviews are not claimed as new manual tests.

## Remaining boundaries

This session's filesystem policy keeps `.git` read-only, and GitHub CLI cannot read its configuration. Those local restrictions were not removed or worked around through an unrestricted terminal. The local repository still has no local commits; publication exists on GitHub through the connector. Use the connected API for subsequent changes, or a normal clone when working in a Git-enabled session. Do not force-push the unborn local history over the published history.

Vercel project creation and production deployment were not changed or verified in this GitHub repair. Neither dataset calculation nor MariaDB integration execution is established by the source upload.

GitHub also displayed an account notice requiring two-factor authentication before November 15, 2026 to avoid account-action restrictions. No authentication credentials or settings were changed in this repair.
