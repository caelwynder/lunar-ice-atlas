import json
from pathlib import Path

import numpy as np
import pytest
from affine import Affine
from PIL import Image

from atlas.constants import ICE_PIXEL_M
from atlas.crs import ice_crs
from atlas.export_web import PoleLayers
from atlas.polemaps import band_class, export_maps, hotspot_threshold, smooth_field, to_map_px
from atlas.tiles import Grid

STYLES = ("a", "b", "d")
THEMES = ("dark", "moon")


def _layers(n: int = 256) -> PoleLayers:
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    pred = (xx / (n - 1)).astype(np.float32)
    pred[: n // 8, : n // 8] = np.nan
    dem = (2000 * np.sin(xx / 20) * np.cos(yy / 25)).astype(np.float32)
    ref = np.clip(pred + 0.01, 0, 1).astype(np.float32)
    empty = np.zeros((n, n), dtype=np.float32)
    return PoleLayers(dem=dem, pred=pred, ref=ref, psr=empty, test_mask=empty.astype(bool))


def _grid(n: int) -> Grid:
    return Grid(ice_crs("north"), Affine(ICE_PIXEL_M, 0, 0, 0, -ICE_PIXEL_M, n * ICE_PIXEL_M), n, n)


def test_smooth_field_keeps_nan_mask_and_range() -> None:
    pred = _layers(64).pred
    out = smooth_field(pred, size=32, div=4)
    assert out.shape == (32, 32)
    assert np.isnan(out[0, 0])
    assert np.isfinite(out[-1, -1])
    assert np.nanmin(out) >= 0 and np.nanmax(out) <= 1


def test_band_class_levels() -> None:
    v = np.array([np.nan, 0.1, 0.4, 0.59, 0.6, 0.85])
    assert band_class(v, (0.4, 0.6, 0.8)).tolist() == [-1, 0, 1, 1, 2, 3]


def test_hotspot_threshold_is_85th_percentile() -> None:
    assert hotspot_threshold(np.arange(100.0), 85) == pytest.approx(84.15)


def test_hotspot_threshold_ignores_nan() -> None:
    v = np.r_[np.arange(100.0), [np.nan] * 50]
    assert hotspot_threshold(v, 85) == pytest.approx(84.15)


def test_to_map_px_round_trip_corners() -> None:
    grid = _grid(100)
    box = (10, 20, 60, 70)
    x0, y0 = grid.transform @ (10, 20)
    x1, y1 = grid.transform @ (60, 70)
    px = to_map_px(np.array([[x0, y0], [x1, y1]]), grid, box, size=500)
    np.testing.assert_allclose(px, [[0, 0], [500, 500]], atol=1e-9)


def test_export_maps_writes_12_files_and_meta(tmp_path: Path) -> None:
    meta = export_maps("north", _layers(), None, tmp_path, grid=_grid(256), box=(0, 0, 256, 256), size=400)
    for style in STYLES:
        for theme in THEMES:
            with Image.open(tmp_path / f"{style}-{theme}.webp") as im:
                assert im.size == (400, 400)
    on_disk = json.loads((tmp_path / "meta.json").read_text())
    assert on_disk == meta
    assert meta["regions"] == []
    assert meta["styles"] == list(STYLES) and meta["themes"] == list(THEMES)
    assert meta["levels"] == [0.4, 0.6, 0.8]
    stats = meta["stats"]
    assert 0 <= stats["fracGe04"] <= 1 and stats["fracGe04"] >= stats["fracGe06"] >= stats["fracGe08"]
    assert stats["rmse"] == pytest.approx(0.01, abs=1e-3)
    assert meta["kmPerPx"] == pytest.approx(256 * ICE_PIXEL_M / 1000 / 400)


def test_export_maps_does_not_mutate_inputs(tmp_path: Path) -> None:
    layers = _layers(64)
    before = layers.pred.copy()
    export_maps("north", layers, None, tmp_path, grid=_grid(64), box=(0, 0, 64, 64), size=100)
    np.testing.assert_array_equal(layers.pred, before)


@pytest.mark.data
def test_south_meta_has_nine_regions_inside_image() -> None:
    from atlas.constants import WEB_DATA_DIR

    meta = json.loads((WEB_DATA_DIR / "maps" / "south" / "meta.json").read_text())
    assert len(meta["regions"]) == 9
    for region in meta["regions"]:
        pts = np.asarray(region["px"])
        assert ((pts >= 0) & (pts <= meta["size"])).all()
    assert meta["stats"]["rmse"] == pytest.approx(0.0236, abs=0.001)
