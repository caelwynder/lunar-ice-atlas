import json
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from PIL import Image

LO_WIDTH = 2048
JPEG_QUALITY = 85


def km_to_i16_m(km: np.ndarray) -> np.ndarray:
    return np.round(km.astype(np.float64) * 1000).astype("<i2")


def _color_jpegs(color_tif: Path, out_dir: Path) -> None:
    with rasterio.open(color_tif) as src:
        rgb = src.read([1, 2, 3])
    rgb8 = (rgb >> 8).astype(np.uint8) if rgb.dtype == np.uint16 else rgb.astype(np.uint8)
    img = Image.fromarray(np.moveaxis(rgb8, 0, -1), "RGB")
    img.save(out_dir / "color_4k.jpg", quality=JPEG_QUALITY)
    img.resize((LO_WIDTH, LO_WIDTH // 2), Image.Resampling.LANCZOS).save(out_dir / "color_2k.jpg", quality=JPEG_QUALITY)


def export_globe(ldem_tif: Path, color_tif: Path, out_dir: Path) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    with rasterio.open(ldem_tif) as src:
        km = src.read(1)
    km_to_i16_m(km).tofile(out_dir / "height.i16.bin")
    _color_jpegs(color_tif, out_dir)
    meta = {
        "version": 1,
        "height": {"file": "height.i16.bin", "width": int(km.shape[1]), "height": int(km.shape[0]), "units": "m"},
        "color": {"hi": "color_4k.jpg", "lo": "color_2k.jpg"},
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta
