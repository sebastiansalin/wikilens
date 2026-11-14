# Understanding captured article changes

The atlas now shows an extractive overview for the selected article and month window: total revisions, busiest month, recurring content-pattern counts, sections with the most patterns, and the latest qualifying content episode. Each evidence card isolates the differing words between two captured alternatives, retaining shared preceding context and links to the original revision diffs. Expanding the card exposes the longer passages. Version A/B are alternative wordings, not necessarily chronological before/after or the current article text.

These summaries run locally and deterministically from the existing monthly aggregates and evidence shards. They make no network calls to an LLM and infer neither editor intent nor which wording is correct. Counts use the same qualification-month window as the index. Missing evidence stays loading/error/unknown. A window with no detected pattern does not establish agreement. Pattern classification remains retrospective and unvalidated.

## Further options

| Option | Benefit | Requirements and limits |
| --- | --- | --- |
| Current extractive overview | Fast, inspectable, no service costs; reveals where and when captured wording recurs | Summarizes detected patterns only; source passages remain Finnish |
| Evidence-grounded language-model explanation | Can explain Finnish wording in English and group related episodes into readable themes | Server-side model integration, translations clearly labeled, every claim tied to revision IDs, cached by article/window/method/model, independent checks for unsupported claims; no credentials in the browser |
| Complete period change log | Explains additions, removals and evolving coverage beyond recurring disputes | Requires additional revision-to-revision comparisons from MariaDB SVT; the current compact evidence export does not contain every change |

A useful next step is an on-demand explanation of selected evidence with citations, followed by a complete change log if broader article evolution is the goal. Do not present the current evidence overview as a complete summary of everything that changed.

## Drawing changes and validation

Timeline scores are supplied separately from graph geometry, avoiding a simulation update for color-only changes. Reciprocal links share one visual line, while the source catalog and article link counts remain intact. The renderer caches DOM-to-node bindings and endpoint radii rather than rebuilding maps and string keys every animation frame. Unfiltered translucent halos replace per-node Gaussian blur. Drag repulsion, pinning, edge size scaling, zoom, and the existing force equations are retained.

On the 64-node Suomen sisällissota view, rendered lines fell from 654 to 517 and node blur filters from 64 to zero. A local 10-run date-label microbenchmark for 284 months measured about 22.1 ms per batch with repeated formatter construction versus 0.3 ms with one shared formatter. This measures label formatting, not overall frame rate; browser FPS was not measured. The existing 160-node drawing bound is unchanged.


## Restoring the original canvas graph

The current atlas graph ports the balls, lines, dotted backdrop, and magnetic forces from `feature/conflict-explorer` at `62db465ff78447a6c6b60b14caed6264787ea0e9`. The live Wikipedia explorer retains the existing shared SVG graph.

The restored force model uses softened inverse-square repulsion (2100 / (distance squared + 180), capped at 3) and a 20-pixel collision cushion. Following the request for a less dense, calmer graph, springs now prefer 230 pixels (previously 155), center attraction is 0.00014 (previously 0.00045), velocity retention is 0.74 (previously 0.86), and spiral seeding uses 84 rather than 48 pixels per square-root step. Spring forces are also normalized by the square root of the larger endpoint degree, preventing a dense hub from pulling its neighbors into a tight cluster. The movement cap remains 7 pixels. A temperature multiplier cools by 0.965 per fixed step outside dragging; this deliberately freezes a readable layout rather than continuing to seek equilibrium indefinitely. Dragging reheats the neighborhood response. Unlike the original per-display-frame loop, the port advances at a fixed 60 Hz and interpolates drawing between steps. Reciprocal links are resolved once. Article-size radii and the smaller-endpoint line width remain intact; current index calculations and observation windows are unchanged.

Node shading, halos, and labels are rendered into bounded sprite caches, then composited onto one canvas. Lines are batched by width and selection. Continuous rim flames retain the source contours, with reusable fire canvases updated at 30 Hz. Flames use the current high-index band (60+), rather than transferring an incompatible cutoff from the older raw-intensity metric. Labels retain a readable screen font size when zoomed out. New score colors use the original green/amber/red palette on the current 0–100 scale. Null scores remain gray.

The animation loop stops once forces settle, pauses in hidden documents, honors reduced motion, and resumes for interactions. Dragging still displaces neighboring balls. Pinning, zoom, panning, tooltips, keyboard article selection, filtering, timeline playback, and the newer article summaries remain. Body and label caches are capped at 320 entries each; device pixel ratio is capped at 2.

Validation: 101 Node tests passed, one database integration test skipped; TypeScript and production build passed. Trajectory tests compare 60 Hz and 120 Hz display timing, reciprocal spring deduplication, drag repulsion, pinning, restored coordinates after filtering, and finite positions after long frame gaps, and settling of a 160-node scene within three seconds with no subsequent movement until interaction. A local 500-step physics-only benchmark with 160 nodes and 3,160 links averaged 0.260 ms per step, with a 0.637 ms 95th percentile. This is not an overall browser frame-rate measurement. The earlier SVG measurements above document the previous renderer.
