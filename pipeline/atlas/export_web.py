import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from atlas.colorize import ERR_RAMP, ICE_RAMP, PSR_HEX, block_nanmean, quantize_u8, ramp_rgba, stripe_rgba
from atlas.constants import (
    CAP_EDGE_LAT_DEG,
    CAP_ORIGIN_X,
    CAP_ORIGIN_Y,
    ERR_RANGE,
    FALSE_EASTING,
    FALSE_NORTHING,
    ICE_K0,
    MOON_RADIUS_M,
)
from atlas.crs import Pole
from atlas.dem import hillshade

HEIGHT_NODATA = -32768
ICE_ALPHA = (90, 230)
ERR_ALPHA = (200, 200)
JPEG_QUALITY = 85
OVERLAY_EXT = "webp"
LOSSLESS: dict[str, Any] = {"lossless": True, "method": 6, "exact": True}
# pred/ref at q95: ~45% smaller, mean colour error ~2/255, alpha kept exact. Hover values come from *.u8.bin.
# err stays lossless: lossy encoding visibly shifted its red/blue edges (up to 112/255).
NEAR_LOSSLESS: dict[str, Any] = {"quality": 95, "alpha_quality": 100, "method": 6, "exact": True}
NEAR_LOSSLESS_LAYERS = frozenset({"pred", "ref"})
SEQ = {"kind": "sequential", "stops": list(ICE_RAMP), "min": 0, "max": 1}
DIV = {"kind": "diverging", "stops": list(ERR_RAMP), "min": -ERR_RANGE, "max": ERR_RANGE}


@dataclass(frozen=True)
class PoleLayers:
    dem: np.ndarray
    pred: np.ndarray
    ref: np.ndarray
    psr: np.ndarray
    test_mask: np.ndarray


def _outline(mask: np.ndarray) -> np.ndarray:
    inner = np.roll(mask, 1, 0) & np.roll(mask, -1, 0) & np.roll(mask, 1, 1) & np.roll(mask, -1, 1)
    return stripe_rgba(mask & ~inner, "#ffffff", period=2)


def _write_rasters(layers: PoleLayers, err: np.ndarray, out_dir: Path, pixel_m: float) -> None:
    Image.fromarray(hillshade(layers.dem, pixel_m), "L").save(out_dir / "hillshade.jpg", quality=JPEG_QUALITY)
    overlays = {
        "pred": ramp_rgba(layers.pred, ICE_RAMP, 0, 1, ICE_ALPHA),
        "ref": ramp_rgba(layers.ref, ICE_RAMP, 0, 1, ICE_ALPHA),
        "err": ramp_rgba(err, ERR_RAMP, -ERR_RANGE, ERR_RANGE, ERR_ALPHA),
        "psr": stripe_rgba(layers.psr > 0.5, PSR_HEX),
        "test": _outline(layers.test_mask),
    }
    for name, rgba in overlays.items():
        options = NEAR_LOSSLESS if name in NEAR_LOSSLESS_LAYERS else LOSSLESS
        Image.fromarray(rgba, "RGBA").save(out_dir / f"{name}.{OVERLAY_EXT}", **options)


def _write_values(out_dir: Path, id_: str, grid: np.ndarray, stride: int, vmin: float, vmax: float) -> dict[str, Any]:
    quantize_u8(block_nanmean(grid, stride), vmin, vmax).tofile(out_dir / f"{id_}.u8.bin")
    return {"file": f"{id_}.u8.bin", "min": vmin, "max": vmax}


def _layer(id_: str, label: str, legend: dict[str, Any], values: dict[str, Any] | None = None) -> dict[str, Any]:
    entry: dict[str, Any] = {"id": id_, "label": label, "texture": f"{id_}.{OVERLAY_EXT}", "legend": legend}
    return entry if values is None else {**entry, "values": values}


def _meta(pole: Pole, shape: tuple[int, ...], mesh_shape: tuple[int, ...], stride: int, pixel_m: float,
          layers: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "version": 1,
        "pole": pole,
        "crs": {"lat0": 90 if pole == "north" else -90, "k0": ICE_K0, "falseEasting": FALSE_EASTING,
                "falseNorthing": FALSE_NORTHING, "radius": MOON_RADIUS_M},
        "grid": {"x0": CAP_ORIGIN_X, "y0": CAP_ORIGIN_Y, "pixelSize": pixel_m, "width": shape[1], "height": shape[0]},
        "mesh": {"file": "height.i16.bin", "width": mesh_shape[1], "height": mesh_shape[0], "stride": stride,
                 "units": "m"},
        "base": {"file": "hillshade.jpg"},
        "edgeLatDeg": CAP_EDGE_LAT_DEG,
        "layers": layers,
    }


def export_pole(pole: Pole, layers: PoleLayers, out_dir: Path, stride: int, pixel_m: float) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    err = layers.pred - layers.ref
    mesh = block_nanmean(layers.dem, stride)
    np.where(np.isnan(mesh), HEIGHT_NODATA, np.round(mesh)).astype("<i2").tofile(out_dir / "height.i16.bin")
    _write_rasters(layers, err, out_dir, pixel_m)
    layer_meta = [
        _layer("pred", "Predicted ice prospectivity (NI-LFM)", SEQ,
               _write_values(out_dir, "pred", layers.pred, stride, 0, 1)),
        _layer("ref", "Reference prospectivity (SomBench label)", SEQ,
               _write_values(out_dir, "ref", layers.ref, stride, 0, 1)),
        _layer("err", "Model − reference", DIV,
               _write_values(out_dir, "err", err, stride, -ERR_RANGE, ERR_RANGE)),
        _layer("psr", "Permanently shadowed regions", {"kind": "binary", "stops": [PSR_HEX]}),
        _layer("test", "Held-out test patches", {"kind": "outline", "stops": ["#ffffff"]}),
    ]
    meta = _meta(pole, layers.dem.shape, mesh.shape, stride, pixel_m, layer_meta)
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta
