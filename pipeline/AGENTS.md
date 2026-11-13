# Conflict pipeline maintenance

Purpose: calculate inspectable editing-conflict evidence for 20 actual Finnish-history articles in MariaDB's M dataset, then export the graph to the existing WikiLens UI.

- Keep scorer functions deterministic and independent of database/network state.
- Never commit raw revision JSONL, editor exports, Parquet files, credentials or runtime folders. Public aggregates omit editor names.
- Never generate sample scores into public/data/conflict-pilot.json. That path is reserved for verified real M input.
- Preserve source checksums, selection policy, method version, history coverage and calculation engine. A Parquet calculation is not proof of MariaDB execution.
- Test self-reverts, no-ops, suppressed/gapped history, duplicate imports, sparse data, time windows and multiple-target restores.
- Change METHOD and docs/CONFLICT-RESEARCH.md when score semantics change. Do not claim better accuracy without an actual comparative evaluation.
- M is Finnish history, not every Finnish Wikipedia page. No cross-language disagreement is currently measured.
- The MariaDB importer is immutable and additive; never overwrite an existing different capture or disable certificate checks to connect.
- Schema changes and integration must be exercised on MariaDB before reporting database validation as passed.
