# Unified WikiLens: independent UI/UX review

Reviewed 2026-11-13. Reviewer: unified_critic.

## Follow-up: independent browser verification after fixes

This follow-up supersedes the initial desktop score below. The initial assessment remains as the record of the previous build.

I opened my own regular Brave tab at `http://127.0.0.1:5173/?title=Talvisota&lang=fi`; I did not operate the parent agent's tabs. Screenshots were captured in the browser tool at the initial settled map, selected Pietari after zooming, and restored Talvisota after Fit. They were displayed in the tool output; this review does not claim that separate screenshot files were saved.

Observed checks:

- Talvisota loaded 49 real articles with 48 in view; pageview coverage and live-Wikipedia mode were visible.
- The idle map reported `data-physics-running=false` before dragging.
- Dragging the central Talvisota star changed its position and several neighbours' positions. Subsequent observation again reported `data-physics-running=false`. For example, Suomen sisällissota changed from `translate(986.70 576.77)` to `translate(991.83 580.96)`. This verifies transmitted movement and settling; it does not constitute a continuous frame-rate measurement.
- Pressing End on Graph spacing changed its accessible value from 1 to 2 and visibly spread the map.
- Keyboard selection of Pietari updated the Selected article sidebar, its facts and article text. Zoom in enlarged the view and retained the selection.
- Explore here opened Pietari; Back to previous topic restored Talvisota. Fit returned the graph to a useful overview. The spacing setting persisted at 2.
- The reviewed frames have solid star cores, fewer decorative elements, and no overlapping visible labels. The selected-neighbour emphasis makes relationships easier to read.

**Focused graph-interaction functionality: 9/10. Updated desktop visual/UX score: 8.5/10.** This is not an all-feature 9/10 pass. Confidence: 95%; source: my own Brave actions, DOM observations and screenshots, with the source checks noted below. Fine-grained animation smoothness was not measured by this reviewer; the parent separately reports quantitative physics regression tests.

Source confirms that partial path wording is now conditional, expansion/comparison are passed the displayed graph context, and mobile CSS retains the language selector. I did not independently rerun complete route/comparison flows or a mobile viewport in this bounded follow-up. The parent's Apple-to-Fruit route check is reported evidence, not my own observation. Unavailable MariaDB does not lower the focused graph-interaction score; database/history flows remain unverified.

Three remaining improvements:

1. **Preserve readable label size after Fit.** At spacing 2, fitting the wider graph makes ordinary labels noticeably tiny. Keep labels within a minimum screen-space size while continuing collision suppression; selected and root titles should stay legible throughout normal zoom ranges.
2. **Finish route-input keyboard behavior.** Source still shows plain input-plus-buttons suggestions without arrow-key active-option/listbox semantics. Add this before calling every keyboard flow complete.
3. **Tighten the sidebar's information density.** Body/helper copy remains small, while unavailable Through time and Stored graph controls occupy substantial vertical space. A compact, clear unavailable state would leave more room for article and comparison results without introducing menus.

## Evidence and scope

Evidence: the parent agent's desktop screenshot of the Apple map, with 48 articles visible, a permanent right sidebar, route form, article facts, language controls, and explicit disconnected MariaDB state. Source reviewed: `src/Explorer.tsx`, `src/explorer.css`, `src/components/ForceGraph.tsx`, and the relevant action handlers in `src/useWikiLens.ts`.

This reviewer did not operate the browser. Drag feel, touch behavior, network latency, completed route states, comparison results, other themes, and mobile layouts have not been independently exercised or captured. Source inspection is identified separately from observed visual evidence. No claim is made that all flows pass.

## Current scores

| Area | Score | Evidence |
| --- | --- | --- |
| Desktop composition | 8/10 | Screenshot: permanent sidebar, spacious map, restrained main palette and clear primary route action. |
| Star-map appearance and readability | 6.5/10 | Screenshot: almost every node resembles a glowing bullseye; labels visibly collide near Smoking (cooking) and Binomial nomenclature. It reads as a small network diagram rather than an expansive stellar map. |
| Sidebar clarity | 7.5/10 | Screenshot: useful sections remain visible, but many labels and helper paragraphs are very small, and technical connection diagnostics consume a whole section. |
| Route form | 7/10 | Screenshot and source: clear endpoints and swap action; completed route accuracy and contextual behavior need fixes below. This is not a runtime score for route search. |
| Physics and navigation | Unrated | Source provides drag, inertia, pinning, zoom and keyboard selection. Actual feel was not tested by this reviewer. |
| Mobile and keyboard flows | Unrated | Source reveals a lost mobile language control; no mobile screenshot or independent interaction test supplied yet. |

**Overall observed desktop experience: 7/10. Not approved against the requested 9/10 threshold.** Confidence: 95% for the screenshot assessment and source findings; no confidence claim for untested interactions.

## Five priority changes

1. **Make stars readable before adding visual effects.** The `.force-circle` CSS overrides the component's `fill="currentColor"`, producing outlined discs around white cores across the whole map. Use small solid cores and subtle glow; reserve rings for the current or selected article. Add screen-space label collision suppression, prioritizing the selected article and route nodes. A busy graph should still leave each visible title readable. Do not fabricate background nodes or category colors to imply data that has not been loaded.

2. **Make every action use the topic the user sees.** A route can replace the displayed root with an arbitrary From article, but `state.runCompare()` still reads the original `graphRef.current.root`; `state.expand()` updates that original graph. Stored neighbourhoods similarly mask expansion changes because `stored` takes precedence. Reproduction from source: open Apple, find Black hole to Physics, then Compare; the handler still requests Apple. Use one explicit displayed graph/topic context for comparison, expansion, language changes, source labels and sharing. Route mode may intentionally retain a separate underlying map, but actions must name their target clearly and visibly update it.

3. **Remove contradictory shortest-path messaging.** Every found result currently says “Shortest route in the searched graph,” even when `complete:false` warns that unseen shorter routes may exist. For incomplete coverage lead with “Route found in sampled links”; only use a shortest-route claim when the returned scope and completeness justify it. Keep the coverage qualification adjacent to the click count. Label the indexed graph or snapshot precisely; do not imply an exhaustive all-Wikipedia search.

4. **Keep essential controls usable at small widths and by keyboard.** The under-800px rule hides the only main Wikipedia-language selector. Retain it in a compact header or another always-visible location. Route suggestions are plain buttons beneath an input without listbox/active-option semantics or arrow-key selection; implement a real accessible combobox. Review the numerous 8–10px helper/control labels at normal laptop and phone dimensions. Confirm no clipping at 390px and 200% browser zoom before rating this flow.

5. **Reduce decorative and diagnostic microcopy.** Remove the vertically wrapping “A LIVING ATLAS” beside the logo and the redundant “ARTICLE → ARTICLE” eyebrow. Keep one concise instruction line. Condense the disconnected-database panel to a clear source/status sentence while preserving honest mode disclosure; show database-dependent controls when they are actionable. This gives route results, article context and language differences more room without introducing menus or popups.

## Required evidence for reassessment

Capture the revised desktop graph; a multi-step route with its scope label; a selected node after dragging and pinning; a successful language comparison; a missing-article or bounded-search failure; Paper and Ink themes; and a narrow mobile layout. Verify that route, comparison and expansion all refer to the displayed topic. A screenshot cannot establish physics quality or backend correctness, so report those interaction checks separately.
