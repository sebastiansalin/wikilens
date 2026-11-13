"""Build the node metadata that drives the interactive frontend.

Three artifacts land in output/:

1. node_meta.pmtiles — tile pyramid. Each (z, x, y) tile holds a gzipped JSON
   array of the nodes whose radius reaches NODE_META_MIN_PX at that zoom and
   whose center falls in the tile (so exactly one entry per node per zoom). Each
   entry is self-contained so the frontend can summarize a node on hover.

   Tile entry shape (keys short; coords rounded to COORD_DECIMALS):
       {
         "id": 12345, "t": "United States",
         "x": 32100.5, "y": 18000.2, "r": 40.0,
         "cl": 7, "pr": 1,
         "no": 1503, "ni": 251032,      # true out/in degree
         "ob": [[cl, count], ...],      # true outlinks grouped by cluster
         "ib": [[cl, count], ...]       # true inlinks grouped by cluster
       }

2. pages.pmtiles — one entry per page, addressed by mapping the dense page id
   into a (z, x, y) slot (tileid = base(Z) + id at the smallest zoom that holds
   every page). Carries the page plus its capped adjacency, with neighbor id and
   title included so the frontend can render a link panel without a tile lookup.

   Page entry shape:
       {
         "id": 12345, "t": "United States",
         "x": 32100.5, "y": 18000.2, "r": 40.0,
         "cl": 7, "pr": 1,
         "no": 1503, "ni": 251032,
         "ob": [[cl, count], ...],
         "ib": [[cl, count], ...],
         "out": [[id, t, x, y, r, cl], ...],
         "in":  [[id, t, x, y, r, cl], ...]
       }

3. meta.json — overarching stats: total pages, total links, and the cluster
   table (id, color, count, name, cx, cy). name is seeded with the cluster's
   highest-pagerank title; cx/cy are the radius-weighted centroid for the label.
"""

import gzip
import json
import math
import os
from pathlib import Path

import polars as pl
from joblib import Parallel, delayed
from loguru import logger
from pmtiles.tile import Compression, TileType, tileid_to_zxy
from tqdm import tqdm

from offline.tiles.common import (
    TILE_SIZE,
    WORLD_EXTENT,
    compute_max_zoom,
    write_pmtiles,
)
from offline.tiles.palette import compute_palette

NODES_INPUT_PATH = Path("intermediates/enriched_nodes.parquet")
EDGES_INPUT_PATH = Path("intermediates/extracted_edges.parquet")

META_TILES_OUTPUT_PATH = Path("output/node_meta.pmtiles")
PAGES_OUTPUT_PATH = Path("output/pages.pmtiles")
META_JSON_OUTPUT_PATH = Path("output/meta.json")

# A node gets metadata once its radius reaches this many px at a zoom.
# radius_px = radius * TILE_SIZE * 2^z / WORLD_EXTENT.
NODE_META_MIN_PX = 5.0

# Cap on neighbors kept per node (by neighbor pagerank); true totals stay in
# no/ni so the frontend can show "+N more".
NEIGHBOR_CAP = 100

# JSON coord rounding; 0.01 world units is sub-pixel even at max zoom.
COORD_DECIMALS = 2

# Rows per parallel-encode task — chunked so loky workers don't starve on IPC.
ENCODE_CHUNK_ROWS = 10_000


