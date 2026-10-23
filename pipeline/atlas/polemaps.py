"""Topographic pole basemaps: styles A (glow), B (bands), D (hotspots) x themes dark / moon grey."""

import io
import json
import math
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import shapely  # noqa: E402
from matplotlib.axes import Axes  # noqa: E402
from matplotlib.colors import BoundaryNorm, LinearSegmentedColormap, ListedColormap  # noqa: E402
from PIL import Image  # noqa: E402

from atlas.constants import (  # noqa: E402
    BAND_LEVELS,
    CAP_EDGE_LAT_DEG,
    FALSE_EASTING,
    FALSE_NORTHING,
    HEIGHT_PX,
    HOTSPOT_PCT,
    MAP_PX,
    SMOOTH_KM,
    SOUTH_MAP_BOX,
    TOPO_INDEX_M,
    TOPO_STEP_M,
)
from atlas.crs import Pole, cap_rho_m, lonlat_to_ps  # noqa: E402
from atlas.export_web import PoleLayers  # noqa: E402
from atlas.regions import Region, region_centroid  # noqa: E402
from atlas.tiles import Grid, cap_grid  # noqa: E402

matplotlib.rcParams["contour.negative_linestyle"] = "solid"

Style = Literal["a", "b", "d"]
ThemeId = Literal["dark", "moon"]
Box = tuple[int, int, int, int]
STYLES: tuple[Style, ...] = ("a", "b", "d")
THEME_IDS: tuple[ThemeId, ...] = ("dark", "moon")
WEBP_QUALITY = 90


@dataclass(frozen=True)
class Theme:
    bg: str
    tint: tuple[float, float]
    minor: str
    index: str
    bands: tuple[str, str, str]
    edges: tuple[str, str, str]
    band_alpha: float
    halo: str | None


THEMES: dict[ThemeId, Theme] = {
    "dark": Theme("#000000", (0.035, 0.095), "#3d4454", "#7a8396", ("#256abf", "#6da7ec", "#cde2fb"),
                  ("#3987e5", "#9ec5f4", "#ffffff"), 0.8, None),
    "moon": Theme("#c9c5bd", (0.74, 0.83), "#a29d94", "#7d776e", ("#3987e5", "#256abf", "#184f95"),
                  ("#0f2a52", "#0f2a52", "#0f2a52"), 1.0, "#f5f3ef"),
}


def _resize(a: np.ndarray, size: int, resample: Image.Resampling) -> np.ndarray:
    return np.asarray(Image.fromarray(a.astype(np.float32), mode="F").resize((size, size), resample))


