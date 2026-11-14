# Conflict pipeline maintenance

Purpose: calculate inspectable editing-disagreement evidence for all 19,742 Finnish-history M articles, then export a searchable catalog and sharded evidence for a bounded graph. The original 20-page v1 pilot is a retained baseline.

- Keep scorer functions deterministic and independent of database/network state.
- Never commit raw revision JSONL, editor exports, Parquet files, credentials or runtime folders. Public aggregates omit editor names.
- Never generate sample scores into public/data/conflict-pilot.json. That path is reserved for verified real M input.
- Preserve source checksums, selection policy, method version, history coverage and calculation engine. A Parquet calculation is not proof of MariaDB execution.
- Test self-reverts, no-ops, suppressed/gapped history, duplicate imports, sparse data, time windows and multiple-target restores.
- Change METHOD and docs/CONFLICT-RESEARCH.md when score semantics change. Do not claim better accuracy without an actual comparative evaluation.
- M is Finnish history, not every Finnish Wikipedia page. No cross-language disagreement is currently measured.
- The MariaDB importer is immutable and additive; never overwrite an existing different capture or disable certificate checks to connect.
- The atlas capture is m-2026-10-atlas. It has transactional per-page checkpoints and a complete-capture marker. Do not score a partial capture as complete.
- Verify canonical database rows against source histories, not just counts. First-parent null normalizes to zero consistently with prepare(). All scoring inputs, including comments and identities, participate in the private digest.
- Monthly tuple fields: YYYY-MM, revisions, content edits, content episodes, cleanup, maintenance, uncertain. Use shared src/atlas-model.mjs math in both pipeline and browser.
- Public artifacts omit editor identifiers. Raw sources, database files, checkpoints and review exports remain ignored. Public review cases contain only article/diff evidence; never invent reviewer annotations.
- Schema changes and integration must be exercised on MariaDB before reporting database validation as passed.
