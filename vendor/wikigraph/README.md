# Wikigraph

An interactive map of all 7.2 million English Wikipedia articles and the 221 million links between them, with title search and shortest-path finding.

**[Explore it](https://tobypenner.com/wikigraph/)**

https://github.com/user-attachments/assets/2d4ef5ab-a6e4-45e7-91c8-2175180f1e16

I've always wanted to explore all of Wikipedia at once and I've never found an interactive visualization of the entire thing. One huge difficulty is the scale of the data: a graph that size is basically impossible to load and usably render in a browser. So I decided to do the rendering offline and load raster and metadata tiles like Google Maps.

## Building the map

The input is the full May 2026 English Wikipedia text dump. I use a few regexes on the unparsed XML to extract page names and links from the main body of articles. After parsing, I resolve redirect chains so there are no redirects left in the graph.

To lay out the graph, I use ForceAtlas2 with nodes scaled based on the square root of their PageRank. I use the Leiden algorithm to generate 30 communities which I manually labeled. Nodes are colored by their community. All 3 of these algorithms run with cuGraph's implementation on NVIDIA GPUs; laying out a graph of this scale on CPUs is extremely impractical.

The raw ForceAtlas2 output needs some postprocessing. Disconnected nodes get flung far out of the central mass and need to be clamped much closer. The algorithm doesn't guarantee that nodes don't intersect so I use Jacobi relaxation to iteratively separate the minimal overlap left.

I render the map into tiles with Skia, bucketing nodes into every tile their circle touches. Each tile is encoded as lossless WebP and packed into a 9GB PMTiles archive.

I render a second 1GB PMTiles pyramid of metadata for each raster tile. It holds the titles, degrees, and cluster breakdowns of the nodes inside each tile. This lets the frontend preload everything that's shown on node hover. Clicking a node loads more detailed information about the pages it links to and is linked from.

## Serving it

Search and shortest paths need the real graph, which is way too big to send to the browser. I keep it in memory in a Rust service instead, loaded from a 1.8GB CSR file with both forward and reverse adjacency. This lets me search for shortest paths by running bidirectional BFS. Titles go into a Tantivy index with redirects added as aliases to serve search. This backend runs in a Cloudflare Container.

The PMTiles archives are hosted in Cloudflare R2. A Worker sits in front of them and the backend container, converting individual tile requests from the frontend into range requests on the archive and caching backend search and path requests. The 9GB archive is 20x larger than the limit for Cloudflare to edge-cache a file so latency isn't amazing. I would like to try and split it into 20 smaller files so all the data can be cached.

---

The Deck.gl frontend lives in [tfpgh/website](https://github.com/tfpgh/website).

