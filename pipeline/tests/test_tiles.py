import numpy as np
import pytest
import rasterio

from atlas.constants import ICE_DIR, PRED_DIR, PRED_SUFFIX
from atlas.tiles import parse_patch_id, pole_of

EXPECTED_PATCHES = 162
MAX_TEST_RMSE = 0.035


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
