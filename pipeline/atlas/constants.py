from pathlib import Path

MOON_RADIUS_M = 1_737_400.0
ICE_K0 = 0.994
FALSE_EASTING = 500_000.0
FALSE_NORTHING = 500_000.0
ICE_PIXEL_M = 238.56
PATCH_PX = 256
CAP_PATCHES = 10
CAP_PX = PATCH_PX * CAP_PATCHES
CAP_ORIGIN_X = 197_863.76
CAP_ORIGIN_Y = 802_136.24
CAP_EDGE_LAT_DEG = 80.0
MESH_STRIDE = 4
ERR_RANGE = 0.2
PSR_DIST_UNITS = "m"  # LPSR_DIS matches our own nearest-PSR distance in metres (ratio 1.006), 0 inside PSRs

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
ICE_DIR = DATA_DIR / "prospectivity_dataset"
PRED_DIR = DATA_DIR / "derived" / "pred_tiles"
PRED_SUFFIX = "_ASP_SIN_COS_pred.tif"
DEM_DIR = DATA_DIR / "dem"
SVS_DIR = DATA_DIR / "svs"
ARTEMIS_DIR = DATA_DIR / "artemis"
WEB_DATA_DIR = ROOT / "web" / "public" / "data"

MAP_PX = 1600
SOUTH_MAP_BOX = (214, 19, 2223, 2028)
BAND_LEVELS = (0.4, 0.6, 0.8)
HOTSPOT_PCT = 85.0
SMOOTH_KM = 4.8
TOPO_STEP_M = 500
TOPO_INDEX_M = 2000