def smooth_field(pred: np.ndarray, size: int, div: int) -> np.ndarray:
    valid = _resize(np.isfinite(pred).astype(np.float32), size, Image.Resampling.BILINEAR) > 0.5
    filled = _resize(np.nan_to_num(pred, nan=0.0), size, Image.Resampling.BILINEAR)
    coarse = _resize(filled, max(size // div, 1), Image.Resampling.BOX)
    smooth = np.clip(_resize(coarse, size, Image.Resampling.BICUBIC), 0, 1)
    return np.where(valid, smooth, np.nan)


def band_class(v: np.ndarray, levels: Sequence[float]) -> np.ndarray:
    classes = np.digitize(np.nan_to_num(v, nan=-np.inf), levels).astype(np.int8)
    return np.where(np.isnan(v), np.int8(-1), classes)


def hotspot_threshold(v: np.ndarray, pct: float) -> float:
    return float(np.nanpercentile(v, pct))


def to_map_px(xy_m: np.ndarray, grid: Grid, box: Box, size: int) -> np.ndarray:
    inv = ~grid.transform
    cols, rows = inv @ (xy_m[:, 0], xy_m[:, 1])
    x0, y0, x1, y1 = box
    return np.stack([(np.asarray(cols) - x0) / (x1 - x0) * size, (np.asarray(rows) - y0) / (y1 - y0) * size], 1)


def _crop(a: np.ndarray, box: Box) -> np.ndarray:
    x0, y0, x1, y1 = box
    return a[y0:y1, x0:x1]


def _topo(ax: Axes, dem: np.ndarray, theme: Theme) -> None:
    lo, hi = np.nanpercentile(dem, [1, 99])
    a, b = theme.tint
    tint = a + (b - a) * np.clip((dem - lo) / max(hi - lo, 1e-6), 0, 1)
    ax.imshow(np.repeat(np.nan_to_num(tint, nan=a)[..., None], 3, 2), interpolation="bilinear")
    levels = np.arange(-8000, 8001, TOPO_STEP_M)
    ax.contour(dem, levels=[v for v in levels if v % TOPO_INDEX_M], colors=theme.minor, linewidths=0.6)
    ax.contour(dem, levels=[v for v in levels if not v % TOPO_INDEX_M], colors=theme.index, linewidths=1.0)


def _glow(ax: Axes, field: np.ndarray, theme: Theme) -> None:
    cmap = LinearSegmentedColormap.from_list("glow", list(theme.bands))
    rgba = cmap(np.clip((np.nan_to_num(field) - 0.2) / 0.8, 0, 1))
    rgba[..., 3] = np.where(np.isfinite(field), np.clip((np.nan_to_num(field) - 0.2) / 0.55, 0, 1) ** 1.4 * 0.8, 0)
    ax.imshow(rgba, interpolation="bilinear")


def _bands(ax: Axes, field: np.ndarray, theme: Theme) -> None:
    levels = [*BAND_LEVELS, 1.0001]
    cmap = ListedColormap(list(theme.bands))
    ax.contourf(field, levels=levels, cmap=cmap, norm=BoundaryNorm(levels, cmap.N), alpha=theme.band_alpha)
    if theme.halo:
        ax.contour(field, levels=list(BAND_LEVELS), colors=theme.halo, linewidths=3.2)
    ax.contour(field, levels=list(BAND_LEVELS), colors=list(theme.edges), linewidths=1.2)


def _hotspots(ax: Axes, field: np.ndarray, theme: Theme, thr: float) -> None:
    ax.contourf(field, levels=[thr, 1.0001], colors=[theme.bands[2]], alpha=0.95)
    if theme.halo:
        ax.contour(field, levels=[thr], colors=theme.halo, linewidths=3.2)
    ax.contour(field, levels=[thr], colors=[theme.edges[1]], linewidths=1.0)


def render_map(style: Style, theme_id: ThemeId, dem: np.ndarray, field: np.ndarray, thr: float, out: Path) -> None:
    theme, size = THEMES[theme_id], dem.shape[0]
    fig = plt.figure(figsize=(size / 100, size / 100), dpi=100, facecolor=theme.bg)
    ax = fig.add_axes((0, 0, 1, 1))
    ax.set_facecolor(theme.bg)
    ax.axis("off")
    _topo(ax, dem, theme)
    if style == "a":
        _glow(ax, field, theme)
    elif style == "b":
        _bands(ax, field, theme)
    else:
        _hotspots(ax, field, theme, thr)
    ax.set_xlim(0, size)
    ax.set_ylim(size, 0)
    buf = io.BytesIO()
    fig.savefig(buf, dpi=100, facecolor=theme.bg, format="png")
    plt.close(fig)
    with Image.open(buf) as im:
        im.convert("RGB").save(out, "WEBP", quality=WEBP_QUALITY, method=6)


def _stats(layers: PoleLayers, grid: Grid) -> dict[str, float]:
    pred = layers.pred[np.isfinite(layers.pred)]
    both = np.isfinite(layers.pred) & np.isfinite(layers.ref)
    cap_px = math.pi * (cap_rho_m(CAP_EDGE_LAT_DEG) / grid.transform.a) ** 2
    return {
        "mean": float(pred.mean()),
        "fracGe04": float((pred >= 0.4).mean()),
        "fracGe06": float((pred >= 0.6).mean()),
        "fracGe08": float((pred >= 0.8).mean()),
        "coverage": float(min(pred.size / cap_px, 1.0)),
        "rmse": float(np.sqrt(np.mean((layers.pred[both] - layers.ref[both]) ** 2))),
    }


def _region_px(region: Region, pole: Pole, grid: Grid, box: Box, size: int) -> dict[str, Any]:
    lon, lat = shapely.get_coordinates(region.geometry.exterior).T
    x, y = lonlat_to_ps(lon, lat, pole)
    clon, clat = region_centroid(region, pole)
    cx, cy = lonlat_to_ps([clon], [clat], pole)
    return {
        "id": region.id,
        "name": region.name,
        "px": np.round(to_map_px(np.stack([x, y], 1), grid, box, size), 1).tolist(),
        "centroidPx": np.round(to_map_px(np.stack([cx, cy], 1), grid, box, size)[0], 1).tolist(),
    }


def _render_set(dem: np.ndarray, pred: np.ndarray, extent_km: float, size: int, suffix: str, out_dir: Path,
                thr: float | None = None) -> float:
    dem_px = _resize(dem, size, Image.Resampling.BICUBIC)
    field = smooth_field(pred, size, max(1, round(size * SMOOTH_KM / extent_km)))
    thr = hotspot_threshold(field, HOTSPOT_PCT) if thr is None else thr
    for style in STYLES:
        for theme_id in THEME_IDS:
            render_map(style, theme_id, dem_px, field, thr, out_dir / f"{style}-{theme_id}{suffix}.webp")
    return thr


def export_height(dem: np.ndarray, size: int, out: Path) -> dict[str, Any]:
    heights = np.round(_resize(dem, size, Image.Resampling.BOX)).astype("<i2")
    heights.tofile(out)
    return {"file": out.name, "size": size, "min": int(heights.min()), "max": int(heights.max())}


def export_maps(pole: Pole, layers: PoleLayers, regions: list[Region] | None, out_dir: Path,
                grid: Grid | None = None, box: Box | None = None, size: int = MAP_PX,
                height_px: int = HEIGHT_PX) -> dict[str, Any]:
    grid = grid or cap_grid(pole)
    box = box or (SOUTH_MAP_BOX if pole == "south" else (0, 0, grid.width, grid.height))
    dem = np.nan_to_num(_crop(layers.dem, box), nan=float(np.nanmedian(layers.dem)))
    pred = _crop(layers.pred, box)
    extent_km = (box[2] - box[0]) * grid.transform.a / 1000
    out_dir.mkdir(parents=True, exist_ok=True)
    thr = _render_set(dem, pred, extent_km, size, "", out_dir)
    _render_set(dem, pred, extent_km, size * 2, "@2x", out_dir, thr)
    pole_px = to_map_px(np.array([[FALSE_EASTING, FALSE_NORTHING]]), grid, box, size)[0]
    meta: dict[str, Any] = {
        "version": 1, "pole": pole, "size": size, "hdSize": size * 2,
        "kmPerPx": extent_km / size,
        "polePx": np.round(pole_px, 1).tolist(), "levels": list(BAND_LEVELS), "hotspot": round(thr, 3),
        "styles": list(STYLES), "themes": list(THEME_IDS), "stats": _stats(layers, grid),
        "height": export_height(dem, height_px, out_dir / "height.bin"),
        "regions": [_region_px(r, pole, grid, box, size) for r in regions or []],
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=1))
    return meta
