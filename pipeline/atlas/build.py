import argparse
import json
import logging
from datetime import date
from typing import Any

import numpy as np
import shapely

from atlas.constants import (
    ARTEMIS_DIR,
    DEM_DIR,
    ICE_DIR,
    ICE_PIXEL_M,
    MESH_STRIDE,
    PRED_DIR,
    PRED_SUFFIX,
    SVS_DIR,
    WEB_DATA_DIR,
)
from atlas.crs import Pole
from atlas.dem import read_pds_dem, slope_deg, to_grid
from atlas.export_web import PoleLayers, export_pole
from atlas.globe_assets import export_globe
from atlas.regions import Region, StatLayers, load_regions, region_centroid, region_mask, region_stats
from atlas.tiles import Grid, cap_grid, footprint, mosaic, parse_patch_id, patch_files

log = logging.getLogger("atlas.build")

REGIONS_SOURCE = "USGS Down Selected Artemis III Candidate Landing Site Navigational Grids (1 km grid footprints)"
REGIONS_DOI = "10.5066/P1MEQ6UK"


def _ice_layer(suffix: str, pole: Pole) -> np.ndarray:
    return mosaic(patch_files(ICE_DIR, suffix, pole), cap_grid(pole))


def _test_footprint(pole: Pole) -> np.ndarray:
    ids = set((ICE_DIR / "test_filtered.txt").read_text().split())
    tiles = [p for p in patch_files(ICE_DIR, "_PRO.tif", pole) if parse_patch_id(p.name) in ids]
    return footprint(tiles, cap_grid(pole))


def pole_layers(pole: Pole) -> PoleLayers:
    heights, transform, crs = read_pds_dem(DEM_DIR / f"ldem_75{pole[0]}_240m.lbl")
    ref = _ice_layer("_PRO.tif", pole)
    raw_pred = mosaic(patch_files(PRED_DIR, PRED_SUFFIX, pole), cap_grid(pole))
    return PoleLayers(
        dem=to_grid(heights, transform, crs, cap_grid(pole)),
        pred=np.where(np.isnan(ref), np.nan, raw_pred).astype(np.float32),
        ref=ref,
        psr=_ice_layer("_LPSR.tif", pole),
        test_mask=_test_footprint(pole),
    )


def _region_entry(region: Region, grid: Grid, stat_layers: StatLayers) -> dict[str, Any]:
    stats = region_stats(region_mask(region, grid), stat_layers)
    coverage = stats.pop("coverage")
    outline = shapely.get_coordinates(region.geometry.exterior).tolist()
    centroid = list(region_centroid(region, "south"))
    return {"id": region.id, "name": region.name, "outline": outline, "centroid": centroid,
            "coverage": coverage, "stats": stats}


def build_regions() -> None:
    layers = pole_layers("south")
    stat_layers = StatLayers(
        pred=layers.pred, ref=layers.ref, slope=slope_deg(layers.dem, ICE_PIXEL_M), psr=layers.psr,
        psr_dist=_ice_layer("_LPSR_DIS.tif", "south"), tmax=_ice_layer("_TMAX.tif", "south"),
    )
    grid = cap_grid("south")
    entries = [_region_entry(r, grid, stat_layers) for r in load_regions(ARTEMIS_DIR)]
    doc = {"source": REGIONS_SOURCE, "doi": REGIONS_DOI, "retrieved": date.today().isoformat(), "regions": entries}
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    (WEB_DATA_DIR / "regions.json").write_text(json.dumps(doc, indent=2))
    log.info("wrote %d regions", len(entries))


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(description="Build web assets for the Lunar Ice Atlas")
    parser.add_argument("target", choices=["globe", "north", "south", "regions", "all"])
    target = parser.parse_args().target
    if target in ("globe", "all"):
        export_globe(SVS_DIR / "ldem_4.tif", SVS_DIR / "lroc_color_16bit_srgb_4k.tif", WEB_DATA_DIR / "globe")
        log.info("exported globe")
    for pole in ("north", "south"):
        if target in (pole, "all"):
            export_pole(pole, pole_layers(pole), WEB_DATA_DIR / pole, stride=MESH_STRIDE, pixel_m=ICE_PIXEL_M)
            log.info("exported %s", pole)
    if target in ("regions", "all"):
        build_regions()


if __name__ == "__main__":
    main()
