"""Visual QA for the south cap: hillshade + predicted prospectivity + Artemis footprints + Shackleton."""

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import LinearSegmentedColormap

from atlas.build import pole_layers
from atlas.colorize import ICE_RAMP
from atlas.constants import ARTEMIS_DIR, FALSE_EASTING, FALSE_NORTHING, ICE_PIXEL_M
from atlas.crs import lonlat_to_ps
from atlas.dem import hillshade
from atlas.regions import load_regions, region_centroid
from atlas.tiles import cap_grid

SHACKLETON_LONLAT = (129.2, -89.67)
SHACKLETON_MAX_OFFSET_KM = 10.0
ZOOM_HALF_WIDTH_M = 200_000
OUT = Path(__file__).with_name("qa_south.png")


def main() -> None:
    layers = pole_layers("south")
    grid = cap_grid("south")
    x0, y0 = grid.transform.c, grid.transform.f
    extent = (x0, x0 + grid.width * ICE_PIXEL_M, y0 - grid.height * ICE_PIXEL_M, y0)

    fig, ax = plt.subplots(figsize=(10, 10), dpi=150)
    ax.imshow(hillshade(layers.dem, ICE_PIXEL_M), cmap="gray", extent=extent)
    ice = LinearSegmentedColormap.from_list("ice", ICE_RAMP)
    ax.imshow(np.ma.masked_invalid(layers.pred), cmap=ice, vmin=0, vmax=1, alpha=0.6, extent=extent)

    for region in load_regions(ARTEMIS_DIR):
        lon, lat = np.array(region.geometry.exterior.coords).T
        x, y = lonlat_to_ps(lon, lat, "south")
        ax.plot(x, y, color="#ffd23f", lw=1.2)
        cx, cy = lonlat_to_ps(*region_centroid(region, "south"), "south")
        ax.annotate(region.name, (float(cx), float(cy)), color="white", fontsize=7, ha="center",
                    xytext=(0, 14), textcoords="offset points")

    sx, sy = lonlat_to_ps(*SHACKLETON_LONLAT, "south")
    offset_km = float(np.hypot(sx - FALSE_EASTING, sy - FALSE_NORTHING)) / 1000
    ax.plot(sx, sy, "o", color="red", ms=6)
    ax.annotate(f"Shackleton ({offset_km:.1f} km from pole)", (float(sx), float(sy)), color="red", fontsize=8,
                xytext=(6, -12), textcoords="offset points")

    ax.set_xlim(FALSE_EASTING - ZOOM_HALF_WIDTH_M, FALSE_EASTING + ZOOM_HALF_WIDTH_M)
    ax.set_ylim(FALSE_NORTHING - ZOOM_HALF_WIDTH_M, FALSE_NORTHING + ZOOM_HALF_WIDTH_M)
    ax.set_title("South pole QA: hillshade + predicted prospectivity (alpha 0.6) + Artemis footprints")
    ax.set_xlabel("polar-stereographic x (m)")
    ax.set_ylabel("polar-stereographic y (m)")
    fig.savefig(OUT, bbox_inches="tight")

    status = "OK" if offset_km <= SHACKLETON_MAX_OFFSET_KM else "FAIL"
    print(f"Shackleton offset from grid centre: {offset_km:.2f} km ({status}); wrote {OUT}")


if __name__ == "__main__":
    main()
