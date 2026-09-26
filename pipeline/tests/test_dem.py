import numpy as np
import pytest
from affine import Affine

from atlas.constants import DEM_DIR, ICE_DIR, ICE_PIXEL_M
from atlas.crs import ice_crs
from atlas.dem import hillshade, read_pds_dem, slope_deg, to_grid
from atlas.tiles import Grid, cap_grid, mosaic, patch_files

MIN_SLOPE_CORRELATION = 0.99


def test_slope_of_known_plane() -> None:
    x = np.arange(10, dtype=np.float32) * 100.0
    z = np.tile(x * np.tan(np.radians(10)), (10, 1))
    assert np.allclose(slope_deg(z, 100.0), 10.0, atol=1e-3)


def test_hillshade_flat_is_uniform_uint8() -> None:
    out = hillshade(np.zeros((8, 8), np.float32), 240.0)
    assert out.dtype == np.uint8
    assert out.min() == out.max()


def test_hillshade_tolerates_nan() -> None:
    z = np.zeros((8, 8), np.float32)
    z[0, 0] = np.nan
    assert hillshade(z, 240.0).dtype == np.uint8


def test_to_grid_identity_when_grids_match() -> None:
    crs = ice_crs("south")
    t = Affine(240, 0, 0, 0, -240, 2400)
    z = np.arange(100, dtype=np.float32).reshape(10, 10)
    assert np.allclose(to_grid(z, t, crs, Grid(crs, t, 10, 10)), z)


def test_to_grid_does_not_mutate_input() -> None:
    crs = ice_crs("south")
    t = Affine(240, 0, 0, 0, -240, 2400)
    z = np.arange(100, dtype=np.float32).reshape(10, 10)
    before = z.copy()
    to_grid(z, t, crs, Grid(crs, Affine(480, 0, 0, 0, -480, 2400), 5, 5))
    assert np.array_equal(z, before)


@pytest.mark.data
def test_read_pds_dem_applies_scale_not_radius_offset() -> None:
    heights, _, crs = read_pds_dem(DEM_DIR / "ldem_75s_240m.lbl")
    assert heights.dtype == np.float32
    assert -10_000 < np.nanmin(heights) < 0 < np.nanmax(heights) < 10_000  # metres above 1737.4 km, not radius
    assert crs.ellipsoid.semi_major_metre == 1_737_400


@pytest.mark.data
@pytest.mark.parametrize("pole", ["south", "north"])
def test_pds_dem_aligns_with_dataset_slope(pole: str) -> None:
    """Georeferencing regression guard: r = 0.997-0.999 measured on sample south patches, 2026-09-24."""
    grid = cap_grid(pole)
    heights, t, crs = read_pds_dem(DEM_DIR / f"ldem_75{pole[0]}_240m.lbl")
    ours = slope_deg(to_grid(heights, t, crs, grid), ICE_PIXEL_M)
    ref = mosaic(patch_files(ICE_DIR, "_SLOPE.tif", pole), grid)
    m = np.isfinite(ref) & np.isfinite(ours)
    assert np.corrcoef(ours[m], ref[m])[0, 1] >= MIN_SLOPE_CORRELATION
