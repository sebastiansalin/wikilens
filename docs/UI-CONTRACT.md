# UI build contract

Three interface agents own src/variants/{atlas,prism,cosmos}/ only; each exports default component from index.tsx taking `{ state: WikiLensState }`, imported from ../../workspace. Import own CSS. Parent owns all shared pieces. Use exact types in src/types.ts, src/workspace.ts.

Shared components in src/components/ (parent implements):
- `GraphCanvas` default from ../../components/GraphCanvas: props `{ graph: GraphData, selected: GraphNode|null, onSelect:(node:GraphNode)=>void, onExplore:(title:string,lang?:Language)=>void, theme:Theme, variant:Variant, direction?:'both'|'outgoing'|'incoming', compact?:boolean }`. Includes zoom, fit, drag/pin, keyboard accessible node buttons and panning. Main graph fills its positioned parent container; container must have concrete height/flex min-height:0.
- `SearchBox` named export from ../../components/Chrome: props `{state, compact?:boolean}`. Real autocomplete, Enter, pasted URLs. Parent handles focus/escape/click outside.
- `ThemeSwitch` named export Chrome: `{state}`. Three themes labelled accessible buttons.
- `LanguageSelect` named Chrome `{state}`. Native language selection.
- `ArticlePanel` named Chrome `{state}`. Selected article title, extract, source link, expand/explore actions and close. Render only when selected.
- `ComparisonPanel` named Chrome `{state, embedded?:boolean}`. Embedded renders comparison result and selectors inline, nonembedded dialog. Root App renders nonembedded compare modal when compareOpen; variant should not duplicate.
- `Brand` named Chrome `{variant?:Variant,onClick?:()=>void}`.
- `ConnectionStatus` named Chrome `{state}`: source/fetched time methodology button.

Root App renders modal comparison, about modal, toast, skip link, variant switcher accessible at bottom. You render main variant's layout, landing or initial graph flow, header search, toolbar, graph, article panel, theme/language controls, helpful empty/loading/error states. Use lucide-react installed. Do not fabricate metrics or create fixture Wikipedia data. Landing may use decorative unnamed nodes, not fabricated article graph. Landing suggested topics actual button calls explore('Apple'), explore('Black hole'), explore('Russo-Ukrainian War'), explore('Internet'), explore('Mycelium'). Root defaults starts no graph (unless URL title). Each version must be visually distinct with consistent simplicity.

CSS root variables defined by parent: --bg,--surface,--surface-raised,--text,--muted,--line,--accent,--accent-soft,--shadow,--serif,--sans. Root `[data-theme='paper'|'ink'|'galaxy']`; body full screen, app min-height100dvh; `.variant-root` available class. Scoped selectors with atlas-/prism-/cosmos- prefixes. No giant generic gradient marketing hero, badges, card grids, jargon. Beautiful graph-centered product with purposeful typography, generous space, microanimations <250ms, reduced-motion CSS. Desktop and 390px mobile. Minimum44px targets. Avoid AI boilerplate copy. Real links and functioning actions only. Accessible headings. no emoji icons.

Atlas: warm paper exploration workbench. Editorial serif title, hairline edges and sage accent, blank white circles and black lines, left quiet vertical exploration history or root detail, graph expansive; floating search.
Prism: research lens, split comparison workspace, rich burgundy or cobalt accent. Default light/ink allowed. Show main graph centrally and compact embedded ComparisonPanel on right when graph present, invoke runCompare when desired. Comparison graphs are handled shared panel. Real metric states only; entry invites two-language discoveries.
Cosmos: immersive night sky/galaxy graph, restrained spectral nodes, cinematic large type, bottom search dock and focused article drawer. Galaxies may be decorative radial mist behind graph, but labels remain crisp. Never perpetual disruptive animation; motion opt-out. All three themes still usable.

Test build via parent after integration. Do not commit. Report intended UI flows and any dependencies.
