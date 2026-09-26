import numpy as np
import pytest
import rasterio
from affine import Affine

from atlas.constants import CAP_ORIGIN_X, CAP_ORIGIN_Y, CAP_PX, ICE_DIR, ICE_PIXEL_M, PRED_DIR, PRED_SUFFIX
from atlas.crs import ice_crs
from atlas.tiles import Grid, cap_grid, footprint, mosaic, parse_patch_id, patch_files, patch_offset, pole_of

EXPECTED_PATCHES = 162
MAX_TEST_RMSE = 0.035
SOUTH = ice_crs("south").to_wkt()
PX = ICE_PIXEL_M


@pytest.mark.parametrize(("name", "pid"), [
    ("patch_0004_0004_S_80S_ASP_SIN_COS_pred.tif", "patch_0004_0004_S_80S"),
    ("patch_0000_0003_80N_PRO.tif", "patch_0000_0003_80N"),
])
def test_parse_patch_id(name: str, pid: str) -> None:
    assert parse_patch_id(name) == pid


def test_parse_rejects_garbage() -> None:
    with pytest.raises(ValueError, match="not a patch file"):
        parse_patch_id("README.md")


def test_pole_of() -> None:
    assert pole_of("patch_0001_0002_S_80S") == "south"
    assert pole_of("patch_0001_0002_80N") == "north"


@pytest.mark.data
def test_predictions_are_georeferenced_float_in_range() -> None:
    preds = sorted(PRED_DIR.glob(f"*{PRED_SUFFIX}"))
    assert len(preds) == EXPECTED_PATCHES
    for p in preds[::20]:
        pid = parse_patch_id(p.name)
        with rasterio.open(p) as src, rasterio.open(ICE_DIR / f"{pid}_PRO.tif") as ref:
            assert src.dtypes[0] == "float32"
            assert src.transform.almost_equals(ref.transform)
            assert src.crs == ref.crs
            pred, label = src.read(1), ref.read(1)
        valid = ~np.isnan(label)
        if valid.any():
            assert pred[valid].min() > -0.1
            assert pred[valid].max() < 1.1


@pytest.mark.data
def test_test_split_rmse_matches_card() -> None:
    ids = (ICE_DIR / "test_filtered.txt").read_text().split()
    errs = []
    for pid in ids:
        with rasterio.open(PRED_DIR / f"{pid}{PRED_SUFFIX}") as s, rasterio.open(ICE_DIR / f"{pid}_PRO.tif") as r:
            pred, label = s.read(1), r.read(1)
        valid = ~np.isnan(label)
        errs.append(pred[valid] - label[valid])
    rmse = float(np.sqrt(np.mean(np.concatenate(errs) ** 2)))
    assert rmse <= MAX_TEST_RMSE, rmse


def _small_grid() -> Grid:
    return Grid(ice_crs("south"), Affine(PX, 0, 0, 0, -PX, 8 * PX), 8, 8)


def test_cap_grid_covers_full_80deg_disk() -> None:
    g = cap_grid("south")
    assert (g.width, g.height) == (CAP_PX, CAP_PX)
    assert g.transform.c + g.width * g.transform.a >= 802_136
    assert g.transform.f + g.height * g.transform.e <= 197_864


def test_patch_offset_exact_and_rejects_misaligned() -> None:
    g = cap_grid("south")
    t = Affine(PX, 0, CAP_ORIGIN_X + 3 * 256 * PX, 0, -PX, CAP_ORIGIN_Y - 2 * 256 * PX)
    assert patch_offset(t, g) == (512, 768)
    with pytest.raises(ValueError, match="not aligned"):
        patch_offset(Affine(PX, 0, t.c + 0.3 * PX, 0, -PX, t.f), g)


def test_mosaic_places_tiles_and_leaves_nan(write_tif) -> None:
    a = write_tif("a.tif", np.ones((4, 4), np.float32), Affine(PX, 0, 0, 0, -PX, 8 * PX), SOUTH)
    b = write_tif("b.tif", np.full((4, 4), 2, np.float32), Affine(PX, 0, 4 * PX, 0, -PX, 4 * PX), SOUTH, nodata=-1)
    out = mosaic([a, b], _small_grid())
    assert np.all(out[:4, :4] == 1)
    assert np.all(out[4:, 4:] == 2)
    assert np.isnan(out[:4, 4:]).all()
    assert np.isnan(out[4:, :4]).all()


def test_mosaic_rejects_tile_outside_grid(write_tif) -> None:
    far = write_tif("far.tif", np.ones((4, 4), np.float32), Affine(PX, 0, 6 * PX, 0, -PX, 8 * PX), SOUTH)
    with pytest.raises(ValueError, match="outside the grid"):
        mosaic([far], _small_grid())


def test_footprint_marks_tile_extent_even_where_values_are_nan(write_tif) -> None:
    a = write_tif("a.tif", np.full((4, 4), np.nan, np.float32), Affine(PX, 0, 0, 0, -PX, 8 * PX), SOUTH)
    fp = footprint([a], _small_grid())
    assert fp.dtype == bool
    assert fp[:4, :4].all()
    assert fp.sum() == 16


@pytest.mark.data
@pytest.mark.parametrize("pole", ["north", "south"])
def test_real_label_mosaic_is_disk_with_crescent_gap(pole: str) -> None:
    label = mosaic(patch_files(ICE_DIR, "_PRO.tif", pole), cap_grid(pole))
    assert np.isnan(label[:, -256:]).all()           # 10th column is never shipped
    assert 0.55 < np.isfinite(label).mean() < 0.75   # disk ≈ 71% of the 10×10 square, minus the 9% crescent
