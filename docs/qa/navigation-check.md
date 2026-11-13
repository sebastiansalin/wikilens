# Back navigation verification

Verified in the local browser preview on 2026-11-13.

- Cosmos: open Black hole, search Apple, Back restores Black hole and its URL, Back returns to the start screen.
- Cosmos: begin again with Apple; Back returns to the start rather than revisiting the previous trail.
- Atlas: Back is visible in the header on the first article and returns to the entry screen.
- Prism: Back is visible in the header on the first article and returns to the entry screen.
- Screenshots were inspected for header placement in all three experiences.
- TypeScript and the production build pass. All 21 backend fixture tests pass; those tests do not substitute for database or UI integration tests.

Implementation retains graph snapshots for at most 12 topics. It cancels pending requests before returning, closes article/comparison panels, and resets the connection filter. The cache is tab-session memory. Zoom/pin positions and browser Back/Forward are not persisted.

Additional improvements after the independent reviews: reduced secondary-edge opacity, an opaque Prism root node, accurate loaded-article captions, and separation of Atlas density controls from the data-source label. These changes have not received an independent numeric rescore. No 9/10 claim is made.

The current local preview uses explicit browser-direct Wikipedia mode. MariaDB and Vercel are still unverified/blocked as documented in the main README.
