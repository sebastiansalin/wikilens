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
