import json
from pathlib import Path

import numpy as np
from PIL import Image

from atlas.colorize import ERR_RAMP, ICE_RAMP, ramp_rgba
from atlas.constants import ERR_RANGE
from atlas.export_web import ERR_ALPHA, ICE_ALPHA, PoleLayers, export_pole

N = 16
STRIDE = 4
MAX_MEAN_COLOUR_ERROR = 3.0


def _layers() -> PoleLayers:
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    return PoleLayers(
        dem=xx * 10,
        pred=np.where(xx < 8, xx / 16, np.nan).astype(np.float32),
        ref=np.where(xx < 8, yy / 16, np.nan).astype(np.float32),
        psr=(xx > 12).astype(np.float32),
        test_mask=np.zeros((N, N), bool),
    )


def test_export_pole_writes_contract(tmp_path: Path) -> None:
    meta = export_pole("south", _layers(), tmp_path, stride=STRIDE, pixel_m=238.56)
    assert json.loads((tmp_path / "meta.json").read_text()) == meta
    assert meta["version"] == 1
    assert meta["crs"]["lat0"] == -90
    assert meta["mesh"] == {"file": "height.i16.bin", "width": 4, "height": 4, "stride": 4, "units": "m"}
    assert [layer["id"] for layer in meta["layers"]] == ["pred", "ref", "err", "psr", "test"]
    assert "values" not in meta["layers"][3]
    assert meta["layers"][2]["legend"]["kind"] == "diverging"
    assert all(layer["texture"] == f"{layer['id']}.webp" for layer in meta["layers"])
    assert all((tmp_path / layer["texture"]).stat().st_size > 0 for layer in meta["layers"])


def test_export_pole_file_contents(tmp_path: Path) -> None:
    export_pole("north", _layers(), tmp_path, stride=STRIDE, pixel_m=238.56)
    heights = np.fromfile(tmp_path / "height.i16.bin", dtype="<i2").reshape(4, 4)
    assert heights[0, 0] == 15  # mean of x*10 for x = 0..3
    pred_u8 = np.fromfile(tmp_path / "pred.u8.bin", dtype=np.uint8).reshape(4, 4)
    assert pred_u8[0, 3] == 255  # right half has no prediction
    assert pred_u8[0, 0] < 255
    with Image.open(tmp_path / "pred.webp") as img:
        rgba = np.asarray(img.convert("RGBA"))
        assert img.size == (N, N)
        assert rgba[0, -1, 3] == 0  # no-data pixels are transparent
        assert rgba[0, 0, 3] > 0
    with Image.open(tmp_path / "hillshade.jpg") as img:
        assert img.size == (N, N)


def _read_rgba(path: Path) -> np.ndarray:
    with Image.open(path) as img:
        return np.asarray(img.convert("RGBA"))


def test_export_pole_error_overlay_is_lossless(tmp_path: Path) -> None:
    layers = _layers()
    export_pole("south", layers, tmp_path, stride=STRIDE, pixel_m=238.56)
    expected = ramp_rgba(layers.pred - layers.ref, ERR_RAMP, -ERR_RANGE, ERR_RANGE, ERR_ALPHA)
    got = _read_rgba(tmp_path / "err.webp")
    visible = expected[..., 3] > 0
    assert np.array_equal(got[visible], expected[visible])


def test_export_pole_prediction_overlay_is_near_lossless(tmp_path: Path) -> None:
    layers = _layers()
    export_pole("south", layers, tmp_path, stride=STRIDE, pixel_m=238.56)
    expected = ramp_rgba(layers.pred, ICE_RAMP, 0, 1, ICE_ALPHA)
    got = _read_rgba(tmp_path / "pred.webp")
    assert np.array_equal(got[..., 3], expected[..., 3])  # transparency is exact
    visible = expected[..., 3] > 0
    diff = np.abs(got[visible][:, :3].astype(int) - expected[visible][:, :3].astype(int))
    assert diff.mean() <= MAX_MEAN_COLOUR_ERROR


def test_export_pole_encodes_pred_ref_lossy_and_others_lossless(tmp_path: Path) -> None:
    export_pole("south", _layers(), tmp_path, stride=STRIDE, pixel_m=238.56)
    for name in ("pred", "ref"):  # lossy with alpha = VP8X + ALPH + "VP8 " chunks
        data = (tmp_path / f"{name}.webp").read_bytes()
        assert b"VP8 " in data and b"VP8L" not in data, name
    for name in ("err", "psr", "test"):
        data = (tmp_path / f"{name}.webp").read_bytes()
        assert b"VP8L" in data and b"VP8 " not in data, name


def test_export_pole_does_not_mutate_layers(tmp_path: Path) -> None:
    layers = _layers()
    before = layers.pred.copy()
    export_pole("south", layers, tmp_path, stride=STRIDE, pixel_m=238.56)
    assert np.array_equal(layers.pred, before, equal_nan=True)
