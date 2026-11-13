# A tiled universe with a living neighbourhood

Decision, 2026-11-13: retain one React workspace and adapt Wikigraph's separation between offline map production and interactive graph queries. Preserve the persistent sidebar. Build a bounded challenge dataset first; a full-English build requires separate compute/storage provisioning.

## Data flow

1. Import a named Wikipedia snapshot, record language/date/extraction policy and resolve redirects. Preserve directed links. Keep body-only and rendered-link policies distinct.
2. Store normalized article identities, links, revision history and build metadata in MariaDB. A Wikidata identity table aligns editions; titles alone cannot establish cross-language equivalence.
3. Export a fixed snapshot to offline analytics: directed PageRank for importance; undirected Leiden for communities; ForceAtlas2 for coordinates. Cluster labels require review and should not be inferred as political positions.
4. Render versioned raster and metadata tile pyramids, package as PMTiles, host in object storage with range requests and caching.
5. The planned global renderer uses deck.gl OrthographicView + TileLayer in Cartesian coordinates. A route overlay highlights returned node coordinates. Local neighbourhoods use the current interactive simulation; dragging never recomputes millions of global positions.
6. Route requests use directed bidirectional BFS on forward/reverse adjacency. The current bounded MariaDB path implementation is suitable for a small dataset. At full scale, export a compact CSR graph with the same snapshot/build ID and keep it in a dedicated routing service. Do not claim full-Wikipedia performance for SQL fixture tests.

## MariaDB owns meaningful functionality

- Indexed source/target adjacency supports bounded neighbourhood traversal and live cache observations.
- System-versioned article rows reproduce an imported article as of an actual revision time. The application compares which links appeared/disappeared. Historical routes require a consistent time snapshot of *every* article involved; the current single-article history API does not implement that.
- Transactions keep graph observations internally consistent. Build IDs bind node positions, metrics, edges, title aliases and tiles to the same snapshot.
- A future multilingual RAG track can use native vector search with compatible embeddings to retrieve evidence across editions. This is not implemented and must not be advertised as live.

## What is present vs planned

| Component | Status |
| --- | --- |
| Persistent sidebar, local star map and physics | Implemented |
| Live bounded routes and SQL-backed route adapter | Implemented; SQL runtime unverified |
| Real pageview sizing / loaded-map link sizing | Implemented |
| System-versioned history schema, importer, API and UI | Implemented; SQL runtime unverified |
| Upstream MIT offline scripts | Vendored at a pinned commit; not run |
| Full snapshot import, global PageRank/Leiden/ForceAtlas2 | Pending data and compute |
| PMTiles assets, deck.gl global map, CSR service deployment | Pending |
| Vector RAG and historical shortest paths | Future work |

## Scale and reuse boundaries

The upstream README reports 9 GB raster tiles, 1 GB metadata and a 1.8 GB CSR graph. These are the author's measurements, not ours. Its example GPU allocation is 256 GB RAM, one RTX6000 and a three-hour job limit; it does not establish actual duration or minimal hardware. No multi-gigabyte downloads or paid compute have been started.

The offline code is MIT licensed. Its copyright/license must remain with reused code. The React frontend lives in a different repository whose inspected tree did not contain a license; do not copy that source without establishing permission. Our sidebar/renderer remain independently implemented. Wikipedia data attribution is separate from the software license.

Sources: https://github.com/tfpgh/wikigraph, https://github.com/tfpgh/wikigraph/blob/main/slurm/process_graph.sh, https://deck.gl/docs/api-reference/core/orthographic-view, https://deck.gl/docs/api-reference/geo-layers/tile-layer, https://docs.protomaps.com/pmtiles/.
