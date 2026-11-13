"""Finalize node positions before the rest of the pipeline consumes them.

Three steps, in order:

1. Clamp outliers — disconnected strays that ForceAtlas2 flings to the world
   edge otherwise dictate the normalization scale and crush the real content
   inward. Pull every node outside the central CLAMP_QUANTILE box radially onto
   the box edge. Cluster ids are kept (the strays belong to no real cluster).
2. Remove overlaps — push overlapping circles apart (Jacobi relaxation).
3. Re-fit the world — recenter and scale x/y/radius to fill WORLD_EXTENT,
   measuring by each node's *edge* (center + radius) so none is cropped. Done
   last so the final coords fit (uniform scaling can't add overlaps).
"""

from pathlib import Path

import numpy as np
import polars as pl
from loguru import logger

INPUT_PATH = Path("intermediates/initial_enriched_nodes.parquet")
OUTPUT_PATH = Path("intermediates/enriched_nodes.parquet")

# Canonical world size (redefined here since this runs as a plain script).
WORLD_EXTENT = 2**16

DAMPING = 2.0

SEPARATION_PADDING = 0.05

MAX_ITERS = 500

# Central per-axis quantile box all nodes are clamped into. Pulls in the far
# strays plus the outermost ~(1 - CLAMP_QUANTILE) of real nodes per tail.
CLAMP_QUANTILE = 0.99999

# Fraction of the half-world left free beyond the outermost node's edge.
WORLD_MARGIN = 0.01


def candidate_pairs(
    x: np.ndarray, y: np.ndarray, r: np.ndarray, cell: float
) -> tuple[np.ndarray, np.ndarray]:
    """Unique (i < j) node pairs whose bounding boxes share a grid cell.

    A superset of overlapping pairs; the caller applies the exact circle test.
    """
    n = len(x)
    base = pl.DataFrame(
        {"i": np.arange(n, dtype=np.int64), "x": x, "y": y, "r": r}
    ).with_columns(
        ((pl.col("x") - pl.col("r")) / cell).floor().cast(pl.Int32).alias("cx_min"),
        ((pl.col("x") + pl.col("r")) / cell).floor().cast(pl.Int32).alias("cx_max"),
        ((pl.col("y") - pl.col("r")) / cell).floor().cast(pl.Int32).alias("cy_min"),
        ((pl.col("y") + pl.col("r")) / cell).floor().cast(pl.Int32).alias("cy_max"),
    )
    exploded = (
        base.with_columns(
            pl.int_ranges(pl.col("cx_min"), pl.col("cx_max") + 1).alias("cx")
        )
        .explode("cx")
        .with_columns(pl.int_ranges(pl.col("cy_min"), pl.col("cy_max") + 1).alias("cy"))
        .explode("cy")
        .select(["i", "cx", "cy"])
    )
    pairs = (
        exploded.join(exploded, on=["cx", "cy"], suffix="_j")
        .filter(pl.col("i") < pl.col("i_j"))
        .select("i", pl.col("i_j").alias("j"))
        .unique()
    )
    return pairs["i"].to_numpy(), pairs["j"].to_numpy()


def relax(x: np.ndarray, y: np.ndarray, r: np.ndarray) -> None:
    """Push overlapping nodes apart in place until none overlap."""
    n = len(x)

    # Size the grid to padded radii so no near pair is missed.
    r_pad = r * (1.0 + SEPARATION_PADDING)
    # Small enough most nodes sit alone, floored so the biggest spans ~64 cells.
    cell = max(2.0 * float(np.median(r_pad)), float(r_pad.max()) / 32.0)
    logger.info(
        f"{n:,} nodes, grid cell = {cell:.3f} "
        f"(r median={np.median(r):.3f}, max={r.max():.3f}), "
        f"damping={DAMPING}, padding={SEPARATION_PADDING:.0%}"
    )

    n_overlap = 0
    for it in range(1, MAX_ITERS + 1):
        i, j = candidate_pairs(x, y, r_pad, cell)
        dx = x[i] - x[j]
        dy = y[i] - y[j]
        d = np.hypot(dx, dy)

        # True overlap drives the stop; padded penetration drives the push.
        true_pen = (r[i] + r[j]) - d
        n_overlap = int((true_pen > 0).sum())
        if n_overlap == 0:
            logger.success(f"iter {it}: no overlaps remain")
            return
        logger.info(
            f"iter {it}: {n_overlap:,} overlaps, max pen = {true_pen.max():.4f}"
        )

        pad_pen = (r_pad[i] + r_pad[j]) - d
        active = pad_pen > 0
        i, j = i[active], j[active]
        dx, dy, d, pad_pen = dx[active], dy[active], d[active], pad_pen[active]

        # Push direction j->i. Coincident centers (d≈0) have none — give them a
        # random direction so relaxation stays robust instead of NaNing.
        coincident = d < 1e-9
        if coincident.any():
            theta = np.random.default_rng(it).uniform(
                0, 2 * np.pi, int(coincident.sum())
            )
            dx[coincident], dy[coincident] = np.cos(theta), np.sin(theta)
            d[coincident] = 1.0
        ux, uy = dx / d, dy / d

        # Split the push inversely with radius (smaller node moves more); weights
        # sum to 1, so damping 1 would separate the pair in one step.
        rs = r_pad[i] + r_pad[j]
        step = DAMPING * pad_pen
        mi = step * (r_pad[j] / rs)
        mj = step * (r_pad[i] / rs)

        # Jacobi update: accumulate every pair's contribution per node, apply once.
        x += np.bincount(i, mi * ux, n) - np.bincount(j, mj * ux, n)
        y += np.bincount(i, mi * uy, n) - np.bincount(j, mj * uy, n)

    logger.warning(f"Hit MAX_ITERS={MAX_ITERS} with {n_overlap:,} overlaps remaining")


