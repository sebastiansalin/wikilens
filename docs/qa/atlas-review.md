# Atlas — independent UI/UX review, round 1

Reviewed 2026-11-13. Reviewer: independent Atlas critic.

I can see the actual browser screenshots embedded in the inherited parent conversation. I did not operate a browser or take new screenshots. Scores below assess those captures plus the current source; they are subjective, not evidence of functional tests.

**Verdict: not a 9/10 pass.** The landing has a coherent visual identity. The graph, especially after expansion on a phone, needs substantial readability work.

| Observed flow | Score | Evidence and one concrete improvement |
| --- | ---: | --- |
| Paper landing | 8.5/10 | The serif title, restrained colour and simple search feel deliberate. Several tiny slogans/captions compete beneath the useful content. Remove the drawing caption and bottom slogan; keep a single explanation and larger topic shortcuts. |
| Initial Apple graph, desktop | 7.5/10 | The root is clear, but neighbours use approximately 9px labels and long names leave/truncate inside circles. Increase readable node labels and show fewer initial neighbours, with explicit expansion. |
| Selected Granny Smith article | 7/10 | Image and real excerpt are useful, but the primary Explore/Expand actions fall below the visible drawer in the captured view. Put those actions immediately below the title/description, before the image and excerpt. |
| Expanded 94-article map, desktop | 6.5/10 | Expansion creates a dense central knot; the screenshot no longer supports easy scanning of relationships. Keep root/expanded-node edges visible and reveal secondary crosslinks only on selection, with a user-toggle for all edges. |
| Incoming-only map, desktop | 8/10 | The sparse filtered graph is far more legible, but the footer still says 94 articles while only a small subset is visible. Report the visible count, optionally followed by the total loaded count. |
| Expanded Ink graph, 390×700 | 5/10 | Nodes and labels are cut off on all sides, controls overlay the graph, and many bright crossing edges overwhelm it. Start mobile on a capped local neighbourhood (roughly 12–18 nodes), preserving the full graph behind an explicit “show more” action. |
| Mobile topic drawer | 8/10 | Good hierarchy and a readily visible Compare action. The version switcher stays over the drawer and unrelated header controls remain available. Make the drawer a consistent modal layer, with background controls inert and the comparison switcher beneath the overlay. |
| Language comparison, desktop, earlier capture | 7/10 | The initial heading took excessive height and tiny packed mini-graphs were cut off below the fold. The source now contains a compact article-specific heading and smaller overview nodes, which is the right correction. Capture the final result again before scoring it higher. |

## Highest-priority fixes

1. **Use progressive graph density on mobile.** Merely spreading 94 nodes outside the viewport does not make the experience usable. Default to a clear bounded neighbourhood, show how many nodes are hidden, and allow explicit expansion. Retain larger readable type and a touch-accessible list alternative.
2. **Correct the “Fit map” action.** Current `GraphCanvas.tsx` sets the transform to `{x:0,y:0,k:1}` and clears overrides/pins. That is a reset, not a fit. Compute the bounding box of the current nodes, fit it to the usable viewport, and preserve manual pins. This is source-confirmed, not a browser-tested bug.
3. **Keep article actions in view.** Place Explore/Expand before long content. A user should not have to discover a second scrollbar to continue exploring.

## Additional source-confirmed issues

- Pin/Unpin currently changes only the set of markers. Unpin leaves a dragged position in `overrides`; explicit Pin does not store a position against subsequent layout changes. Make the action control the layout, not just its icon.
- The node-label style is still 9px for ordinary nodes. Collision fixes alone do not solve readability.
- On mobile, SVG `touchAction: none` disables native gestures, while the handler implements one-pointer panning and node dragging, not pinch zoom. A two-finger pinch handler or clear touch zoom affordance would improve the flow.
- The initial comparison capture has honest “sampled” labels. Preserve that honesty when reducing copy; do not turn partial overlap into a definitive agreement score.

## Corrections not yet visually rechecked

The parent subsequently added screen-coordinate collision resolution, corrected incoming/outgoing filtering against the root, reduced article image/excerpt height, removed the square SVG focus outline, and shortened the comparison heading. Those code changes are acknowledged; earlier screenshots cannot verify their final effect. The 390px expanded graph screenshot still shows the mobile density problem after the collision change.

## Unverified flows

Autocomplete keyboard selection; pasted URL normalization in the UI; actual drag/pin/unpin behavior; Fit map; shared-link restoration; missing/error states; reduced motion; Galaxy theme; final comparison result on mobile; final post-fix desktop comparison. No scores assigned to unseen flows.

**Confidence: 95% in the reported visual/source findings.** Sources: inherited browser captures of Atlas landing, graph, article drawer, comparison, expanded/filtered maps and mobile states; current `src/components/GraphCanvas.tsx`, `src/components/Chrome.tsx`, `src/layout.ts`, and `src/variants/atlas/atlas.css`. Scores are the reviewer's design judgment.
