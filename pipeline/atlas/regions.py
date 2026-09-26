import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pyogrio
import shapely
import shapely.ops
from pyproj import CRS, Transformer
from rasterio.features import rasterize

from atlas.crs import Pole, ice_crs, moon_lonlat, ps_to_lonlat
from atlas.tiles import Grid

EXPECTED_REGIONS = (
    "Peak near Cabeus B", "Haworth", "Malapert Massif", "Mons Mouton Plateau", "Mons Mouton",
    "Nobile Rim 1", "Nobile Rim 2", "de Gerlache Rim 2", "Slater Plain",
)
SLOPE_GOAL_DEG = 5.0
SLOPE_THRESHOLD_DEG = 8.0
HIGH_PROSPECTIVITY = 0.5
GRID_GLOB = "*_1km_S_Grid.shp"
FOOTPRINT_SIMPLIFY_M = 1.0  # drops collinear 1 km cell corners; cell edges are exact metres
OUTLINE_STEP_M = 1000.0  # straight PS edges bow by up to ~6 km in lon/lat, so keep a vertex every 1 km


@dataclass(frozen=True)
class Region:
    id: str
    name: str
    geometry: shapely.Polygon


@dataclass(frozen=True)
class StatLayers:
    pred: np.ndarray
    ref: np.ndarray
    slope: np.ndarray
    psr: np.ndarray
    psr_dist: np.ndarray
    tmax: np.ndarray


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _grid_footprint(shp: Path) -> shapely.Polygon:
    """Union of a region's 1 km navigation cells, returned in lon/lat degrees."""
    crs = CRS.from_user_input(pyogrio.read_info(shp)["crs"])
    _, _, geoms, _ = pyogrio.raw.read(shp, columns=[])
    cells = shapely.union_all([shapely.from_wkb(g) for g in geoms])
    footprint = cells.simplify(FOOTPRINT_SIMPLIFY_M).segmentize(OUTLINE_STEP_M)
    if not isinstance(footprint, shapely.Polygon):
        raise ValueError(f"{shp.name}: cells do not form a single polygon ({footprint.geom_type})")
    to_lonlat = Transformer.from_crs(crs, moon_lonlat(), always_xy=True)
    return shapely.ops.transform(to_lonlat.transform, footprint)


def load_regions(root: Path, expected: tuple[str, ...] = EXPECTED_REGIONS) -> list[Region]:
    """Read one footprint per region folder (USGS DOI 10.5066/P1MEQ6UK layout: <Region_Name>/*_1km_S_Grid.shp)."""
    by_slug = {slugify(name): name for name in expected}
    regions = []
    for folder in sorted(p for p in root.iterdir() if p.is_dir()):
        name = by_slug.get(slugify(folder.name.replace("_", " ")))
        grids = list(folder.glob(GRID_GLOB))
        if name is None or len(grids) != 1:
            continue
        regions.append(Region(slugify(name), name, _grid_footprint(grids[0])))
    missing = sorted(set(expected) - {r.name for r in regions})
    if missing:
        raise ValueError(f"{root} lacks a {GRID_GLOB} for: {missing}")
    return regions


def _project(geometry: shapely.Polygon, crs: CRS) -> shapely.Polygon:
    return shapely.ops.transform(Transformer.from_crs(moon_lonlat(), crs, always_xy=True).transform, geometry)


def region_centroid(region: Region, pole: Pole) -> tuple[float, float]:
    """Centroid taken in polar-stereographic metres; a lon/lat centroid drifts ~1 km this close to the pole."""
    centre = _project(region.geometry, ice_crs(pole)).centroid
    lon, lat = ps_to_lonlat(centre.x, centre.y, pole)
    return float(lon), float(lat)


def region_mask(region: Region, grid: Grid) -> np.ndarray:
    projected = _project(region.geometry, grid.crs)
    burned = rasterize([(projected, 1)], out_shape=(grid.height, grid.width), transform=grid.transform, fill=0)
    return burned.astype(bool)


def _mean(a: np.ndarray) -> float | None:
    return float(np.nanmean(a)) if np.isfinite(a).any() else None


def _frac(cond: np.ndarray, valid: np.ndarray) -> float | None:
    return float(cond[valid].mean()) if valid.any() else None


def region_stats(mask: np.ndarray, layers: StatLayers) -> dict[str, float | None]:
    pred, slope = layers.pred[mask], layers.slope[mask]
    valid_pred, valid_slope = np.isfinite(pred), np.isfinite(slope)
    return {
        "coverage": float(valid_pred.mean()) if mask.any() else 0.0,
        "predMean": _mean(pred),
        "predP90": float(np.nanpercentile(pred, 90)) if valid_pred.any() else None,
        "fracPredGt05": _frac(pred > HIGH_PROSPECTIVITY, valid_pred),
        "refMean": _mean(layers.ref[mask]),
        "slopeMeanDeg": _mean(slope),
        "fracSlopeLt5": _frac(slope < SLOPE_GOAL_DEG, valid_slope),
        "fracSlopeLt8": _frac(slope < SLOPE_THRESHOLD_DEG, valid_slope),
        "fracPsr": _mean(layers.psr[mask]),
        "psrDistMean": _mean(layers.psr_dist[mask]),
        "tmaxMeanK": _mean(layers.tmax[mask]),
    }