def build_records(nodes: pl.DataFrame, edges: pl.DataFrame) -> pl.DataFrame:
    """Assemble one self-contained metadata record per node.

    Columns: id, t, x, y, radius, cl, pr (pagerank rank), no/ni (out/in degree),
    ob/ib (link counts by neighbor cluster), out/inn (top-NEIGHBOR_CAP neighbor
    structs: nid, nt, nx, ny, nr, ncl).
    """
    attrs = nodes.select(
        "id",
        "title",
        pl.col("x").cast(pl.Float64).round(COORD_DECIMALS),
        pl.col("y").cast(pl.Float64).round(COORD_DECIMALS),
        pl.col("radius").cast(pl.Float64).round(COORD_DECIMALS),
        pl.col("partition"),
        pl.col("pagerank"),
        pl.col("pagerank")
        .rank(method="ordinal", descending=True)
        .cast(pl.Int64)
        .alias("pr"),
    )

    # Neighbor attributes, keyed per direction. id is aliased twice (join key +
    # nid); npr ranks the top-K and is dropped from the emitted struct.
    def neighbor(join_col: str) -> pl.DataFrame:
        return attrs.select(
            pl.col("id").alias(join_col),
            pl.col("id").alias("nid"),
            pl.col("title").alias("nt"),
            pl.col("x").alias("nx"),
            pl.col("y").alias("ny"),
            pl.col("radius").alias("nr"),
            pl.col("partition").alias("ncl"),
            pl.col("pagerank").alias("npr"),
        )

    nb_struct = pl.struct("nid", "nt", "nx", "ny", "nr", "ncl")

    # Outgoing: per src, top-K dst by pagerank + true out-degree (no) + full
    # per-cluster breakdown (ob, over every edge, not just the capped sample).
    out_adj = (
        edges.join(neighbor("dst"), on="dst", how="inner")
        .group_by("src")
        .agg(
            pl.len().alias("no"),
            pl.col("ncl").value_counts(sort=True).alias("ob"),
            nb_struct.top_k_by("npr", NEIGHBOR_CAP).alias("out"),
        )
        .rename({"src": "id"})
    )

    # Incoming: per dst, top-K src by pagerank + true in-degree (ni) + ib.
    in_adj = (
        edges.join(neighbor("src"), on="src", how="inner")
        .group_by("dst")
        .agg(
            pl.len().alias("ni"),
            pl.col("ncl").value_counts(sort=True).alias("ib"),
            nb_struct.top_k_by("npr", NEIGHBOR_CAP).alias("inn"),
        )
        .rename({"dst": "id"})
    )

    return (
        attrs.select(
            "id",
            pl.col("title").alias("t"),
            "x",
            "y",
            "radius",
            pl.col("partition").alias("cl"),
            "pr",
        )
        .join(out_adj, on="id", how="left")
        .join(in_adj, on="id", how="left")
        .with_columns(
            pl.col("no").fill_null(0),
            pl.col("ni").fill_null(0),
        )
    )


def bucket_meta_tiles(records: pl.DataFrame, z: int) -> pl.DataFrame:
    """Filter to threshold-passing nodes at zoom z and group by tile (by center,
    so each node lands in one tile). Returns one row per tile: (tx, ty, recs)."""
    ppwu = TILE_SIZE * (2**z) / WORLD_EXTENT
    visible = records.filter(pl.col("radius") * ppwu >= NODE_META_MIN_PX)
    if visible.is_empty():
        # 0-row frame. (Don't select() only literals onto an empty frame — that
        # broadcasts them into a phantom 1-row frame.)
        return pl.DataFrame(
            schema={"tx": pl.Int32, "ty": pl.Int32, "recs": pl.List(pl.Int64)}
        )

    tile_w = WORLD_EXTENT / (2**z)
    n_axis = 2**z

    rec = pl.struct(
        "id", "t", "x", "y", "radius", "cl", "pr", "no", "ni", "ob", "ib"
    ).alias("rec")
    return (
        visible.with_columns(
            ((pl.col("x") + WORLD_EXTENT / 2) / tile_w)
            .floor()
            .cast(pl.Int32)
            .alias("tx"),
            ((pl.col("y") + WORLD_EXTENT / 2) / tile_w)
            .floor()
            .cast(pl.Int32)
            .alias("ty"),
        )
        .filter(
            (pl.col("tx") >= 0)
            & (pl.col("tx") < n_axis)
            & (pl.col("ty") >= 0)
            & (pl.col("ty") < n_axis)
        )
        .with_columns(rec)
        .group_by(["tx", "ty"], maintain_order=False)
        .agg(pl.col("rec").alias("recs"))
    )


def encode_tile(tx: int, ty: int, recs: list[dict]) -> tuple[int, int, bytes]:
    """Reshape a tile's node records into compact JSON and gzip them."""
    entries = []
    for rec in recs:
        ob = [[c["ncl"], c["count"]] for c in (rec["ob"] or [])]
        ib = [[c["ncl"], c["count"]] for c in (rec["ib"] or [])]
        entries.append(
            {
                "id": rec["id"],
                "t": rec["t"],
                "x": rec["x"],
                "y": rec["y"],
                "r": rec["radius"],
                "cl": rec["cl"],
                "pr": rec["pr"],
                "no": rec["no"],
                "ni": rec["ni"],
                "ob": ob,
                "ib": ib,
            }
        )
    data = json.dumps(entries, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )
    return tx, ty, gzip.compress(data, compresslevel=6)


def encode_tile_chunk(chunk: pl.DataFrame) -> list[tuple[int, int, bytes]]:
    """Encode a slice of tiles in one worker task (chunked to amortize IPC)."""
    return [encode_tile(tx, ty, recs) for tx, ty, recs in chunk.iter_rows()]


def slice_for_parallelism(df: pl.DataFrame) -> list[pl.DataFrame]:
    """Split a frame into ~cores×4 chunks (capped at ENCODE_CHUNK_ROWS rows) so
    workers stay fed on small levels and per-task memory is bounded on big ones."""
    n = len(df)
    target = max(1, (os.cpu_count() or 1) * 4)
    size = max(1, min(ENCODE_CHUNK_ROWS, math.ceil(n / target)))
    return list(df.iter_slices(size))


