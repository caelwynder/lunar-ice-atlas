import math
from typing import Literal

import numpy as np
from numpy.typing import ArrayLike
from pyproj import CRS, Transformer

from atlas.constants import FALSE_EASTING, FALSE_NORTHING, ICE_K0, MOON_RADIUS_M

Pole = Literal["north", "south"]


def ice_crs(pole: Pole) -> CRS:
    lat0 = 90 if pole == "north" else -90
    return CRS.from_proj4(
        f"+proj=stere +lat_0={lat0} +lon_0=0 +k={ICE_K0} +x_0={FALSE_EASTING} "
        f"+y_0={FALSE_NORTHING} +R={MOON_RADIUS_M} +units=m +no_defs"
    )


def moon_lonlat() -> CRS:
    return CRS.from_proj4(f"+proj=longlat +R={MOON_RADIUS_M} +no_defs")


def _transformer(pole: Pole, inverse: bool) -> Transformer:
    src, dst = (ice_crs(pole), moon_lonlat()) if inverse else (moon_lonlat(), ice_crs(pole))
    return Transformer.from_crs(src, dst, always_xy=True)


def lonlat_to_ps(lon: ArrayLike, lat: ArrayLike, pole: Pole) -> tuple[np.ndarray, np.ndarray]:
    x, y = _transformer(pole, inverse=False).transform(lon, lat)
    return np.asarray(x), np.asarray(y)


def ps_to_lonlat(x: ArrayLike, y: ArrayLike, pole: Pole) -> tuple[np.ndarray, np.ndarray]:
    lon, lat = _transformer(pole, inverse=True).transform(x, y)
    return np.asarray(lon), np.asarray(lat)


def cap_rho_m(lat_deg: float) -> float:
    return 2 * MOON_RADIUS_M * ICE_K0 * math.tan(math.radians(45 - abs(lat_deg) / 2))
