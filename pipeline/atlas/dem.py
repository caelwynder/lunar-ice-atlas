from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from matplotlib.colors import LightSource
from pyproj import CRS
from rasterio.warp import Resampling, reproject

from atlas.tiles import Grid


def read_pds_dem(path: Path) -> tuple[np.ndarray, Affine, CRS]:
    with rasterio.open(path) as src:
        raw = src.read(1)
        heights = np.where(raw == src.nodata, np.nan, raw.astype(np.float32) * src.scales[0])
        return heights.astype(np.float32), src.transform, CRS.from_user_input(src.crs)


def to_grid(
    values: np.ndarray, transform: Affine, crs: CRS, grid: Grid, resampling: Resampling = Resampling.bilinear
) -> np.ndarray:
    out = np.full((grid.height, grid.width), np.nan, np.float32)
    reproject(
        values.astype(np.float32), out,
        src_transform=transform, src_crs=crs, src_nodata=np.nan,
        dst_transform=grid.transform, dst_crs=grid.crs, dst_nodata=np.nan,
        resampling=resampling,
    )
    return out


def slope_deg(z: np.ndarray, pixel_m: float) -> np.ndarray:
    gy, gx = np.gradient(z, pixel_m)
    return np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)


def hillshade(z: np.ndarray, pixel_m: float, azimuth_deg: float = 315, altitude_deg: float = 30) -> np.ndarray:
    filled = np.where(np.isnan(z), np.nanmean(z), z)
    shade = LightSource(azdeg=azimuth_deg, altdeg=altitude_deg).hillshade(filled, dx=pixel_m, dy=pixel_m)
    return np.round(shade * 255).astype(np.uint8)
