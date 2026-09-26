import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image

from atlas.globe_assets import export_globe, km_to_i16_m


def test_km_to_i16_m_rounds_and_keeps_sign() -> None:
    out = km_to_i16_m(np.array([[-9.1234, 0.0, 10.7599]], np.float32))
    assert out.dtype == np.dtype("<i2")
    assert out.tolist() == [[-9123, 0, 10760]]


def _write_raster(path: Path, arr: np.ndarray) -> Path:
    with rasterio.open(path, "w", driver="GTiff", width=arr.shape[2], height=arr.shape[1], count=arr.shape[0],
                       dtype=str(arr.dtype)) as dst:
        dst.write(arr)
    return path


def test_export_globe_writes_height_bin_jpegs_and_meta(tmp_path: Path) -> None:
    km = np.linspace(-9, 10, 8 * 4, dtype=np.float32).reshape(1, 4, 8)
    rgb = np.full((3, 16, 32), 0x8000, np.uint16)
    ldem = _write_raster(tmp_path / "ldem.tif", km)
    color = _write_raster(tmp_path / "color.tif", rgb)

    meta = export_globe(ldem, color, tmp_path / "globe")

    out = tmp_path / "globe"
    assert meta["height"] == {"file": "height.i16.bin", "width": 8, "height": 4, "units": "m"}
    assert json.loads((out / "meta.json").read_text()) == meta
    heights = np.fromfile(out / "height.i16.bin", "<i2").reshape(4, 8)
    assert heights[0, 0] == -9000 and heights[-1, -1] == 10000
    assert Image.open(out / "color_4k.jpg").size == (32, 16)
    assert Image.open(out / "color_2k.jpg").size == (2048, 1024)
    assert Image.open(out / "color_4k.jpg").getpixel((0, 0))[0] in range(126, 131)