def clamp_to_box(x: np.ndarray, y: np.ndarray) -> None:
    """Pull every out-of-bounds node radially inward to the CLAMP_QUANTILE box.

    Each node is scaled by t = min(1, bound_x/|x|, bound_y/|y|), landing it on
    the box edge at its own angle (vs. clamping axes independently, which piles
    diagonal outliers into the corners). In-bounds nodes get t = 1.
    """
    p = CLAMP_QUANTILE
    x_lo, x_hi = np.quantile(x, [1.0 - p, p])
    y_lo, y_hi = np.quantile(y, [1.0 - p, p])

    # Box edge on each node's side; a zero coordinate imposes no constraint (t=inf).
    bx = np.where(x >= 0, x_hi, x_lo)
    by = np.where(y >= 0, y_hi, y_lo)
    with np.errstate(divide="ignore", invalid="ignore"):
        tx = np.where(x != 0, bx / x, np.inf)
        ty = np.where(y != 0, by / y, np.inf)
    t = np.minimum(1.0, np.minimum(tx, ty))

    n_clamped = int((t < 1.0).sum())
    x *= t
    y *= t
    logger.info(
        f"Clamped {n_clamped:,} nodes (p{CLAMP_QUANTILE}) radially into "
        f"x∈[{x_lo:.0f}, {x_hi:.0f}], y∈[{y_lo:.0f}, {y_hi:.0f}]"
    )


def refit_world(x: np.ndarray, y: np.ndarray, r: np.ndarray) -> None:
    """Recenter and scale x/y/radius to fill the world, in place.

    Scales by the outermost node's *edge* (center + radius) so no circle is
    cropped, leaving a WORLD_MARGIN buffer. Scaling all three can't add overlaps.
    """
    cx, cy = float(np.median(x)), float(np.median(y))
    x -= cx
    y -= cy
    edge = max(float(np.max(np.abs(x) + r)), float(np.max(np.abs(y) + r)))
    scale = (WORLD_EXTENT / 2) * (1.0 - WORLD_MARGIN) / edge
    x *= scale
    y *= scale
    r *= scale
    logger.info(
        f"Re-fit: centered at ({cx:.1f}, {cy:.1f}), scaled by {scale:.4f} "
        f"(edge extent {edge:.1f} → {edge * scale:.1f} of {WORLD_EXTENT // 2})"
    )


def remove_overlaps(nodes: pl.DataFrame) -> pl.DataFrame:
    """Clamp outliers, push circles apart, re-fit the world (see module doc).

    Works in float64, then verifies overlap-free after rounding to the stored
    dtype (f32 rounding near the edge can rival the smallest gaps).
    """
    x = nodes["x"].cast(pl.Float64).to_numpy().copy()
    y = nodes["y"].cast(pl.Float64).to_numpy().copy()
    r = nodes["radius"].cast(pl.Float64).to_numpy().copy()

    # Clamp outliers in before relaxing so they stop dictating the world scale.
    clamp_to_box(x, y)

    # Baseline after relocation, so the displacement log reflects relax alone.
    x0, y0 = x.copy(), y.copy()
    relax(x, y, r)
    disp = np.hypot(x - x0, y - y0)
    logger.info(
        f"Relax displacement (world units): median={np.median(disp):.4f}, "
        f"p99={np.quantile(disp, 0.99):.4f}, max={disp.max():.4f}"
    )

    # Re-fit last so the final coordinates are guaranteed to fit the world.
    refit_world(x, y, r)

    # Round-trip through the stored dtypes and confirm the written bytes are clean.
    dtype = nodes["x"].dtype
    x_out = pl.Series("x", x).cast(dtype)
    y_out = pl.Series("y", y).cast(dtype)
    r_out = pl.Series("radius", r).cast(nodes["radius"].dtype)
    xf = x_out.cast(pl.Float64).to_numpy()
    yf = y_out.cast(pl.Float64).to_numpy()
    rf = r_out.cast(pl.Float64).to_numpy()
    r_pad = rf * (1.0 + SEPARATION_PADDING)
    cell = max(2.0 * float(np.median(r_pad)), float(r_pad.max()) / 32.0)
    vi, vj = candidate_pairs(xf, yf, r_pad, cell)
    residual = int(
        ((rf[vi] + rf[vj]) - np.hypot(xf[vi] - xf[vj], yf[vi] - yf[vj]) > 0).sum()
    )
    if residual:
        logger.warning(f"{residual:,} overlaps remain after {dtype} rounding")
    else:
        logger.success(f"Zero overlaps in the final {dtype} coordinates")

    return nodes.with_columns(x_out, y_out, r_out)


if __name__ == "__main__":
    if OUTPUT_PATH.exists():
        logger.info(f"{OUTPUT_PATH} already exists, skipping")
    else:
        logger.info(f"Finalizing layout from {INPUT_PATH}")
        nodes = pl.read_parquet(INPUT_PATH)
        nodes = remove_overlaps(nodes)
        nodes.write_parquet(OUTPUT_PATH, compression="zstd")
        logger.success(f"Wrote {len(nodes):,} finalized nodes to {OUTPUT_PATH}")

