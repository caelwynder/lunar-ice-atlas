import math

import numpy as np
import pytest

from atlas.constants import FALSE_EASTING as FE
from atlas.constants import FALSE_NORTHING as FN
from atlas.constants import ICE_K0
from atlas.constants import MOON_RADIUS_M as R
from atlas.crs import cap_rho_m, lonlat_to_ps, ps_to_lonlat


def rho(lat: float) -> float:
    return 2 * R * ICE_K0 * math.tan(math.radians(45 - abs(lat) / 2))


@pytest.mark.parametrize(("pole", "lat"), [("south", -90.0), ("north", 90.0)])
def test_pole_maps_to_false_origin(pole: str, lat: float) -> None:
    x, y = lonlat_to_ps(0.0, lat, pole)
    assert float(x) == pytest.approx(FE, abs=1e-6)
    assert float(y) == pytest.approx(FN, abs=1e-6)


def test_south_lon0_points_up_and_lon90_points_right() -> None:
    x0, y0 = lonlat_to_ps(0.0, -80.0, "south")
    x90, y90 = lonlat_to_ps(90.0, -80.0, "south")
    assert (float(x0), float(y0)) == pytest.approx((FE, FN + rho(-80)), abs=1e-3)
    assert (float(x90), float(y90)) == pytest.approx((FE + rho(-80), FN), abs=1e-3)


def test_north_lon0_points_down() -> None:
    x0, y0 = lonlat_to_ps(0.0, 80.0, "north")
    assert (float(x0), float(y0)) == pytest.approx((FE, FN - rho(80)), abs=1e-3)


def test_round_trip() -> None:
    lons, lats = np.array([10.0, -135.0, 170.0]), np.array([-84.2, -86.0, -89.5])
    x, y = lonlat_to_ps(lons, lats, "south")
    lon2, lat2 = ps_to_lonlat(x, y, "south")
    assert np.allclose(lon2, lons, atol=1e-9)
    assert np.allclose(lat2, lats, atol=1e-9)


def test_cap_rho_matches_grid_edge() -> None:
    assert cap_rho_m(80.0) == pytest.approx(rho(80.0))
    assert cap_rho_m(80.0) == pytest.approx(500_000 - 197_863.76, abs=60)  # grid starts at the 80° circle
