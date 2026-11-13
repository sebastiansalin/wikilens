# Shared API contract

All GET endpoints return JSON; errors are {error:string}. See src/types.ts for exact response types.

- GET /api/search?q=apple&lang=en -> {results: SearchHit[]}
- GET /api/article?title=Apple&lang=en -> {article: Article}. Lightweight introduction/metadata preview; no neighbourhood fetch. Accepts a strict QID such as Q89, resolves its language sitelink and verifies the returned concept.
- GET /api/graph?title=Apple&lang=en&direction=both -> GraphData. At most ~60 displayed nodes; counts are observed/capped counts, not fabricated totals. stats completeness indicates continuation. Include mapped QIDs for comparison. Graph directions are actual source→target.
- GET /api/compare?title=Apple&lang=en&languages=en,ru,uk -> Comparison. Resolve corresponding articles through Wikidata sitelinks. Missing edition => null article and graph. Compare full bounded outgoing concept sets, not a random UI sample, exclude root QID. Similarity = 100 * |intersection| / |union|; empty union => null. If sets incomplete, pair complete=false. Use real data only.
- GET /api/health -> {mode:'mariadb'|'wikipedia',database:'connected'|'not-configured'|'unavailable',...}

No credentials in the browser. Parse Wikipedia URLs only for accepted wikipedia.org language hosts. No arbitrary user URL fetches. Respect continuation and API timeouts; cache successful data. Do not cache failures or silently substitute seed data.
