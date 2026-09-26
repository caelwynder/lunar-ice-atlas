import re
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from pyproj import CRS

from atlas.constants import CAP_ORIGIN_X, CAP_ORIGIN_Y, CAP_PX, ICE_PIXEL_M
from atlas.crs import Pole, ice_crs

PATCH_RE = re.compile(r"^(patch_\d{4}_\d{4}(?:_S)?_80[NS])_")
ALIGN_TOL_PX = 0.01


@dataclass(frozen=True)
class Grid:
    crs: CRS
    transform: Affine
    width: int
    height: int


def parse_patch_id(filename: str) -> str:
    match = PATCH_RE.match(filename)
    if match is None:
        raise ValueError(f"not a patch file: {filename}")
    return match.group(1)


def pole_of(patch_id: str) -> Pole:
    return "south" if patch_id.endswith("_80S") else "north"


def cap_grid(pole: Pole) -> Grid:
    transform = Affine(ICE_PIXEL_M, 0, CAP_ORIGIN_X, 0, -ICE_PIXEL_M, CAP_ORIGIN_Y)
    return Grid(ice_crs(pole), transform, CAP_PX, CAP_PX)


def patch_offset(tile_transform: Affine, grid: Grid) -> tuple[int, int]:
    if abs(tile_transform.a - grid.transform.a) > 1e-6:
        raise ValueError("pixel size differs from grid")
    col = (tile_transform.c - grid.transform.c) / grid.transform.a
    row = (tile_transform.f - grid.transform.f) / grid.transform.e
    r, c = round(row), round(col)
    if abs(row - r) > ALIGN_TOL_PX or abs(col - c) > ALIGN_TOL_PX:
        raise ValueError(f"tile not aligned to grid: row={row:.3f} col={col:.3f}")
    return r, c


def _read_masked(path: Path) -> tuple[np.ndarray, Affine]:
    with rasterio.open(path) as src:
        data = src.read(1).astype(np.float32)
        if src.nodata is not None and not np.isnan(src.nodata):
            data = np.where(data == src.nodata, np.nan, data)
        return data, src.transform


def _slot(path: Path, shape: tuple[int, int], transform: Affine, grid: Grid) -> tuple[slice, slice]:
    r, c = patch_offset(transform, grid)
    h, w = shape
    if r < 0 or c < 0 or r + h > grid.height or c + w > grid.width:
        raise ValueError(f"{path.name} falls outside the grid")
    return slice(r, r + h), slice(c, c + w)


def mosaic(paths: Iterable[Path], grid: Grid) -> np.ndarray:
    out = np.full((grid.height, grid.width), np.nan, np.float32)
    for path in paths:
        data, transform = _read_masked(path)
        out[_slot(path, data.shape, transform, grid)] = data
    return out


def footprint(paths: Iterable[Path], grid: Grid) -> np.ndarray:
    out = np.zeros((grid.height, grid.width), bool)
    for path in paths:
        with rasterio.open(path) as src:
            out[_slot(path, (src.height, src.width), src.transform, grid)] = True
    return out


def patch_files(directory: Path, suffix: str, pole: Pole) -> list[Path]:
    files = [p for p in sorted(directory.glob(f"patch_*{suffix}")) if pole_of(parse_patch_id(p.name)) == pole]
    if not files:
        raise FileNotFoundError(f"no *{suffix} files for {pole} in {directory}")
    return files