def build_layer(records: pl.DataFrame, z: int) -> dict[tuple[int, int], bytes]:
    """Bucket and encode every metadata tile at zoom z (chunked across cores)."""
    bucketed = bucket_meta_tiles(records, z)
    n_tiles = len(bucketed)
    if n_tiles == 0:
        logger.info(f"z={z}: no nodes above {NODE_META_MIN_PX}px, skipping")
        return {}

    chunks = slice_for_parallelism(bucketed)
    layer: dict[tuple[int, int], bytes] = {}
    results = Parallel(n_jobs=-1, return_as="generator", backend="loky")(
        delayed(encode_tile_chunk)(chunk) for chunk in chunks
    )
    for batch in tqdm(  # pyright: ignore[reportGeneralTypeIssues]
        results, total=len(chunks), desc=f"Encoding z={z}", unit=" chunks"
    ):
        for tx, ty, data in batch:  # pyright: ignore[reportOptionalIterable]
            layer[(tx, ty)] = data

    total_bytes = sum(len(b) for b in layer.values())
    logger.info(
        f"z={z}: {n_tiles:,} tiles, {total_bytes / 1e6:.1f} MB gzipped "
        f"(avg {total_bytes / n_tiles / 1024:.1f} KB/tile)"
    )
    return layer


def encode_page_chunk(chunk: pl.DataFrame, base: int) -> list[tuple[int, int, bytes]]:
    """Encode a slice of pages; page id -> (z,x,y) slot via tileid = base + id."""
    rows: list[tuple[int, int, bytes]] = []
    for rid, t, x, y, r, cl, pr, no, ni, ob, inb, out, inn in chunk.iter_rows():
        # tx/ty = PMTiles slot for the id; x/y/r = the node's own world geometry.
        _, tx, ty = tileid_to_zxy(base + rid)
        entry = {
            "id": rid,
            "t": t,
            "x": x,
            "y": y,
            "r": r,
            "cl": cl,
            "pr": pr,
            "no": no,
            "ni": ni,
            "ob": [[c["ncl"], c["count"]] for c in (ob or [])],
            "ib": [[c["ncl"], c["count"]] for c in (inb or [])],
            "out": [
                [n["nid"], n["nt"], n["nx"], n["ny"], n["nr"], n["ncl"]]
                for n in (out or [])
            ],
            "in": [
                [n["nid"], n["nt"], n["nx"], n["ny"], n["nr"], n["ncl"]]
                for n in (inn or [])
            ],
        }
        data = json.dumps(entry, separators=(",", ":"), ensure_ascii=False).encode(
            "utf-8"
        )
        rows.append((tx, ty, gzip.compress(data, compresslevel=6)))
    return rows


def build_page_archive(
    records: pl.DataFrame,
) -> tuple[dict[int, dict[tuple[int, int], bytes]], int]:
    """Pack one JSON entry per page into a single-zoom PMTiles pyramid.

    Smallest zoom Z whose grid holds every page; pages written in id order so
    tileids stay ascending.
    """
    n = len(records)
    z = max(1, math.ceil(math.log2(n) / 2))  # 4^z >= n
    base = (4**z - 1) // 3  # first tileid at zoom z
    logger.info(
        f"Packing {n:,} pages at z={z} ({2**z:,} per side, base tileid {base:,})"
    )

    sel = records.sort("id").select(
        "id", "t", "x", "y", "radius", "cl", "pr", "no", "ni", "ob", "ib", "out", "inn"
    )
    chunks = slice_for_parallelism(sel)
    layer: dict[tuple[int, int], bytes] = {}
    results = Parallel(n_jobs=-1, return_as="generator", backend="loky")(
        delayed(encode_page_chunk)(chunk, base) for chunk in chunks
    )
    for batch in tqdm(  # pyright: ignore[reportGeneralTypeIssues]
        results, total=len(chunks), desc="Encoding pages", unit=" chunks"
    ):
        for x, y, data in batch:  # pyright: ignore[reportOptionalIterable]
            layer[(x, y)] = data

    total_bytes = sum(len(b) for b in layer.values())
    logger.info(f"Page archive: {n:,} pages, {total_bytes / 1e6:.1f} MB gzipped")

    pyramid: dict[int, dict[tuple[int, int], bytes]] = {zz: {} for zz in range(z + 1)}
    pyramid[z] = layer
    return pyramid, z


def build_meta_json(
    nodes: pl.DataFrame, edges: pl.DataFrame, palette: pl.DataFrame
) -> dict:
    """Assemble meta.json: totals + the cluster table.

    name = the cluster's highest-pagerank title. cx/cy = radius-weighted centroid
    (radius, not area, so a mega-hub doesn't yank the label to the edge).
    """
    counts = nodes.group_by("partition").agg(pl.len().alias("count"))
    names = (
        nodes.sort("pagerank", descending=True)
        .group_by("partition", maintain_order=True)
        .agg(pl.col("title").first().alias("name"))
    )

    # x/y are f32 (cuGraph); cast to f64 before the weighted sum so the centroid
    # and its round() don't pick up float32 noise.
    w = pl.col("radius").cast(pl.Float64)
    centroids = nodes.group_by("partition").agg(
        ((pl.col("x").cast(pl.Float64) * w).sum() / w.sum())
        .round(COORD_DECIMALS)
        .alias("cx"),
        ((pl.col("y").cast(pl.Float64) * w).sum() / w.sum())
        .round(COORD_DECIMALS)
        .alias("cy"),
    )

    clusters = (
        counts.join(names, on="partition", how="inner")
        .join(centroids, on="partition", how="inner")
        .join(palette, on="partition", how="inner")
        .sort("count", descending=True)
    )

    cluster_list = [
        {
            "id": int(row["partition"]),
            "color": [int(row["r"]), int(row["g"]), int(row["b"])],
            "count": int(row["count"]),
            "name": row["name"],
            "cx": row["cx"],
            "cy": row["cy"],
        }
        for row in clusters.iter_rows(named=True)
    ]

    return {
        "total_pages": len(nodes),
        "total_links": len(edges),
        "clusters": cluster_list,
    }


def compute_meta_max_zoom(radii: pl.Series, raster_max_z: int) -> int:
    """Highest zoom worth generating metadata for.

    Once even the smallest node clears NODE_META_MIN_PX, every node has metadata
    and finer zooms are pure redundancy — stop there and let the frontend
    overzoom. Capped at raster_max_z.
    """
    r_min = float(radii.min())  # pyright: ignore[reportArgumentType]
    ppwu_needed = NODE_META_MIN_PX / r_min
    z_full = max(1, math.ceil(math.log2(ppwu_needed * WORLD_EXTENT / TILE_SIZE)))
    meta_z = min(z_full, raster_max_z)
    logger.info(
        f"min radius = {r_min:.4f} → all nodes have metadata by z={z_full}; "
        f"generating metadata to z={meta_z} (raster max_z={raster_max_z})"
    )
    return meta_z


if __name__ == "__main__":
    logger.info("Building node metadata → output/")

    nodes = pl.read_parquet(NODES_INPUT_PATH)
    logger.info(f"Loaded {len(nodes):,} nodes")

    edges = pl.read_parquet(EDGES_INPUT_PATH)
    logger.info(f"Loaded {len(edges):,} edges")

    palette = compute_palette(nodes["partition"])

    max_z = compute_max_zoom(nodes["radius"])
    meta_max_z = compute_meta_max_zoom(nodes["radius"], max_z)

    records = build_records(nodes, edges)
    logger.success(f"Built {len(records):,} node records (top-{NEIGHBOR_CAP} in/out)")

    # 1. Tile pyramid (up to the zoom where every node has metadata).
    pyramid: dict[int, dict[tuple[int, int], bytes]] = {}
    for z in range(meta_max_z + 1):
        pyramid[z] = build_layer(records, z)

    total_tiles = sum(len(layer) for layer in pyramid.values())
    total_bytes = sum(sum(len(b) for b in layer.values()) for layer in pyramid.values())
    logger.info(
        f"Metadata pyramid: {total_tiles:,} tiles, {total_bytes / 1e6:.1f} MB gzipped"
    )

    write_pmtiles(
        pyramid,
        meta_max_z,
        META_TILES_OUTPUT_PATH,
        tile_type=TileType.UNKNOWN,
        tile_compression=Compression.GZIP,
    )
    logger.success(f"Wrote metadata pyramid to {META_TILES_OUTPUT_PATH}")

    # 2. Per-page archive.
    page_pyramid, page_z = build_page_archive(records)
    write_pmtiles(
        page_pyramid,
        page_z,
        PAGES_OUTPUT_PATH,
        tile_type=TileType.UNKNOWN,
        tile_compression=Compression.GZIP,
    )
    logger.success(f"Wrote per-page archive to {PAGES_OUTPUT_PATH}")

    # 3. Overarching meta.json.
    meta = build_meta_json(nodes, edges, palette)
    META_JSON_OUTPUT_PATH.write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    logger.success(
        f"Wrote meta.json ({len(meta['clusters']):,} clusters) to "
        f"{META_JSON_OUTPUT_PATH}"
    )

