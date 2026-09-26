from pathlib import Path

import numpy as np
import pyogrio
import pytest
import shapely
from affine import Affine

from atlas.crs import ice_crs, ps_to_lonlat
from atlas.regions import EXPECTED_REGIONS, Region, StatLayers, load_regions, region_mask, region_stats, slugify
from atlas.tiles import Grid


def _grid() -> Grid:
    return Grid(ice_crs("south"), Affine(1000, 0, 480_000, 0, -1000, 520_000), 40, 40)


def _square_region() -> Region:
    lon, lat = ps_to_lonlat([490_000, 500_000, 500_000, 490_000], [510_000, 510_000, 500_000, 500_000], "south")
    return Region("sq", "Square", shapely.Polygon(zip(lon.tolist(), lat.tolist(), strict=True)))


def _layers(pred: np.ndarray) -> StatLayers:
    ones = np.ones_like(pred)
    return StatLayers(pred=pred, ref=pred, slope=ones * 4, psr=ones * 0, psr_dist=ones * 1000, tmax=ones * 100)


def test_expected_regions_are_the_nine_nasa_names() -> None:
    assert len(EXPECTED_REGIONS) == 9
    assert "Haworth" in EXPECTED_REGIONS and "de Gerlache Rim 2" in EXPECTED_REGIONS


def test_slugify_makes_stable_ids() -> None:
    assert slugify("de Gerlache Rim 2") == "de-gerlache-rim-2"
    assert slugify("Peak near Cabeus B") == "peak-near-cabeus-b"


def test_region_mask_covers_expected_pixels() -> None:
    mask = region_mask(_square_region(), _grid())
    assert mask.dtype == bool
    assert mask.sum() == 100          # 10 km x 10 km at 1 km pixels
    assert mask[10:20, 10:20].all()


def test_region_stats_values_and_coverage() -> None:
    mask = np.zeros((4, 4), bool)
    mask[:2, :2] = True
    pred = np.array([[0.2, 0.8, 0, 0], [np.nan, 0.5, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], np.float32)
    s = region_stats(mask, _layers(pred))
    assert s["coverage"] == 0.75
    assert s["predMean"] == pytest.approx(0.5)
    assert s["fracPredGt05"] == pytest.approx(1 / 3)
    assert s["fracSlopeLt5"] == 1.0
    assert s["fracSlopeLt8"] == 1.0
    assert s["tmaxMeanK"] == pytest.approx(100)


def test_region_stats_slope_thresholds() -> None:
    mask = np.ones((1, 4), bool)
    pred = np.full((1, 4), 0.1, np.float32)
    layers = StatLayers(pred=pred, ref=pred, slope=np.array([[2, 6, 7.9, 12]], np.float32),
                        psr=np.zeros_like(pred), psr_dist=np.zeros_like(pred), tmax=np.zeros_like(pred))
    s = region_stats(mask, layers)
    assert s["fracSlopeLt5"] == 0.25
    assert s["fracSlopeLt8"] == 0.75


def test_region_stats_no_coverage_returns_none() -> None:
    nan = np.full((2, 2), np.nan, np.float32)
    s = region_stats(np.ones((2, 2), bool), StatLayers(nan, nan, nan, nan, nan, nan))
    assert s["coverage"] == 0.0
    assert s["predMean"] is None
    assert s["fracSlopeLt8"] is None


def _write_grid(folder: Path, name: str, x0: float, y0: float, cells: int) -> None:
    folder.mkdir(parents=True)
    squares = [shapely.box(x0 + i * 1000, y0 + j * 1000, x0 + (i + 1) * 1000, y0 + (j + 1) * 1000)
               for i in range(cells) for j in range(cells)]
    pyogrio.raw.write(
        folder / f"{name}_PolarLGRS_ACC_1km_S_Grid.shp", np.array([s.wkb for s in squares], dtype=object),
        field_data=[np.arange(len(squares))], fields=["id"], crs=ice_crs("south").to_wkt(),
        geometry_type="Polygon", driver="ESRI Shapefile",
    )


def test_load_regions_merges_1km_cells_into_one_footprint(tmp_path: Path) -> None:
    _write_grid(tmp_path / "Peak_Near_Cabeus_B", "Peak_Near_Cabeus_B", 490_000, 490_000, 3)
    _write_grid(tmp_path / "Haworth", "Haworth", 480_000, 480_000, 2)
    regions = load_regions(tmp_path, expected=("Peak near Cabeus B", "Haworth"))
    by_id = {r.id: r for r in regions}
    assert set(by_id) == {"peak-near-cabeus-b", "haworth"}
    assert by_id["peak-near-cabeus-b"].name == "Peak near Cabeus B"  # NASA spelling, not folder spelling
    assert region_mask(by_id["peak-near-cabeus-b"], _grid()).sum() == 9  # 3 km x 3 km at 1 km pixels
    assert len(shapely.get_coordinates(by_id["haworth"].geometry.exterior)) == 5  # collinear cell corners removed


def test_load_regions_requires_every_expected_region(tmp_path: Path) -> None:
    _write_grid(tmp_path / "Haworth", "Haworth", 480_000, 480_000, 2)
    with pytest.raises(ValueError, match="Slater Plain"):
        load_regions(tmp_path, expected=("Haworth", "Slater Plain"))


def test_region_stats_empty_mask_is_zero_coverage() -> None:
    z = np.zeros((2, 2), np.float32)
    s = region_stats(np.zeros((2, 2), bool), StatLayers(z, z, z, z, z, z))
    assert s["coverage"] == 0.0
    assert s["predMean"] is None


REAL_AREAS_KM2 = {  # number of 1 km cells in each USGS grid, checked 2026-09-25
    "Haworth": 930, "Malapert Massif": 462, "Mons Mouton": 289, "Mons Mouton Plateau": 4524, "Nobile Rim 1": 441,
    "Nobile Rim 2": 420, "Peak near Cabeus B": 441, "Slater Plain": 441, "de Gerlache Rim 2": 441,
}


@pytest.mark.data
def test_real_regions_load_near_south_pole_with_expected_areas() -> None:
    from atlas.constants import ARTEMIS_DIR
    from atlas.tiles import cap_grid

    regions = load_regions(ARTEMIS_DIR)
    assert sorted(r.name for r in regions) == sorted(EXPECTED_REGIONS)
    grid = cap_grid("south")
    pixel_km2 = (grid.transform.a / 1000) ** 2
    for r in regions:
        assert -90 < r.geometry.centroid.y < -83, r.name
        area_km2 = region_mask(r, grid).sum() * pixel_km2
        assert area_km2 == pytest.approx(REAL_AREAS_KM2[r.name], rel=0.02), r.name
