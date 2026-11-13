# WikiLens

A dark, interactive map of observed Wikipedia editing conflict, backed by **MariaDB system-versioned tables** and real Finnish Wikipedia revision histories. No generated scores or fabricated revisions.

## Run

Prerequisites: Python 3.12+, Docker Desktop (Linux containers).

```powershell
docker compose up -d --wait
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
$env:DB_PASSWORD = 'local-development-only'
.\.venv\Scripts\python ingest.py --limit 36
.\.venv\Scripts\python server.py
```

Open **http://127.0.0.1:8000**. The local database binds only to loopback on port 3308. The checked-in password is for local development only; configure DB_HOST, DB_PORT, DB_USER, DB_PASSWORD for a different database. Server listens on loopback and exposes read-only endpoints. This is a local prototype, not a publicly hardened deployment.

The importer downloads **M shard 01** (~20 MB), verifies the SHA-256 against the release manifest, and imports 36 selected article histories. Existing nonempty databases are refused to avoid accidental duplicate histories. It uses roughly 1–2 GB database storage. It deliberately selects 24 heavily edited pages plus 12 pages spread across remaining revision counts; rankings are not representative of all Wikipedia.

The test sample contains **42,242 revisions**, **6,488 cross-editor exact restorations**, and **97 directed links** at 1 October 2026. These numbers describe the sample, not Wikipedia as a whole. The 97 directed edges are visually deduplicated into undirected strokes when both pages link to each other.

## Explore

- Drag node balls: nearby nodes gently repel and move aside. Links behave as soft springs. Drag empty space to pan; scroll or use +/− to zoom.
- Green → amber → red indicates smoothed mutual-revert intensity on a fixed 0–4% display scale. Flames require at least 20 revisions, 5 mutual events, and intensity ≥3%. These are exploratory display thresholds, not validated categories.
- Node radii scale with square root of historical wikitext bytes (bounded 8–28 logical pixels). Link width scales with the smaller endpoint's radius, with readability caps.
- The time slider queries article states through `FOR SYSTEM_TIME AS OF`. Text, size, and extracted links are historical. Scores never look beyond the selected date.
- Choose all history, 365, 90, or 30 days. Gray indicates fewer than 20 revisions in that period. Volume is a separate accumulated-conflict measure.
- Select an article in the graph or keyboard-accessible ranking to see exact events, real revision links, before/after diffs, and a revision excerpt.
- Motion can be paused. OS reduced-motion settings disable flames' animation and start the simulation paused. Dragging still produces local repulsion.

## Scoring

`scoring.py` detects a revision restoring an earlier nonempty SHA-1 that differs from the preceding hash. Self-restorations are excluded. It attributes one event to the restoring and preceding editors, which conservatively undercounts multi-editor reversals. Partial restores are missed.

Only events between a pair with reversals in **both directions within the window** count toward `m`.

**Intensity = 100 × (m + 20p₀) / (N + 20)**

N includes all saved revisions (the minor flag does not reliably distinguish formatting). p₀ is the pooled mutual-revert rate across the imported sample for the same window. This smoothing is our proposed adaptation. It is a rate, not a probability that an article is controversial. Comparing dates uses changing sample/window baselines, so always inspect raw counts.

**Volume = E × sum(min(nᵤ, nᵥ))** over mutual-reversal events in the window. E is the number of participating editors, and n is each editor's article contribution count up to the selected date. This is inspired by Yasseri et al., but omits their strongest-pair exclusion; it is not an exact reproduction. Volume color uses a fixed logarithmic 0–100,000 scale. Flames continue to reflect intensity, independently of the color mode.

No automatic bot/vandalism classifier is applied. Accounts are not guaranteed to represent different people. No observed mutual reverts is not proof of consensus. Score computation is deterministic and does not use an LLM. Manually review evidence before interpreting a hotspot.

## Architecture

- `article`: full raw revision states with explicit Wikipedia UTC system-period boundaries. Import uses `system_versioning_insert_history`; tied timestamps are ordered by revision ID and separated by one microsecond.
- `revision_meta`: compact derived revision metadata for analytics, avoiding scans of large historical text records.
- `reversal`: precomputed exact-restoration events with supporting revision IDs.
- `article_link`: materialized latest-snapshot links; the API reparses the actual `AS OF` article text for historical graphs.
- `metadata`: dataset provenance and checksum.
- `server.py`: Python HTTP API; bounded in-memory caches for the small sample. Restart after imports to refresh caches.
- `web/`: dependency-free canvas UI, soft repulsion/springs, DOM evidence panel. Google Fonts are optional; system-font fallbacks work offline.

Endpoints: `/api/health`, `/api/graph?date=2026-10-01&days=0`, `/api/article?id=1137&date=2026-10-01&days=0`.

## Validate

```powershell
.\.venv\Scripts\python -m unittest -v
$env:DB_PASSWORD = 'local-development-only'
.\.venv\Scripts\python verify_database.py
```

Tests cover exact restorations, self-restores, missing hashes, mutuality, future-information exclusion, and smoothing. Database checks verify all 42,242 imported rows, adjacent periods, indexed revision retrieval, temporal state selection, and live graph/evidence API outputs. This does not establish statistical validity of the metric; that requires independent human-labeled examples.

## Scaling next

Import additional M shards with a resumable loader and all-or-nothing sample manifest. Materialize monthly score components, persist temporal link changes, resolve redirects and renamed titles, and load one-hop neighborhoods instead of all nodes. The current importer refuses nonempty imports; it is intentionally a small-sample prototype. Full-M scaling has not been tested. For paragraph-level conflict, add stable block matching and partial-revert detection before claiming passage-level attribution. No vector-search/RAG feature is implemented yet; the challenge track used here is SVT.

## Sources and attribution

- [MariaDB Wikipedia M dataset](https://github.com/MariaDB/mariadb-wikipedia-datasets/releases/tag/m-2026-10), snapshot 1 October 2026. Preserve Wikimedia text attribution and applicable CC BY-SA terms when reusing article excerpts; revision links identify the original revision and its contributor history.
- [Finnish Wikipedia](https://fi.wikipedia.org/) and [Wikimedia terms](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use).
- [MariaDB SVT starter](https://github.com/MariaDB/mariadb-system-versioning-wikipedia).
- [Yasseri et al., Dynamics of Conflicts in Wikipedia (2012)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3380063/).

Editing conflict does not establish factual accuracy, bias, or real-world controversy.
