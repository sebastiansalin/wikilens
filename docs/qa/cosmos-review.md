# Cosmos independent UI/UX review

Reviewed 2026-11-13. **Not a 9/10 pass.**

The directly visible evidence is the inherited desktop screenshot of the Black hole graph at 1280 × 720, including the newly added Back button, 36-of-49 density control, search dock, source status and graph controls. The inherited browser interaction also records Apple returning to Black hole through Back, with the URL restored. I inspected the current Cosmos CSS and shared GraphCanvas source. I did not independently operate a browser, measure animation performance, or see a fresh mobile screenshot.

| Observed page or flow | Score | Finding | One concrete improvement |
| --- | --- | --- | --- |
| Desktop graph appearance | 8/10 | The restrained dark background, fine colored outlines and serif topic heading make a coherent visual identity. It avoids a generic card dashboard. The many crossing lines still turn the center into a mesh rather than a clearly readable network. | Show root connections at normal emphasis and make cross-links between neighbors much fainter until a node is focused. |
| Desktop article labels and graph reading | 7/10 | Thirty-six circles fit without major overlap, but many labels require effort: they are 9 px, wrap over several lines and sometimes truncate the distinguishing words. The graph occupies a compact island while substantial horizontal room remains unused. | Increase default label size and spacing; present a full title clearly on focus, and display fewer nodes before asking the user to expand. |
| Back navigation | 8.5/10 | The new labeled Back button is easy to spot in the upper-left corner. The recorded Apple → Black hole return restores the topic and URL. Its destination is only exposed through the accessible label/title, so a long trail is difficult to predict visually. | Show a concise destination in a tooltip or temporary focus hint, such as “Back to Black hole,” while retaining the short visible button. |
| Search and graph controls, resting state | 8/10 | The bottom search dock is distinct and the primary action is clear. Controls are spread across both lower corners and the upper-right corner, making the graph feel more like a collection of tools than one focused exploration surface. The loaded-count caption now correctly distinguishes 49 loaded from 36 shown. | Combine display density and connection direction into one compact bottom-left group, and remove the duplicate loaded-count caption. |
| Visual explanation of the graph | 7/10 | Node colors suggest meaningful clusters or categories, but source inspection shows they are assigned by array index from a six-color palette. There is no visible explanation of color. This creates an attractive but misleading analytical cue. | Use colors for a real, explained property such as incoming/outgoing/both, or use one restrained node color and reserve accent color for selection. |

## Priorities

1. **Make the network readable before adding polish.** Reduce secondary-edge emphasis, enlarge labels and provide the full title on hover and keyboard focus. In the observed screen, the narrow lines and tiny type are the main reason it does not reach 9/10.
2. **Give color a meaning.** A galaxy can be atmospheric without suggesting nonexistent topic clusters. A small direction legend would make the current link/backlink feature easier to understand.
3. **Consolidate the lower-left controls.** The density panel, direction selector, loaded count, source caption and experience switcher currently compete within the same general area. Keep density plus direction together; retain source status near the search dock.

## Verification boundaries

- No independent score is assigned to the landing page, autocomplete, article inspector, expansion, pinning, zoom/Fit results, comparison, language changes, alternate themes, errors, missing editions or mobile behavior because those rendered states are not directly visible to this review.
- The inherited browser trace demonstrates one Back transition between completed topics. Returning to the start, cancelling an in-flight load and Back after expansion remain unverified here.
- Reduced-motion CSS and keyboard handlers exist in source; this is not evidence that every interaction passes accessibility or motion testing.
- Screenshot evidence is in the parent conversation. This critic did not create screenshot files.

Confidence: **95%** in the visual defects and their source correspondence. Sources: inherited Black hole desktop capture and Back interaction output; `src/components/GraphCanvas.tsx`; `src/variants/cosmos/cosmos.css`. Scores are subjective design judgments, not user-study measurements.
