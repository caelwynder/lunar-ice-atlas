# Lunar Ice Atlas (P1) + Artemis Region Explorer (P3): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static website with an interactive 3D Moon. It shows NASA-IBM Lunar Foundation Model ice-prospectivity predictions for both poles, draped over real LOLA elevation, and lets visitors compare the nine Artemis south-pole candidate landing regions.

**Architecture:** There are two parts.
- An **offline Python pipeline** (CPU only). It runs the fine-tuned ice checkpoint over all 162 SomBench polar patches, mosaics the results onto a 10×10-patch polar-stereographic "cap grid" per pole, reprojects the PDS 240 m LOLA DEM onto the same grid, computes per-region statistics, and exports small web assets (int16 heights, RGBA PNG overlays, uint8 value grids, JSON).
- A **Three.js + Vite + TypeScript** static front end. It renders a displaced, textured globe up to ±80.3° plus two polar-cap meshes built directly on the cap grid, so model outputs are drawn pixel-exact without being resampled.

**Tech Stack:**
- Python 3.12 (conda env `ni-lfm`): `ni_lfm` + `terratorch` 1.2.x, torch (CPU), rasterio, pyproj, shapely, pyogrio, matplotlib, pillow, pytest, ruff, mypy.
- Node 24 LTS: three 0.186.1, vite 8.3.1, vitest 5.0.1, typescript 5.9.3, eslint 10 + typescript-eslint 8.70.1, prettier 3.9.9, @playwright/test 1.63.0, jsdom (DOM unit tests).

**Spec:** `RESEARCH.md` (§7 MVP, §6 P3), extended by the "Research addendum" below. Where the addendum and RESEARCH.md disagree, the addendum wins; RESEARCH.md is frozen and is not edited.

## Global Constraints

- **No GPU.** Every step must run on the M1 Pro CPU (`--trainer.accelerator cpu`). MPS is off-limits unless the user asks.
- Python **3.12** only (`ni_lfm` requires `>=3.11,<3.13`; the system Python is 3.13).
- Node **≥ 22.12** (Vite 8 and Vitest 5 engines). Use Node **24 LTS**. The machine currently has v19.3.0, which is too old.
- TypeScript **5.9.3**, not 7.x (typescript-eslint 8.70.1 supports `<6.1.0`).
- Moon model everywhere: sphere **R = 1,737,400 m**. Heights are metres above R.
- Ice grid CRS: `+proj=stere +lat_0=±90 +lon_0=0 +k=0.994 +x_0=500000 +y_0=500000 +R=1737400 +units=m +no_defs`, pixel **238.56 m**.
- Never assume two rasters share a grid; always `rasterio.warp.reproject`.
- UI copy must say **"ice prospectivity"**, never "ice detected". Show both model-card caveats and the credits (NASA SVS, NASA GSFC, NASA/IBM, SomBench CC-BY-4.0, PDS, USGS).
- **Ask the user before every `git commit`** (their global CLAUDE.md rule). Commit steps below mean "propose the message, wait for approval, then commit".
- TDD: write the failing test first, see it fail, then implement. Run tests, typecheck and lint before calling a task done.
- Immutability: functions return new arrays or objects. Local buffers are allowed, but inputs are never mutated.
- Files stay under 400 lines and functions under 50 lines. No `console.log` in committed web code.
- Web payload budget: **≤ 40 MB total** for `web/dist`.

---

## Research addendum (2026-09-24, beyond RESEARCH.md)

Each fact below was verified this session. The evidence is in parentheses.

1. **Inference path.** `terratorch predict` with the HF ice `config.yaml` predicts **every** patch in `predict_data_root` (162 = 81 per pole, including the 6 corner patches the split lists drop). It copies the geotransform/CRS from the first modality file (`*_ASP_SIN_COS.tif`), writes `<input>_pred.tif`, and honours `out_dtype: float32` (set in the config). Without that setting the default `int16` would truncate 0–1 values to 0. NaN inputs are replaced by `no_data_replace: 0`, so predictions outside the 80° circle are meaningless and **must be masked where the `PRO` label is NaN**. (terratorch v1.2.13 `cli_tools.py` `save_prediction`/`CustomWriter`; HF `config.yaml` lines 12, 82–83.)
2. **CLI pitfalls.** The config sets `accelerator: gpu`, `backbone_checkpoint_path: backbone/checkpoint.pt` (2.4 GB) and `custom_modules_path: terratorch_integration` (relative; `import_custom_modules` raises `ValueError` if that directory isn't beside the CWD). Override all three.
3. **Grid geometry.**
   - Patch (r, c) origin = (197,863.76 + c·61,071.36, 802,136.24 − r·61,071.36).
   - The shipped 9×9 grid covers **91.0%** of each ≥80° cap and **100%** of the ≥85° cap. The uncovered ≈55 km crescent lies on the +x/−y side.
   - A **10×10 "cap grid"** (2,560 px, same origin and pixel) covers the whole ≥80° disk, so the DEM fills it and the model layers are NaN in the crescent.
   - `PRO` is NaN outside the 80° circle; `SLOPE` is valid everywhere in the square.
4. **DEM alignment proven.** `rasterio` opens PDS `ldem_75s_240m.lbl` natively (driver PDS, CRS `+proj=stere +lat_0=-90 +R=1737400`, `scales=(0.5,)`, nodata −32768, `offsets=(1737400,)` = radius, **don't add it**). Reprojecting onto three ice patches and computing slope gives **r = 0.997–0.999** against the dataset's `SLOPE` layer (a flipped grid gives r ≈ 0). This becomes a regression test.
5. **Layer stats** (`band_statistics.json`): PRO mean 0.446; SLOPE in degrees (mean 8.4°); LPSR binary (mean 0.06); TMAX in kelvin (mean 228 K). The units of `LPSR_DIS` are `UNVERIFIED`; Task 7 records them from the data.
6. **Artemis status changed.**
   - On **2026-02-27** NASA made Artemis III (2027) a low-Earth-orbit test, and **Artemis IV (early 2028) is the first crewed landing** (https://www.nasa.gov/news-release/nasa-adds-mission-to-artemis-lunar-program-updates-architecture/).
   - NASA's Artemis IV page says "NASA has identified nine candidate landing regions near the lunar South Pole" (https://www.nasa.gov/mission/artemis-iv/).
   - The regions were announced 2024-10-28 for Artemis III: Peak near Cabeus B, Haworth, Malapert Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1, Nobile Rim 2, de Gerlache Rim 2, Slater Plain.
   - An LPSC 2026 abstract (#1901, written pre-restructure) calls them Artemis III-specific (https://www.hou.usra.edu/meetings/lpsc2026/pdf/1901.pdf).
   - **UI copy:** "nine Artemis candidate landing regions (announced Oct 2024 for Artemis III; the first crewed landing is now Artemis IV, early 2028)".
7. **Region geometry source.** USGS "Down Selected Artemis III Candidate Landing Site Navigational Grids", DOI **10.5066/P1MEQ6UK**, CC0, shapefiles in LTM/LPS, including the region boundaries (https://www.usgs.gov/data/down-selected-artemis-iii-candidate-landing-site-navigational-grids). ScienceBase item `671a6fa8d34efed5620f89f8` sits behind a **Cloudflare challenge**, so scripted downloads fail and the user must download it once in a browser. Fallback: Cesium ion asset 2683531 via the user's free ion token. **Never hand-type coordinates.**
8. **Landing-slope thresholds:** 0–8° threshold, 0–5° goal for the HLS (https://arxiv.org/pdf/2406.19863). Our slope is on a 240 m baseline, which is smoother than lander scale; the UI must say so.
9. **Colour ramps** (validated with the dataviz skill's `validate_palette.js` on the dark surface `#1a1a19`; all checks PASS):
   - Ice sequential (0→1): `#184f95 #256abf #3987e5 #6da7ec #9ec5f4 #cde2fb`
   - Error diverging (−0.2 → +0.2): `#f4b3b0 #e66767 #9a2c2b | #383835 | #184f95 #3987e5 #9ec5f4` (red = model under-predicts, blue = over-predicts, grey midpoint; each arm validated as an ordinal ramp)
   - PSR: `#9ec5f4` with a 45° stripe texture as secondary encoding
10. **Toolchain versions (2026-09-24):**
    - npm: three 0.186.1, vite 8.3.1, vitest 5.0.1, typescript 7.0.2 (don't use; see constraints), typescript-eslint 8.70.1, @playwright/test 1.63.0.
    - PyPI: pytest 9.1.1, ruff 0.16.9, mypy 2.3.1, huggingface-hub 2.0.0 (`ni_lfm` pins `<2`, so pip resolves 1.x, which still ships the `hf` CLI).

---

## File structure

```
NASA_proj/
├── RESEARCH.md                  # frozen spec (do not edit)
├── plan.md                      # this file
├── CLAUDE.md
├── .gitignore
├── pyproject.toml               # pipeline package "atlas" + pytest/ruff/mypy config
├── docs/benchmarks.md           # M0 + prediction timings, RMSE, web perf numbers
├── scripts/
│   ├── fetch_data.sh            # HF + PDS + SVS downloads (idempotent)
│   ├── m0_benchmark.sh          # CPU eval on 25 test patches, timed
│   └── predict_all.sh           # CPU predict on all 162 patches
├── pipeline/
│   ├── atlas/
│   │   ├── __init__.py
│   │   ├── constants.py         # radius, CRS params, grid constants, paths
│   │   ├── crs.py               # ice_crs(), lonlat_to_ps(), ps_to_lonlat(), cap_rho_m()
│   │   ├── tiles.py             # patch ids, Grid, cap_grid(), patch_offset(), mosaic(), footprint()
│   │   ├── dem.py               # read_pds_dem(), to_grid(), slope_deg(), hillshade()
│   │   ├── colorize.py          # ramps, ramp_rgba(), stripe_rgba(), quantize_u8(), block_nanmean()
│   │   ├── regions.py           # Region, StatLayers, load_regions(), region_mask(), region_stats()
│   │   ├── globe_assets.py      # SVS ldem_4 → int16 bin, LROC tif → jpg
│   │   ├── export_web.py        # PoleLayers, export_pole() → files + meta dict
│   │   ├── fixtures.py          # writes PS fixture JSON for the web tests
│   │   └── build.py             # CLI: python -m atlas.build {globe|north|south|regions|all}
│   └── tests/
│       ├── conftest.py          # synthetic GeoTIFF factory, data-marker skip logic
│       └── test_{smoke,crs,tiles,dem,colorize,export_web,regions,globe_assets}.py
├── web/
│   ├── package.json, tsconfig.json, vite.config.ts, eslint.config.js, playwright.config.ts
│   ├── index.html
│   ├── public/data/             # generated by the pipeline (committed: web-ready only)
│   │   ├── globe/{height.i16.bin, color_4k.jpg, color_2k.jpg, meta.json}
│   │   ├── north/{height.i16.bin, hillshade.jpg, pred.png, ref.png, err.png, psr.png, test.png,
│   │   │          pred.u8.bin, ref.u8.bin, err.u8.bin, meta.json}
│   │   ├── south/…same…
│   │   └── regions.json
│   ├── src/
│   │   ├── main.ts              # bootstrap: load data, build scene, mount UI
│   │   ├── geo/{constants.ts, polarStereo.ts, sphere.ts, __fixtures__/ps_points.json}
│   │   ├── data/{schema.ts, regionsSchema.ts, grid.ts, load.ts}
│   │   ├── scene/{globeGeometry.ts, capGeometry.ts, scene.ts, picking.ts}
│   │   ├── ui/{layers.ts, legend.ts, readout.ts, about.ts, regions.ts, regionChart.ts, styles.css}
│   │   └── **/*.test.ts         # vitest, co-located
│   └── e2e/atlas.spec.ts        # playwright smoke + interaction
├── .github/workflows/pages.yml  # build + deploy (Task 15)
└── (gitignored) vendor/ni-lfm, models/, backbone/, data/, tb_logs/, notebooks/*.png
```

---

### Task 0: Toolchain and repo bootstrap

**Files:**
- Create: `.gitignore`, `pyproject.toml`, `pipeline/atlas/__init__.py`, `pipeline/tests/conftest.py`, `pipeline/tests/test_smoke.py`

**Interfaces:**
- Produces: conda env `ni-lfm` with `atlas` importable; pytest markers `data` (needs downloaded data) and `slow`; fixture `write_tif(name, arr, transform, crs, nodata=None) -> Path`.

- [x] **Step 1: Ask the user** whether to `git init` here and how to install Node 24:
  - `brew install node@24`
  - or `conda install -n ni-lfm -c conda-forge nodejs=24`

  Record the choice in CLAUDE.md → Commands.

- [x] **Step 2: Create the env and install**

```bash
cd ~/NASA_proj
conda create -n ni-lfm python=3.12 -y
conda activate ni-lfm
git clone --depth 1 https://github.com/NASA-IMPACT/NASA-IBM-Lunar-Foundation-Model vendor/ni-lfm
pip install -e vendor/ni-lfm
pip install pyproj shapely pyogrio "pytest>=9" "ruff>=0.16" "mypy>=2.3"
python -c "import ni_lfm, terratorch_integration, torch; print(torch.__version__)"
```
Expected: torch 2.12+ prints with no ImportError.

- [x] **Step 3: Write `.gitignore`**

```gitignore
vendor/
models/
backbone/
data/
tb_logs/
lightning_logs/
notebooks/*.png
__pycache__/
.pytest_cache/
.mypy_cache/
.ruff_cache/
web/node_modules/
web/dist/
web/test-results/
web/playwright-report/
.DS_Store
```

- [x] **Step 4: Write `pyproject.toml`**, then run `pip install -e .`

```toml
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[project]
name = "atlas"
version = "0.1.0"
requires-python = ">=3.12,<3.13"

[tool.setuptools]
package-dir = {"" = "pipeline"}
packages = ["atlas"]

[tool.pytest.ini_options]
testpaths = ["pipeline/tests"]
markers = [
  "data: needs files downloaded by scripts/fetch_data.sh",
  "slow: runs the model",
]

[tool.ruff]
line-length = 120
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "SIM", "N"]

[tool.mypy]
python_version = "3.12"
ignore_missing_imports = true
disallow_untyped_defs = true
files = ["pipeline/atlas"]
```

- [x] **Step 5: Write `pipeline/atlas/__init__.py`** (empty) and `pipeline/tests/conftest.py`

```python
from collections.abc import Callable
from pathlib import Path

import numpy as np
import pytest
import rasterio
from affine import Affine

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"

WriteTif = Callable[..., Path]


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if (DATA / "prospectivity_dataset").is_dir():
        return
    skip = pytest.mark.skip(reason="run scripts/fetch_data.sh first")
    for item in items:
        if "data" in item.keywords:
            item.add_marker(skip)


@pytest.fixture
def write_tif(tmp_path: Path) -> WriteTif:
    def _write(name: str, arr: np.ndarray, transform: Affine, crs: str, nodata: float | None = None) -> Path:
        path = tmp_path / name
        with rasterio.open(
            path, "w", driver="GTiff", width=arr.shape[1], height=arr.shape[0], count=1,
            dtype=str(arr.dtype), crs=crs, transform=transform, nodata=nodata,
        ) as dst:
            dst.write(arr, 1)
        return path

    return _write
```

- [x] **Step 6: Smoke test.** Write `pipeline/tests/test_smoke.py`:

```python
import atlas


def test_package_imports() -> None:
    assert atlas.__name__ == "atlas"
```
Run: `pytest -q && ruff check pipeline && mypy`. Expected: `1 passed`, lint clean.

- [x] **Step 7: Commit (ask first).** `chore: bootstrap pipeline package and tooling`

---

### Task 1: Data fetch and M0 CPU benchmark (go/no-go gate)

**Files:**
- Create: `scripts/fetch_data.sh`, `scripts/m0_benchmark.sh`, `docs/benchmarks.md`

**Interfaces:**
- Produces:
  - `models/ice/{config.yaml, ni_lfm_ps8_all_modalities_s42.ckpt}` and `backbone/config.yaml`
  - `data/prospectivity_dataset/*` (162 patches × 11 layers + split lists + `band_statistics.json`)
  - `data/dem/ldem_75{n,s}_240m.{lbl,img}`
  - `data/svs/{ldem_4.tif, lroc_color_16bit_srgb_4k.tif}`
  - the verified CLI flag set that Task 3 reuses

- [x] **Step 1: Write `scripts/fetch_data.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

hf download nasa-ibm-ai4science/Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model --local-dir models/ice
hf download nasa-ibm-ai4science/NASA-IBM-Lunar-Foundation-Model backbone/config.yaml --local-dir .
hf download nasa-ibm-ai4science/Sombench-Ice-Prospectivity-Regression --repo-type dataset \
  --local-dir data/prospectivity_dataset

PDS=https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img
SVS=https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720
mkdir -p data/dem data/svs
fetch() { [ -s "$2" ] || curl -fL -A "Mozilla/5.0" --retry 3 -o "$2" "$1"; }
for p in n s; do
  for ext in lbl img; do fetch "$PDS/ldem_75${p}_240m.$ext" "data/dem/ldem_75${p}_240m.$ext"; done
done
fetch "$SVS/ldem_4.tif" data/svs/ldem_4.tif
fetch "$SVS/lroc_color_16bit_srgb_4k.tif" data/svs/lroc_color_16bit_srgb_4k.tif

count=$(ls data/prospectivity_dataset/*_PRO.tif | wc -l | tr -d ' ')
[ "$count" -eq 162 ] || { echo "expected 162 PRO tiles, got $count" >&2; exit 1; }
echo "fetch OK"
```
Run: `bash scripts/fetch_data.sh`. Expected: `fetch OK` (~2.2 GB total).

- [x] **Step 2: Write `scripts/m0_benchmark.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
START=$(date +%s)
terratorch test -c models/ice/config.yaml \
  --ckpt_path models/ice/ni_lfm_ps8_all_modalities_s42.ckpt \
  --custom_modules_path vendor/ni-lfm/terratorch_integration \
  --trainer.accelerator cpu \
  --trainer.devices 1 \
  --model.init_args.model_args.backbone_checkpoint_path null 2>&1 | tee data/m0_test.log
END=$(date +%s)
echo "elapsed_s=$((END-START)) patches=25" | tee -a data/m0_test.log
```

- [x] **Step 3: Run it.** `bash scripts/m0_benchmark.sh`.
  - If jsonargparse rejects `backbone_checkpoint_path null`: run `hf download nasa-ibm-ai4science/NASA-IBM-Lunar-Foundation-Model backbone/checkpoint.pt --local-dir .` (2.4 GB), remove that flag, and re-run. The fine-tuned checkpoint's weights overwrite the backbone.
  - If `--custom_modules_path` is rejected: run the command from `vendor/ni-lfm` with absolute overrides (`--data.init_args.{train,val,test,predict}_data_root`, `…_label_data_root`, `…_split`) pointing at `~/NASA_proj/data/prospectivity_dataset`.
  - Update both scripts to the flag set that worked. Task 3 reuses it.

- [x] **Step 4: Gate.** ✅ **Result (2026-09-24): PASS**: RMSE 0.0277, R² 0.990, ≈5.8 s/patch, 5.1 GB peak RAM (see `docs/benchmarks.md`). The working flag set is `scripts/cpu_config.sh` plus the downloaded `backbone/checkpoint.pt`, because the ckpt's saved hparams override any config edit. Record in `docs/benchmarks.md`: test RMSE, MAE, R², elapsed seconds, seconds per patch, peak RAM (Activity Monitor), torch/terratorch versions, and the flag set used.
  - **PASS:** RMSE ≤ 0.035 (card: 0.0293 ± 0.0013) **and** ≤ 30 s/patch.
  - **FAIL on accuracy:** stop and re-plan (likely wrong modalities or normalisation).
  - **FAIL on speed only:** tell the user, then run Task 3 once on free Colab and copy `data/derived/pred_tiles` back.

- [x] **Step 5: Commit (ask first).** `chore: add data fetch and M0 CPU benchmark`

---

### Task 2: Lunar CRS helpers + web fixtures

**Files:**
- Create: `pipeline/atlas/constants.py`, `pipeline/atlas/crs.py`, `pipeline/atlas/fixtures.py`, `pipeline/tests/test_crs.py`

**Interfaces:**
- Produces:
  - `Pole = Literal["north", "south"]`
  - `ice_crs(pole: Pole) -> pyproj.CRS`
  - `moon_lonlat() -> pyproj.CRS`
  - `lonlat_to_ps(lon, lat, pole) -> tuple[np.ndarray, np.ndarray]`
  - `ps_to_lonlat(x, y, pole) -> tuple[np.ndarray, np.ndarray]`
  - `cap_rho_m(lat_deg: float) -> float`
  - `write_ps_fixtures(path: Path) -> None`
  - All constants in `constants.py` (below)

- [x] **Step 1: Write the failing tests** `pipeline/tests/test_crs.py`

```python
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
```

- [x] **Step 2: Run the tests.** `pytest pipeline/tests/test_crs.py -q`. Expected: FAIL with `ModuleNotFoundError: No module named 'atlas.constants'`.

- [x] **Step 3: Implement `constants.py`**

```python
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

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
ICE_DIR = DATA_DIR / "prospectivity_dataset"
PRED_DIR = DATA_DIR / "derived" / "pred_tiles"
PRED_SUFFIX = "_ASP_SIN_COS_pred.tif"
DEM_DIR = DATA_DIR / "dem"
SVS_DIR = DATA_DIR / "svs"
ARTEMIS_DIR = DATA_DIR / "artemis"
WEB_DATA_DIR = ROOT / "web" / "public" / "data"
```

- [x] **Step 4: Implement `crs.py`**

```python
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
```

- [x] **Step 5: Run the tests.** `pytest pipeline/tests/test_crs.py -q`. Expected: `6 passed`. If `test_south_lon0_points_up_and_lon90_points_right` fails, **stop**: the orientation assumption is wrong, and the web math in Task 9 depends on it.

- [x] **Step 6: Implement `fixtures.py`** (web tests compare against pyproj) and run it

```python
import json
from pathlib import Path

from atlas.constants import ROOT
from atlas.crs import Pole, lonlat_to_ps

POINTS: list[tuple[Pole, float, float]] = [
    ("south", -90.0, 0.0), ("south", -80.0, 0.0), ("south", -84.2, 60.7), ("south", -87.5, -150.0),
    ("north", 90.0, 0.0), ("north", 80.0, 0.0), ("north", 85.0, 120.0), ("north", 82.0, -45.0),
]
FIXTURE_PATH = ROOT / "web" / "src" / "geo" / "__fixtures__" / "ps_points.json"


def write_ps_fixtures(path: Path) -> None:
    rows = []
    for pole, lat, lon in POINTS:
        x, y = lonlat_to_ps(lon, lat, pole)
        rows.append({"pole": pole, "lat": lat, "lon": lon, "x": float(x), "y": float(y)})
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, indent=2))


if __name__ == "__main__":
    write_ps_fixtures(FIXTURE_PATH)
```
Run: `python -m atlas.fixtures && head -8 web/src/geo/__fixtures__/ps_points.json`. Expected: a JSON array of 8 rows.

- [x] **Step 7:** Run `ruff check pipeline && mypy`, then **commit (ask first)**: `feat(pipeline): lunar polar-stereographic CRS helpers and web fixtures`

---

### Task 3: Run inference on all 162 patches and verify it

**Files:**
- Create: `pipeline/atlas/tiles.py` (the parsing part), `pipeline/tests/test_tiles.py` (the parsing + prediction checks), `scripts/predict_all.sh`

**Interfaces:**
- Produces:
  - `PATCH_RE`
  - `parse_patch_id(filename: str) -> str` (e.g. `"patch_0004_0004_S_80S"`)
  - `pole_of(patch_id: str) -> Pole`
  - `data/derived/pred_tiles/<patch_id>_ASP_SIN_COS_pred.tif` (162 files, float32)

- [x] **Step 1: Write the failing tests** `pipeline/tests/test_tiles.py`

```python
import pytest

from atlas.tiles import parse_patch_id, pole_of


@pytest.mark.parametrize(("name", "pid"), [
    ("patch_0004_0004_S_80S_ASP_SIN_COS_pred.tif", "patch_0004_0004_S_80S"),
    ("patch_0000_0003_80N_PRO.tif", "patch_0000_0003_80N"),
])
def test_parse_patch_id(name: str, pid: str) -> None:
    assert parse_patch_id(name) == pid


def test_parse_rejects_garbage() -> None:
    with pytest.raises(ValueError, match="not a patch file"):
        parse_patch_id("README.md")


def test_pole_of() -> None:
    assert pole_of("patch_0001_0002_S_80S") == "south"
    assert pole_of("patch_0001_0002_80N") == "north"
```

- [x] **Step 2: Run them.** `pytest pipeline/tests/test_tiles.py -q`. Expected: FAIL (`No module named 'atlas.tiles'`).

- [x] **Step 3: Implement the top of `tiles.py`**

```python
import re

from atlas.crs import Pole

PATCH_RE = re.compile(r"^(patch_\d{4}_\d{4}(?:_S)?_80[NS])_")


def parse_patch_id(filename: str) -> str:
    match = PATCH_RE.match(filename)
    if match is None:
        raise ValueError(f"not a patch file: {filename}")
    return match.group(1)


def pole_of(patch_id: str) -> Pole:
    return "south" if patch_id.endswith("_80S") else "north"
```

- [x] **Step 4: Run the tests.** Expected: `4 passed`.

- [x] **Step 5: Write `scripts/predict_all.sh`**, using the flag set verified in Task 1, then run it

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/derived/pred_tiles
source scripts/cpu_config.sh
time terratorch predict -c "$CPU_CONFIG" \
  --ckpt_path models/ice/ni_lfm_ps8_all_modalities_s42.ckpt \
  --trainer.devices 1 \
  --predict_output_dir data/derived/pred_tiles
ls data/derived/pred_tiles/*_pred.tif | wc -l
```
Expected: `162`. Runtime ≈ 162 × (s/patch from M0). If the suffix `ls` shows isn't `_ASP_SIN_COS_pred.tif`, change `PRED_SUFFIX` in `constants.py` to match.

- [x] **Step 6: Verify the outputs.** ✅ 162 files; test RMSE 0.0277 (= M0); 13.4 min total. See `docs/benchmarks.md` and `docs/task-3-explained.md`. Append to `test_tiles.py` and run `pytest -m data -q pipeline/tests/test_tiles.py`:

```python
import numpy as np
import rasterio

from atlas.constants import ICE_DIR, PRED_DIR, PRED_SUFFIX


@pytest.mark.data
def test_predictions_are_georeferenced_float_in_range() -> None:
    preds = sorted(PRED_DIR.glob(f"*{PRED_SUFFIX}"))
    assert len(preds) == 162
    for p in preds[::20]:
        pid = parse_patch_id(p.name)
        with rasterio.open(p) as src, rasterio.open(ICE_DIR / f"{pid}_PRO.tif") as ref:
            assert src.dtypes[0] == "float32"
            assert src.transform.almost_equals(ref.transform)
            assert src.crs == ref.crs
            pred, label = src.read(1), ref.read(1)
        valid = ~np.isnan(label)
        assert pred[valid].min() > -0.1
        assert pred[valid].max() < 1.1


@pytest.mark.data
def test_test_split_rmse_matches_card() -> None:
    ids = (ICE_DIR / "test_filtered.txt").read_text().split()
    errs = []
    for pid in ids:
        with rasterio.open(PRED_DIR / f"{pid}{PRED_SUFFIX}") as s, rasterio.open(ICE_DIR / f"{pid}_PRO.tif") as r:
            pred, label = s.read(1), r.read(1)
        valid = ~np.isnan(label)
        errs.append(pred[valid] - label[valid])
    rmse = float(np.sqrt(np.mean(np.concatenate(errs) ** 2)))
    assert rmse <= 0.035, rmse
```
Expected: `2 passed`. If the RMSE check fails here but passed in M0, predict-time and test-time transforms differ: **stop and investigate**; don't loosen the threshold.

- [x] **Step 7:** Record the prediction runtime and the RMSE from this test in `docs/benchmarks.md`, then **commit (ask first)**: `feat(pipeline): run ice model over all polar patches`

---

### Task 4: Cap grid, mosaic, patch footprints

**Files:**
- Modify: `pipeline/atlas/tiles.py` (append)
- Test: `pipeline/tests/test_tiles.py` (append)

**Interfaces:**
- Consumes: constants and `ice_crs` (Task 2), `parse_patch_id` and `pole_of` (Task 3).
- Produces:
  - `@dataclass(frozen=True) Grid(crs: CRS, transform: Affine, width: int, height: int)`
  - `cap_grid(pole: Pole) -> Grid`
  - `patch_offset(tile_transform: Affine, grid: Grid) -> tuple[int, int]`
  - `mosaic(paths: Iterable[Path], grid: Grid) -> np.ndarray` (float32, NaN outside tiles)
  - `footprint(paths: Iterable[Path], grid: Grid) -> np.ndarray` (bool, True where any listed tile lies)
  - `patch_files(directory: Path, suffix: str, pole: Pole) -> list[Path]`

- [x] **Step 1: Write the failing tests** (append)

```python
from affine import Affine

from atlas.constants import CAP_ORIGIN_X, CAP_ORIGIN_Y, CAP_PX, ICE_PIXEL_M
from atlas.crs import ice_crs
from atlas.tiles import Grid, cap_grid, footprint, mosaic, patch_offset

SOUTH = ice_crs("south").to_proj4()
PX = ICE_PIXEL_M


def _small_grid() -> Grid:
    return Grid(ice_crs("south"), Affine(PX, 0, 0, 0, -PX, 8 * PX), 8, 8)


def test_cap_grid_covers_full_80deg_disk() -> None:
    g = cap_grid("south")
    assert (g.width, g.height) == (CAP_PX, CAP_PX)
    assert g.transform.c + g.width * g.transform.a >= 802_136
    assert g.transform.f + g.height * g.transform.e <= 197_864


def test_patch_offset_exact_and_rejects_misaligned() -> None:
    g = cap_grid("south")
    t = Affine(PX, 0, CAP_ORIGIN_X + 3 * 256 * PX, 0, -PX, CAP_ORIGIN_Y - 2 * 256 * PX)
    assert patch_offset(t, g) == (512, 768)
    with pytest.raises(ValueError, match="not aligned"):
        patch_offset(Affine(PX, 0, t.c + 0.3 * PX, 0, -PX, t.f), g)


def test_mosaic_places_tiles_and_leaves_nan(write_tif) -> None:
    a = write_tif("a.tif", np.ones((4, 4), np.float32), Affine(PX, 0, 0, 0, -PX, 8 * PX), SOUTH)
    b = write_tif("b.tif", np.full((4, 4), 2, np.float32), Affine(PX, 0, 4 * PX, 0, -PX, 4 * PX), SOUTH, nodata=-1)
    out = mosaic([a, b], _small_grid())
    assert np.all(out[:4, :4] == 1)
    assert np.all(out[4:, 4:] == 2)
    assert np.isnan(out[:4, 4:]).all()
    assert np.isnan(out[4:, :4]).all()


def test_footprint_marks_tile_extent_even_where_values_are_nan(write_tif) -> None:
    a = write_tif("a.tif", np.full((4, 4), np.nan, np.float32), Affine(PX, 0, 0, 0, -PX, 8 * PX), SOUTH)
    fp = footprint([a], _small_grid())
    assert fp.dtype == bool
    assert fp[:4, :4].all()
    assert fp.sum() == 16
```

- [x] **Step 2: Run them.** Expected: FAIL (`ImportError: cannot import name 'Grid'`).

- [x] **Step 3: Implement** (append to `tiles.py`; move the new imports to the top of the file)

```python
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from pyproj import CRS

from atlas.constants import CAP_ORIGIN_X, CAP_ORIGIN_Y, CAP_PX, ICE_PIXEL_M
from atlas.crs import ice_crs

ALIGN_TOL_PX = 0.01


@dataclass(frozen=True)
class Grid:
    crs: CRS
    transform: Affine
    width: int
    height: int


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
```

- [x] **Step 4: Run the tests.** `pytest -q pipeline/tests/test_tiles.py`. Expected: all non-data tests pass.

- [x] **Step 5: Real-data check.** ✅ Both poles pass: 91.0% of the 80° disk has data. The predictions have mild tile-edge seams (1.4× border jump, not visible at map scale) and 1.6–2.4% of pixels fall outside [0,1] (clamped in Task 6). See `docs/task-4-explained.md`. Append, then run `pytest -m data -q pipeline/tests/test_tiles.py`:

```python
@pytest.mark.data
@pytest.mark.parametrize("pole", ["north", "south"])
def test_real_label_mosaic_is_disk_with_crescent_gap(pole: str) -> None:
    from atlas.constants import ICE_DIR
    from atlas.tiles import patch_files

    label = mosaic(patch_files(ICE_DIR, "_PRO.tif", pole), cap_grid(pole))
    assert np.isnan(label[:, -256:]).all()           # 10th column is never shipped
    assert 0.55 < np.isfinite(label).mean() < 0.75   # disk ≈ 71% of the 10×10 square, minus the 9% crescent
```
Expected: PASS. If the finite fraction is outside the band, print it and inspect a plot before changing the bounds.

- [x] **Step 6:** Run ruff and mypy, then **commit (ask first)**: `feat(pipeline): cap grid, patch mosaicking and footprints`

---

### Task 5: DEM onto the cap grid, slope, hillshade (with the alignment regression test)

**Files:**
- Create: `pipeline/atlas/dem.py`, `pipeline/tests/test_dem.py`

**Interfaces:**
- Consumes: `Grid`, `cap_grid`, `mosaic`, `patch_files` (Task 4).
- Produces:
  - `read_pds_dem(path: Path) -> tuple[np.ndarray, Affine, CRS]` (metres above R, NaN nodata)
  - `to_grid(values: np.ndarray, transform: Affine, crs: CRS, grid: Grid, resampling: Resampling = Resampling.bilinear) -> np.ndarray`
  - `slope_deg(z: np.ndarray, pixel_m: float) -> np.ndarray`
  - `hillshade(z: np.ndarray, pixel_m: float, azimuth_deg: float = 315, altitude_deg: float = 30) -> np.ndarray` (uint8)

- [x] **Step 1: Write the failing tests** `pipeline/tests/test_dem.py`

```python
import numpy as np
import pytest
from affine import Affine

from atlas.crs import ice_crs
from atlas.dem import hillshade, slope_deg, to_grid
from atlas.tiles import Grid


def test_slope_of_known_plane() -> None:
    x = np.arange(10, dtype=np.float32) * 100.0
    z = np.tile(x * np.tan(np.radians(10)), (10, 1))
    assert np.allclose(slope_deg(z, 100.0), 10.0, atol=1e-3)


def test_hillshade_flat_is_uniform_uint8() -> None:
    out = hillshade(np.zeros((8, 8), np.float32), 240.0)
    assert out.dtype == np.uint8
    assert out.min() == out.max()


def test_to_grid_identity_when_grids_match() -> None:
    crs = ice_crs("south")
    t = Affine(240, 0, 0, 0, -240, 2400)
    z = np.arange(100, dtype=np.float32).reshape(10, 10)
    assert np.allclose(to_grid(z, t, crs, Grid(crs, t, 10, 10)), z)


@pytest.mark.data
@pytest.mark.parametrize("pole", ["south", "north"])
def test_pds_dem_aligns_with_dataset_slope(pole: str) -> None:
    """Georeferencing regression guard: r = 0.997-0.999 measured on 2026-09-24."""
    from atlas.constants import DEM_DIR, ICE_DIR, ICE_PIXEL_M
    from atlas.dem import read_pds_dem
    from atlas.tiles import cap_grid, mosaic, patch_files

    grid = cap_grid(pole)
    heights, t, crs = read_pds_dem(DEM_DIR / f"ldem_75{pole[0]}_240m.lbl")
    ours = slope_deg(to_grid(heights, t, crs, grid), ICE_PIXEL_M)
    ref = mosaic(patch_files(ICE_DIR, "_SLOPE.tif", pole), grid)
    m = np.isfinite(ref) & np.isfinite(ours)
    assert np.corrcoef(ours[m], ref[m])[0, 1] >= 0.99
```

- [x] **Step 2: Run them.** Expected: FAIL (`No module named 'atlas.dem'`).

- [x] **Step 3: Implement `dem.py`**

```python
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
```

- [x] **Step 4: Run everything.** ✅ r = 0.9965 (north), 0.9981 (south) over all 81 patches per pole; the DEM fills 100% of the cap grid. See `docs/task-5-explained.md`. `pytest -q pipeline/tests/test_dem.py && pytest -m data -q pipeline/tests/test_dem.py`. Expected: PASS, with r ≥ 0.99 for **both** poles. The north pole wasn't spot-checked during research, so if it fails, stop and check the north CRS orientation before going further.

- [ ] **Step 5:** Run ruff and mypy, then **commit (ask first)**: `feat(pipeline): reproject LOLA polar DEM to cap grid with alignment test`

---

### Task 6: Colour ramps, quantisation, web export per pole

**Files:**
- Create: `pipeline/atlas/colorize.py`, `pipeline/atlas/export_web.py`, `pipeline/tests/test_colorize.py`, `pipeline/tests/test_export_web.py`

**Interfaces:**
- Consumes: `hillshade` (Task 5).
- Produces:
  - `ICE_RAMP`, `ERR_RAMP`, `PSR_HEX`, `NODATA_U8 = 255`
  - `ramp_rgba(values, stops, vmin, vmax, alpha_range) -> uint8[H,W,4]`
  - `stripe_rgba(mask, color, period=8) -> uint8[H,W,4]`
  - `quantize_u8(values, vmin, vmax) -> uint8` (255 = nodata)
  - `block_nanmean(a, k) -> float32`
  - `@dataclass(frozen=True) PoleLayers(dem, pred, ref, psr, test_mask)` (arrays on the cap grid; `pred` already masked)
  - `export_pole(pole: Pole, layers: PoleLayers, out_dir: Path, stride: int, pixel_m: float) -> dict` (writes files, returns meta)

**meta.json (v1) contract** (the web Task 10 parses exactly this):

```json
{
  "version": 1,
  "pole": "south",
  "crs": {"lat0": -90, "k0": 0.994, "falseEasting": 500000, "falseNorthing": 500000, "radius": 1737400},
  "grid": {"x0": 197863.76, "y0": 802136.24, "pixelSize": 238.56, "width": 2560, "height": 2560},
  "mesh": {"file": "height.i16.bin", "width": 640, "height": 640, "stride": 4, "units": "m"},
  "base": {"file": "hillshade.jpg"},
  "edgeLatDeg": 80.0,
  "layers": [
    {"id": "pred", "label": "Predicted ice prospectivity (NI-LFM)", "texture": "pred.png",
     "values": {"file": "pred.u8.bin", "min": 0, "max": 1},
     "legend": {"kind": "sequential", "stops": ["#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"], "min": 0, "max": 1}}
  ]
}
```
Layer ids, in order: `pred`, `ref`, `err` (diverging, −0.2…0.2), `psr` (kind `"binary"`, no `values`), `test` (kind `"outline"`, no `values`).

- [ ] **Step 1: Write the failing colour tests** `pipeline/tests/test_colorize.py`

```python
import numpy as np

from atlas.colorize import ICE_RAMP, block_nanmean, quantize_u8, ramp_rgba, stripe_rgba


def test_ramp_endpoints_and_nan_transparent() -> None:
    out = ramp_rgba(np.array([[0.0, 1.0, np.nan]], np.float32), ICE_RAMP, 0.0, 1.0, (90, 230))
    assert tuple(out[0, 0]) == (0x18, 0x4F, 0x95, 90)
    assert tuple(out[0, 1]) == (0xCD, 0xE2, 0xFB, 230)
    assert out[0, 2, 3] == 0


def test_ramp_clamps_out_of_range() -> None:
    out = ramp_rgba(np.array([[-5.0, 5.0]]), ICE_RAMP, 0.0, 1.0, (0, 255))
    assert tuple(out[0, 0, :3]) == (0x18, 0x4F, 0x95)
    assert tuple(out[0, 1, :3]) == (0xCD, 0xE2, 0xFB)


def test_quantize_reserves_255_for_nodata() -> None:
    assert quantize_u8(np.array([0.0, 1.0, np.nan, 0.5]), 0.0, 1.0).tolist() == [0, 254, 255, 127]


def test_block_nanmean_ignores_nan() -> None:
    assert block_nanmean(np.array([[1, np.nan], [3, 5]], np.float32), 2)[0, 0] == 3.0


def test_stripes_are_secondary_encoding() -> None:
    on = stripe_rgba(np.ones((8, 8), bool), "#9ec5f4", period=4)
    off = stripe_rgba(np.zeros((2, 2), bool), "#9ec5f4")
    assert len(set(on[..., 3].ravel().tolist())) == 2
    assert off[..., 3].max() == 0
```

- [ ] **Step 2: Run them.** Expected: FAIL (`No module named 'atlas.colorize'`).

- [ ] **Step 3: Implement `colorize.py`**

```python
import warnings

import numpy as np

ICE_RAMP = ("#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb")
ERR_RAMP = ("#f4b3b0", "#e66767", "#9a2c2b", "#383835", "#184f95", "#3987e5", "#9ec5f4")
PSR_HEX = "#9ec5f4"
NODATA_U8 = 255
STRIPE_STRONG, STRIPE_WEAK = 230, 110


def hex_to_rgb(color: str) -> tuple[int, int, int]:
    h = color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def ramp_rgba(
    values: np.ndarray, stops: tuple[str, ...], vmin: float, vmax: float, alpha_range: tuple[int, int]
) -> np.ndarray:
    t = np.clip((values - vmin) / (vmax - vmin), 0.0, 1.0)
    t0 = np.nan_to_num(t)
    pos = np.linspace(0.0, 1.0, len(stops))
    rgb = np.array([hex_to_rgb(s) for s in stops], np.float32)
    channels = [np.interp(t0, pos, rgb[:, i]) for i in range(3)]
    alpha = np.where(np.isnan(t), 0, alpha_range[0] + (alpha_range[1] - alpha_range[0]) * t0)
    return np.round(np.stack([*channels, alpha], axis=-1)).astype(np.uint8)


def stripe_rgba(mask: np.ndarray, color: str, period: int = 8) -> np.ndarray:
    rows, cols = np.indices(mask.shape)
    strong = ((rows + cols) // max(1, period // 2)) % 2 == 0
    alpha = np.where(mask, np.where(strong, STRIPE_STRONG, STRIPE_WEAK), 0).astype(np.uint8)
    rgb = np.broadcast_to(np.array(hex_to_rgb(color), np.uint8), (*mask.shape, 3))
    return np.dstack([rgb, alpha])


def quantize_u8(values: np.ndarray, vmin: float, vmax: float) -> np.ndarray:
    t = np.clip((values - vmin) / (vmax - vmin), 0.0, 1.0)
    q = np.floor(np.nan_to_num(t) * 254 + 0.5)
    return np.where(np.isnan(values), NODATA_U8, q).astype(np.uint8)


def block_nanmean(a: np.ndarray, k: int) -> np.ndarray:
    h, w = a.shape
    if h % k or w % k:
        raise ValueError(f"shape {a.shape} not divisible by {k}")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN blocks are expected outside the disk
        return np.nanmean(a.reshape(h // k, k, w // k, k), axis=(1, 3)).astype(np.float32)
```
Checks against the tests: `quantize_u8(0.5)` = floor(127.5) = 127 ✓. `stripe_rgba` with period 4 gives stripes 2 px wide, so two distinct alphas ✓.

- [ ] **Step 4: Run the colour tests.** Expected: `5 passed`.

- [ ] **Step 5: Write the failing export test** `pipeline/tests/test_export_web.py`

```python
import json
from pathlib import Path

import numpy as np

from atlas.export_web import PoleLayers, export_pole


def test_export_pole_writes_contract(tmp_path: Path) -> None:
    n = 16
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    layers = PoleLayers(
        dem=xx * 10,
        pred=np.where(xx < 8, xx / 16, np.nan).astype(np.float32),
        ref=np.where(xx < 8, yy / 16, np.nan).astype(np.float32),
        psr=(xx > 12).astype(np.float32),
        test_mask=np.zeros((n, n), bool),
    )
    meta = export_pole("south", layers, tmp_path, stride=4, pixel_m=238.56)
    assert json.loads((tmp_path / "meta.json").read_text()) == meta
    assert meta["mesh"] == {"file": "height.i16.bin", "width": 4, "height": 4, "stride": 4, "units": "m"}
    heights = np.fromfile(tmp_path / "height.i16.bin", dtype="<i2").reshape(4, 4)
    assert heights[0, 0] == 15  # mean of x*10 for x = 0..3
    assert [layer["id"] for layer in meta["layers"]] == ["pred", "ref", "err", "psr", "test"]
    assert "values" not in meta["layers"][3]
    for name in ("pred.png", "ref.png", "err.png", "psr.png", "test.png", "hillshade.jpg",
                 "pred.u8.bin", "ref.u8.bin", "err.u8.bin"):
        assert (tmp_path / name).stat().st_size > 0
    assert np.fromfile(tmp_path / "pred.u8.bin", dtype=np.uint8).size == 16
```

- [ ] **Step 6: Implement `export_web.py`**

```python
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
    Image.fromarray(hillshade(layers.dem, pixel_m), "L").save(out_dir / "hillshade.jpg", quality=85)
    pngs = {
        "pred": ramp_rgba(layers.pred, ICE_RAMP, 0, 1, ICE_ALPHA),
        "ref": ramp_rgba(layers.ref, ICE_RAMP, 0, 1, ICE_ALPHA),
        "err": ramp_rgba(err, ERR_RAMP, -ERR_RANGE, ERR_RANGE, ERR_ALPHA),
        "psr": stripe_rgba(layers.psr > 0.5, PSR_HEX),
        "test": _outline(layers.test_mask),
    }
    for name, rgba in pngs.items():
        Image.fromarray(rgba, "RGBA").save(out_dir / f"{name}.png", optimize=True)


def _write_values(out_dir: Path, id_: str, grid: np.ndarray, stride: int, vmin: float, vmax: float) -> dict[str, Any]:
    quantize_u8(block_nanmean(grid, stride), vmin, vmax).tofile(out_dir / f"{id_}.u8.bin")
    return {"file": f"{id_}.u8.bin", "min": vmin, "max": vmax}


def _layer(id_: str, label: str, legend: dict[str, Any], values: dict[str, Any] | None = None) -> dict[str, Any]:
    entry: dict[str, Any] = {"id": id_, "label": label, "texture": f"{id_}.png", "legend": legend}
    return entry if values is None else {**entry, "values": values}


def _meta(pole: Pole, shape: tuple[int, int], mesh_shape: tuple[int, int], stride: int, pixel_m: float,
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
        _layer("pred", "Predicted ice prospectivity (NI-LFM)", SEQ, _write_values(out_dir, "pred", layers.pred, stride, 0, 1)),
        _layer("ref", "Reference prospectivity (SomBench label)", SEQ, _write_values(out_dir, "ref", layers.ref, stride, 0, 1)),
        _layer("err", "Model − reference", DIV, _write_values(out_dir, "err", err, stride, -ERR_RANGE, ERR_RANGE)),
        _layer("psr", "Permanently shadowed regions", {"kind": "binary", "stops": [PSR_HEX]}),
        _layer("test", "Held-out test patches", {"kind": "outline", "stops": ["#ffffff"]}),
    ]
    meta = _meta(pole, layers.dem.shape, mesh.shape, stride, pixel_m, layer_meta)
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta
```

- [ ] **Step 7: Run the tests.** `pytest -q pipeline/tests/test_colorize.py pipeline/tests/test_export_web.py`. Expected: all pass. Run `ruff check pipeline && mypy`; if lines pass 120 characters, wrap them.

- [ ] **Step 8: Commit (ask first).** `feat(pipeline): validated colour ramps and per-pole web export`

---

### Task 7: Artemis regions: load, mask, stats (P3 data)

**Files:**
- Create: `pipeline/atlas/regions.py`, `pipeline/tests/test_regions.py`
- Modify: `pipeline/atlas/constants.py` (add `ARTEMIS_REGIONS_SHP`, `ARTEMIS_NAME_FIELD`, `PSR_DIST_UNITS`)
- Data (manual): `data/artemis/` (the USGS download)

**Interfaces:**
- Consumes: `Grid` (Task 4), `moon_lonlat` (Task 2).
- Produces:
  - `EXPECTED_REGIONS: tuple[str, ...]` (9 names)
  - `@dataclass(frozen=True) Region(id: str, name: str, geometry: shapely.Polygon)` (lon/lat degrees)
  - `@dataclass(frozen=True) StatLayers(pred, ref, slope, psr, psr_dist, tmax)`
  - `load_regions(path: Path, name_field: str) -> list[Region]`
  - `region_mask(region: Region, grid: Grid) -> np.ndarray` (bool)
  - `region_stats(mask: np.ndarray, layers: StatLayers) -> dict[str, float | None]`, with keys `coverage, predMean, predP90, fracPredGt05, refMean, slopeMeanDeg, fracSlopeLt5, fracSlopeLt8, fracPsr, psrDistMean, tmaxMeanK`

- [ ] **Step 1: Manual download (user action).** Ask the user to:
  1. Open https://www.sciencebase.gov/catalog/item/671a6fa8d34efed5620f89f8 in a browser (USGS "Down Selected Artemis III Candidate Landing Site Navigational Grids", DOI 10.5066/P1MEQ6UK, CC0).
  2. Download the attached zip(s) into `data/artemis/` and unzip them.

  Then inspect:

```bash
find data/artemis -name "*.shp"
python - <<'EOF'
import pathlib, pyogrio
for p in pathlib.Path("data/artemis").rglob("*.shp"):
    info = pyogrio.read_info(p)
    print(p, info["features"], info["geometry_type"], list(info["fields"]))
EOF
```
  - Pick the polygon layer with **9 features** whose text field holds the nine names. Set `ARTEMIS_REGIONS_SHP = ARTEMIS_DIR / "<relative path>"` and `ARTEMIS_NAME_FIELD = "<field>"` in `constants.py`.
  - **If no such layer exists, stop and ask the user.** The fallback is Cesium ion asset 2683531, exported once with their free ion token. Never type coordinates by hand.

- [ ] **Step 2: Write the failing tests** `pipeline/tests/test_regions.py`

```python
import numpy as np
import shapely
from affine import Affine

from atlas.crs import ice_crs, ps_to_lonlat
from atlas.regions import Region, StatLayers, region_mask, region_stats
from atlas.tiles import Grid


def _grid() -> Grid:
    return Grid(ice_crs("south"), Affine(1000, 0, 480_000, 0, -1000, 520_000), 40, 40)


def _square_region() -> Region:
    lon, lat = ps_to_lonlat([490_000, 500_000, 500_000, 490_000], [510_000, 510_000, 500_000, 500_000], "south")
    return Region("sq", "Square", shapely.Polygon(zip(lon.tolist(), lat.tolist(), strict=True)))


def test_region_mask_covers_expected_pixels() -> None:
    mask = region_mask(_square_region(), _grid())
    assert mask.sum() == 100          # 10 km × 10 km at 1 km pixels
    assert mask[10:20, 10:20].all()


def _layers(pred: np.ndarray) -> StatLayers:
    ones = np.ones_like(pred)
    return StatLayers(pred=pred, ref=pred, slope=ones * 4, psr=ones * 0, psr_dist=ones * 1000, tmax=ones * 100)


def test_region_stats_values_and_coverage() -> None:
    mask = np.zeros((4, 4), bool)
    mask[:2, :2] = True
    pred = np.array([[0.2, 0.8, 0, 0], [np.nan, 0.5, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], np.float32)
    s = region_stats(mask, _layers(pred))
    assert s["coverage"] == 0.75
    assert s["predMean"] == pytest.approx(0.5)
    assert s["fracPredGt05"] == pytest.approx(1 / 3)
    assert s["fracSlopeLt5"] == 1.0
    assert s["fracSlopeLt8"] == 1.0


def test_region_stats_no_coverage_returns_none() -> None:
    nan = np.full((2, 2), np.nan, np.float32)
    s = region_stats(np.ones((2, 2), bool), StatLayers(nan, nan, nan, nan, nan, nan))
    assert s["coverage"] == 0.0
    assert s["predMean"] is None
```
Add `import pytest` at the top.

- [ ] **Step 3: Run them.** Expected: FAIL (`No module named 'atlas.regions'`).

- [ ] **Step 4: Implement `regions.py`**

```python
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pyogrio
import shapely
import shapely.ops
from pyproj import CRS, Transformer
from rasterio.features import rasterize

from atlas.crs import moon_lonlat
from atlas.tiles import Grid

EXPECTED_REGIONS = (
    "Peak near Cabeus B", "Haworth", "Malapert Massif", "Mons Mouton Plateau", "Mons Mouton",
    "Nobile Rim 1", "Nobile Rim 2", "de Gerlache Rim 2", "Slater Plain",
)
SLOPE_GOAL_DEG = 5.0
SLOPE_THRESHOLD_DEG = 8.0
HIGH_PROSPECTIVITY = 0.5


@dataclass(frozen=True)
class Region:
    id: str
    name: str
    geometry: shapely.Polygon


@dataclass(frozen=True)
class StatLayers:
    pred: np.ndarray
    ref: np.ndarray
    slope: np.ndarray
    psr: np.ndarray
    psr_dist: np.ndarray
    tmax: np.ndarray


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def load_regions(path: Path, name_field: str) -> list[Region]:
    crs = CRS.from_user_input(pyogrio.read_info(path)["crs"])
    _, _, geoms, fields = pyogrio.raw.read(path, columns=[name_field])
    to_lonlat = Transformer.from_crs(crs, moon_lonlat(), always_xy=True)
    regions = [
        Region(slugify(str(name)), str(name), shapely.ops.transform(to_lonlat.transform, shapely.from_wkb(wkb)))
        for name, wkb in zip(fields[0], geoms, strict=True)
    ]
    missing = set(EXPECTED_REGIONS) - {r.name for r in regions}
    if missing:
        raise ValueError(f"regions file lacks {sorted(missing)}; check name_field={name_field!r}")
    return regions


def region_mask(region: Region, grid: Grid) -> np.ndarray:
    to_grid = Transformer.from_crs(moon_lonlat(), grid.crs, always_xy=True)
    projected = shapely.ops.transform(to_grid.transform, region.geometry)
    burned = rasterize([(projected, 1)], out_shape=(grid.height, grid.width), transform=grid.transform, fill=0)
    return burned.astype(bool)


def _mean(a: np.ndarray) -> float | None:
    return float(np.nanmean(a)) if np.isfinite(a).any() else None


def _frac(cond: np.ndarray, valid: np.ndarray) -> float | None:
    return float(cond[valid].mean()) if valid.any() else None


def region_stats(mask: np.ndarray, layers: StatLayers) -> dict[str, float | None]:
    pred, slope = layers.pred[mask], layers.slope[mask]
    valid_pred, valid_slope = np.isfinite(pred), np.isfinite(slope)
    return {
        "coverage": float(valid_pred.mean()) if mask.any() else 0.0,
        "predMean": _mean(pred),
        "predP90": float(np.nanpercentile(pred, 90)) if valid_pred.any() else None,
        "fracPredGt05": _frac(pred > HIGH_PROSPECTIVITY, valid_pred),
        "refMean": _mean(layers.ref[mask]),
        "slopeMeanDeg": _mean(slope),
        "fracSlopeLt5": _frac(slope < SLOPE_GOAL_DEG, valid_slope),
        "fracSlopeLt8": _frac(slope < SLOPE_THRESHOLD_DEG, valid_slope),
        "fracPsr": _mean(layers.psr[mask]),
        "psrDistMean": _mean(layers.psr_dist[mask]),
        "tmaxMeanK": _mean(layers.tmax[mask]),
    }
```

- [ ] **Step 5: Run the tests.** `pytest -q pipeline/tests/test_regions.py`. Expected: `3 passed`. `rasterize` burns pixels whose **centres** fall inside the polygon; the square's edges sit on pixel boundaries, so exactly 100 pixels should burn. If it's off by a row or column, check the PS→lon/lat→PS round-trip precision in the fixture (not `region_mask`).

- [ ] **Step 6: Real-data test and `LPSR_DIS` units.** Append, then run `pytest -m data -q pipeline/tests/test_regions.py`:

```python
@pytest.mark.data
def test_real_regions_load_near_south_pole() -> None:
    from atlas.constants import ARTEMIS_NAME_FIELD, ARTEMIS_REGIONS_SHP
    from atlas.regions import EXPECTED_REGIONS, load_regions

    regions = load_regions(ARTEMIS_REGIONS_SHP, ARTEMIS_NAME_FIELD)
    assert sorted(r.name for r in regions) == sorted(EXPECTED_REGIONS)
    for r in regions:
        assert -90 < r.geometry.centroid.y < -83, r.name
```
For the units, run `python -c "from atlas.constants import ICE_DIR; from atlas.tiles import cap_grid, mosaic, patch_files; import numpy as np; a=mosaic(patch_files(ICE_DIR,'_LPSR_DIS.tif','south'),cap_grid('south')); print(np.nanmin(a), np.nanmax(a))"`. A maximum ≫ 1,000 means metres. Set `PSR_DIST_UNITS = "m"` (or what the data shows) in `constants.py` and note it in `docs/benchmarks.md`.

- [ ] **Step 7:** Run ruff and mypy, then **commit (ask first)**: `feat(pipeline): Artemis candidate region masks and statistics`

---

### Task 8: Globe assets + build orchestration (produces everything under `web/public/data`)

**Files:**
- Create: `pipeline/atlas/globe_assets.py`, `pipeline/atlas/build.py`, `pipeline/tests/test_globe_assets.py`, `notebooks/qa_plot.py`

**Interfaces:**
- Consumes: every earlier pipeline function.
- Produces:
  - `km_to_i16_m(km: np.ndarray) -> np.ndarray`
  - `export_globe(ldem_tif: Path, color_tif: Path, out_dir: Path) -> dict`
  - CLI `python -m atlas.build {globe|north|south|regions|all}`
  - `web/public/data/globe/meta.json` = `{"version":1,"height":{"file":"height.i16.bin","width":1440,"height":720,"units":"m"},"color":{"hi":"color_4k.jpg","lo":"color_2k.jpg"}}`
  - `web/public/data/regions.json` = `{"source","doi","retrieved","regions":[{"id","name","outline":[[lon,lat],…],"centroid":[lon,lat],"coverage","stats":{…all region_stats keys except coverage…}}]}`

- [ ] **Step 1: Write the failing test** `pipeline/tests/test_globe_assets.py`

```python
import numpy as np

from atlas.globe_assets import km_to_i16_m


def test_km_to_i16_m_rounds_and_keeps_sign() -> None:
    out = km_to_i16_m(np.array([[-9.1234, 0.0, 10.7599]], np.float32))
    assert out.dtype == np.dtype("<i2")
    assert out.tolist() == [[-9123, 0, 10760]]
```

- [ ] **Step 2: Run it.** Expected: FAIL.

- [ ] **Step 3: Implement `globe_assets.py`**

```python
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
```

- [ ] **Step 4: Run it.** Expected: PASS.

- [ ] **Step 5: Implement `build.py`** (thin orchestration over tested functions)

```python
import argparse
import json
import logging
from datetime import date

import numpy as np
import shapely

from atlas.constants import (
    ARTEMIS_NAME_FIELD,
    ARTEMIS_REGIONS_SHP,
    DEM_DIR,
    ICE_DIR,
    ICE_PIXEL_M,
    MESH_STRIDE,
    PRED_DIR,
    PRED_SUFFIX,
    SVS_DIR,
    WEB_DATA_DIR,
)
from atlas.crs import Pole
from atlas.dem import read_pds_dem, slope_deg, to_grid
from atlas.export_web import PoleLayers, export_pole
from atlas.globe_assets import export_globe
from atlas.regions import StatLayers, load_regions, region_mask, region_stats
from atlas.tiles import cap_grid, footprint, mosaic, parse_patch_id, patch_files

log = logging.getLogger("atlas.build")


def _ice_layer(suffix: str, pole: Pole) -> np.ndarray:
    return mosaic(patch_files(ICE_DIR, suffix, pole), cap_grid(pole))


def _test_footprint(pole: Pole) -> np.ndarray:
    ids = set((ICE_DIR / "test_filtered.txt").read_text().split())
    tiles = [p for p in patch_files(ICE_DIR, "_PRO.tif", pole) if parse_patch_id(p.name) in ids]
    return footprint(tiles, cap_grid(pole))


def pole_layers(pole: Pole) -> PoleLayers:
    heights, transform, crs = read_pds_dem(DEM_DIR / f"ldem_75{pole[0]}_240m.lbl")
    ref = _ice_layer("_PRO.tif", pole)
    raw_pred = mosaic(patch_files(PRED_DIR, PRED_SUFFIX, pole), cap_grid(pole))
    return PoleLayers(
        dem=to_grid(heights, transform, crs, cap_grid(pole)),
        pred=np.where(np.isnan(ref), np.nan, raw_pred).astype(np.float32),
        ref=ref,
        psr=_ice_layer("_LPSR.tif", pole),
        test_mask=_test_footprint(pole),
    )


def _region_entry(region, grid, stat_layers: StatLayers) -> dict:
    stats = region_stats(region_mask(region, grid), stat_layers)
    coverage = stats.pop("coverage")
    centroid = region.geometry.centroid
    outline = shapely.get_coordinates(region.geometry.exterior).tolist()
    return {"id": region.id, "name": region.name, "outline": outline, "centroid": [centroid.x, centroid.y],
            "coverage": coverage, "stats": stats}


def build_regions() -> None:
    layers = pole_layers("south")
    stat_layers = StatLayers(
        pred=layers.pred, ref=layers.ref, slope=slope_deg(layers.dem, ICE_PIXEL_M), psr=layers.psr,
        psr_dist=_ice_layer("_LPSR_DIS.tif", "south"), tmax=_ice_layer("_TMAX.tif", "south"),
    )
    grid = cap_grid("south")
    entries = [_region_entry(r, grid, stat_layers) for r in load_regions(ARTEMIS_REGIONS_SHP, ARTEMIS_NAME_FIELD)]
    doc = {"source": "USGS Down Selected Artemis III Candidate Landing Site Navigational Grids",
           "doi": "10.5066/P1MEQ6UK", "retrieved": date.today().isoformat(), "regions": entries}
    (WEB_DATA_DIR / "regions.json").write_text(json.dumps(doc, indent=2))
    log.info("wrote %d regions", len(entries))


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(description="Build web assets for the Lunar Ice Atlas")
    parser.add_argument("target", choices=["globe", "north", "south", "regions", "all"])
    target = parser.parse_args().target
    if target in ("globe", "all"):
        export_globe(SVS_DIR / "ldem_4.tif", SVS_DIR / "lroc_color_16bit_srgb_4k.tif", WEB_DATA_DIR / "globe")
    for pole in ("north", "south"):
        if target in (pole, "all"):
            export_pole(pole, pole_layers(pole), WEB_DATA_DIR / pole, stride=MESH_STRIDE, pixel_m=ICE_PIXEL_M)
            log.info("exported %s", pole)
    if target in ("regions", "all"):
        build_regions()


if __name__ == "__main__":
    main()
```
Type-annotate `_region_entry(region: Region, grid: Grid, …) -> dict[str, Any]` so mypy passes (import `Region`, `Grid`, `Any`).

- [ ] **Step 6: Run the build.** `python -m atlas.build all && du -sh web/public/data/*`. Expected: every file in the File-structure listing exists and the total is ≤ 36 MB, leaving room for the JS bundle.
  - If it's over budget, save the overlays as lossless WebP (`Image.save(path.with_suffix(".webp"), lossless=True)`), change the `texture` names in `export_web.py` and its test to `.webp`, then re-run.

- [ ] **Step 7: Visual QA.** Write `notebooks/qa_plot.py`, which runs matplotlib on the south pole:
  - Hillshade from `pole_layers("south").dem`, with the `pred` overlay (alpha 0.6).
  - Region outlines projected via `lonlat_to_ps`, plus a red dot at Shackleton (lon 129.2, lat −89.67) as the orientation landmark.
  - Save to `notebooks/qa_south.png` and **show it to the user**.
  - Check that Shackleton sits within ~10 km of the grid centre (500,000 m, 500,000 m), and that the region outlines sit on high-standing massifs and rims (bright in the hillshade).

- [ ] **Step 8:** Run `pytest -q && pytest -m data -q && ruff check pipeline && mypy`, then **commit (ask first)**: `feat(pipeline): build CLI producing all web assets` (includes `web/public/data`).

---

### Task 9: Web scaffold and geo math (TypeScript)

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/eslint.config.js`, `web/.prettierrc`, `web/index.html` (minimal), `web/src/geo/constants.ts`, `web/src/geo/polarStereo.ts`, `web/src/geo/sphere.ts`, `web/src/geo/polarStereo.test.ts`, `web/src/geo/sphere.test.ts`

**Interfaces:**
- Consumes: `web/src/geo/__fixtures__/ps_points.json` (Task 2).
- Produces:
  - `type Pole = 'north' | 'south'`
  - `interface PsParams { lat0: number; k0: number; falseEasting: number; falseNorthing: number; radius: number }`
  - `psForward(latDeg: number, lonDeg: number, p: PsParams): { x: number; y: number }`
  - `psInverse(x: number, y: number, p: PsParams): { lat: number; lon: number }`
  - `latLonToVec3(latDeg, lonDeg, r): [number, number, number]` (+y = north, lon 0 = +x, lon 90°E = −z)
  - `vec3ToLatLon(x, y, z): { lat: number; lon: number; r: number }`
  - `MOON_RADIUS_M`, `DEG`

- [ ] **Step 1: Scaffold.** Node ≥ 22.12 must be active (`node -v`).

```bash
mkdir -p web && cd web
npm init -y
npm i three@0.186.1
npm i -D vite@8.3.1 vitest@5.0.1 typescript@5.9.3 @types/three@0.186.0 jsdom \
  eslint@10 @eslint/js typescript-eslint@8.70.1 prettier@3.9.9 @playwright/test@1.63.0
npx playwright install chromium
```
Edit `package.json` so it contains `"type": "module"` and these scripts:

```json
{
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview --port 4173 --strictPort",
  "test": "vitest run",
  "typecheck": "tsc --noEmit",
  "lint": "eslint src e2e && prettier --check src e2e",
  "e2e": "playwright test"
}
```
`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true, "noUncheckedIndexedAccess": true, "resolveJsonModule": true, "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src", "e2e", "vite.config.ts", "playwright.config.ts"]
}
```
`vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```
`eslint.config.js`:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(js.configs.recommended, ...tseslint.configs.strict, {
  rules: { 'no-console': 'error' },
});
```
`.prettierrc`: `{ "singleQuote": true, "printWidth": 120 }`.

- [ ] **Step 2: Write the failing tests**

`src/geo/polarStereo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fixtures from './__fixtures__/ps_points.json';
import { psForward, psInverse, type PsParams } from './polarStereo';

const params = (pole: string): PsParams => ({
  lat0: pole === 'north' ? 90 : -90,
  k0: 0.994,
  falseEasting: 500000,
  falseNorthing: 500000,
  radius: 1737400,
});

describe('polar stereographic', () => {
  it.each(fixtures)('matches pyproj for $pole $lat,$lon', ({ pole, lat, lon, x, y }) => {
    const out = psForward(lat, lon, params(pole));
    expect(out.x).toBeCloseTo(x, 3);
    expect(out.y).toBeCloseTo(y, 3);
  });

  it.each(fixtures.filter((f) => Math.abs(f.lat) < 90))('round-trips $pole $lat,$lon', ({ pole, lat, lon }) => {
    const p = params(pole);
    const { x, y } = psForward(lat, lon, p);
    const back = psInverse(x, y, p);
    expect(back.lat).toBeCloseTo(lat, 9);
    expect(back.lon).toBeCloseTo(lon, 9);
  });
});
```
`src/geo/sphere.test.ts`:

```ts
import { expect, it } from 'vitest';
import { latLonToVec3, vec3ToLatLon } from './sphere';

it('puts +90 lat on +y and lon 90E on -z', () => {
  const [x, y, z] = latLonToVec3(90, 0, 1);
  expect(x).toBeCloseTo(0, 12);
  expect(y).toBeCloseTo(1, 12);
  expect(z).toBeCloseTo(0, 12);
  expect(latLonToVec3(0, 90, 1)[2]).toBeCloseTo(-1, 12);
});

it('round-trips', () => {
  const [x, y, z] = latLonToVec3(-84.2, 60.7, 2.5);
  const back = vec3ToLatLon(x, y, z);
  expect(back.lat).toBeCloseTo(-84.2, 10);
  expect(back.lon).toBeCloseTo(60.7, 10);
  expect(back.r).toBeCloseTo(2.5, 12);
});
```

- [ ] **Step 3: Run them.** `npm test`. Expected: FAIL (cannot resolve `./polarStereo`).

- [ ] **Step 4: Implement**

`src/geo/constants.ts`:

```ts
export const MOON_RADIUS_M = 1_737_400;
export const DEG = Math.PI / 180;
```
`src/geo/polarStereo.ts`:

```ts
import { DEG } from './constants';

export type Pole = 'north' | 'south';

export interface PsParams {
  lat0: number;
  k0: number;
  falseEasting: number;
  falseNorthing: number;
  radius: number;
}

const isSouth = (p: PsParams): boolean => p.lat0 < 0;

export function psForward(latDeg: number, lonDeg: number, p: PsParams): { x: number; y: number } {
  const rho = 2 * p.radius * p.k0 * Math.tan(Math.PI / 4 - (Math.abs(latDeg) * DEG) / 2);
  const lon = lonDeg * DEG;
  const x = p.falseEasting + rho * Math.sin(lon);
  const y = isSouth(p) ? p.falseNorthing + rho * Math.cos(lon) : p.falseNorthing - rho * Math.cos(lon);
  return { x, y };
}

export function psInverse(x: number, y: number, p: PsParams): { lat: number; lon: number } {
  const south = isSouth(p);
  const dx = x - p.falseEasting;
  const dy = y - p.falseNorthing;
  const c = 2 * Math.atan(Math.hypot(dx, dy) / (2 * p.radius * p.k0));
  const latAbs = 90 - c / DEG;
  const lon = Math.atan2(dx, south ? dy : -dy) / DEG;
  return { lat: south ? -latAbs : latAbs, lon };
}
```
`src/geo/sphere.ts`:

```ts
import { DEG } from './constants';

export function latLonToVec3(latDeg: number, lonDeg: number, r: number): [number, number, number] {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  return [r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), -r * Math.cos(lat) * Math.sin(lon)];
}

export function vec3ToLatLon(x: number, y: number, z: number): { lat: number; lon: number; r: number } {
  const r = Math.hypot(x, y, z);
  return { lat: Math.asin(y / r) / DEG, lon: Math.atan2(-z, x) / DEG, r };
}
```

- [ ] **Step 5: Run everything.** `npm test && npm run typecheck && npm run lint`. Expected: PASS. (At |lat| = 90 the inverse longitude is undefined, which is why the round-trip excludes the poles.)

- [ ] **Step 6: Commit (ask first).** `feat(web): scaffold Vite+TS+three and lunar geo math`

---

### Task 10: Data contract, loaders, value grids

**Files:**
- Create: `web/src/data/schema.ts`, `web/src/data/regionsSchema.ts`, `web/src/data/grid.ts`, `web/src/data/load.ts`, `web/src/data/schema.test.ts`, `web/src/data/regionsSchema.test.ts`, `web/src/data/grid.test.ts`

**Interfaces:**
- Consumes: `PsParams`, `Pole` (Task 9); the JSON produced by Tasks 6 and 8.
- Produces:
  - `class DataError extends Error`
  - `interface LayerMeta`, `interface Legend`, `interface PoleMeta`, `interface GlobeMeta`
  - `parsePoleMeta(json: unknown): PoleMeta`, `parseGlobeMeta(json: unknown): GlobeMeta`
  - (regionsSchema.ts) `interface RegionStats`, `interface Region`, `interface RegionsDoc`, `parseRegions(json: unknown): RegionsDoc`
  - `type Decoder = (raw: number) => number | null`
  - `decodeU8(min, max): Decoder`, `decodeI16: Decoder`
  - `class ValueGrid { width; height; sample(u, v): number | null; bilinear(u, v): number | null }` (u→right, v→**down**, [0,1])
  - `interface LoadedPole { meta: PoleMeta; heights: ValueGrid; values: Record<string, ValueGrid>; url(file: string): string }`
  - `interface LoadedGlobe { meta: GlobeMeta; heights: ValueGrid; url(file: string): string }`
  - `loadPole(base, pole)`, `loadGlobe(base)`, `loadRegions(base)`

- [ ] **Step 1: Write the failing tests**

`src/data/grid.test.ts`:

```ts
import { expect, it } from 'vitest';
import { ValueGrid, decodeU8 } from './grid';

const g = new ValueGrid(2, 2, Uint8Array.from([0, 254, 255, 127]), decodeU8(0, 1));

it('samples nearest with v=0 at the top row', () => {
  expect(g.sample(0.1, 0.1)).toBe(0);
  expect(g.sample(0.9, 0.1)).toBe(1);
  expect(g.sample(0.1, 0.9)).toBeNull();
  expect(g.sample(0.9, 0.9)).toBeCloseTo(0.5, 2);
});

it('returns null outside [0,1] and rejects wrong sizes', () => {
  expect(g.sample(-0.01, 0.5)).toBeNull();
  expect(() => new ValueGrid(3, 3, new Uint8Array(4), decodeU8(0, 1))).toThrow(/grid size/);
});

it('bilinear falls back to nearest next to nodata', () => {
  expect(g.bilinear(0.25, 0.75)).toBeNull();
  const full = new ValueGrid(2, 1, Uint8Array.from([0, 254]), decodeU8(0, 1));
  expect(full.bilinear(0.5, 0.5)).toBeCloseTo(0.5, 6);
});
```
`src/data/schema.test.ts`:

```ts
import { expect, it } from 'vitest';
import { DataError, parseGlobeMeta, parsePoleMeta } from './schema';

const valid = {
  version: 1,
  pole: 'south',
  crs: { lat0: -90, k0: 0.994, falseEasting: 500000, falseNorthing: 500000, radius: 1737400 },
  grid: { x0: 197863.76, y0: 802136.24, pixelSize: 238.56, width: 2560, height: 2560 },
  mesh: { file: 'height.i16.bin', width: 640, height: 640, stride: 4, units: 'm' },
  base: { file: 'hillshade.jpg' },
  edgeLatDeg: 80,
  layers: [
    {
      id: 'pred', label: 'x', texture: 'pred.png', values: { file: 'pred.u8.bin', min: 0, max: 1 },
      legend: { kind: 'sequential', stops: ['#184f95', '#cde2fb'], min: 0, max: 1 },
    },
    { id: 'psr', label: 'PSR', texture: 'psr.png', legend: { kind: 'binary', stops: ['#9ec5f4'] } },
  ],
};

it('accepts the v1 contract', () => {
  const meta = parsePoleMeta(valid);
  expect(meta.layers.map((l) => l.id)).toEqual(['pred', 'psr']);
  expect(meta.layers[1]?.values).toBeUndefined();
});

it('rejects wrong version and missing fields with a clear path', () => {
  expect(() => parsePoleMeta({ ...valid, version: 2 })).toThrow(DataError);
  expect(() => parsePoleMeta({ ...valid, mesh: undefined })).toThrow(/meta\.mesh/);
  expect(() => parsePoleMeta({ ...valid, layers: [{ ...valid.layers[0], legend: { kind: 'rainbow', stops: [] } }] }))
    .toThrow(/legend\.kind/);
});

it('parses globe meta', () => {
  const g = parseGlobeMeta({ version: 1, height: { file: 'h.bin', width: 1440, height: 720, units: 'm' },
    color: { hi: 'a.jpg', lo: 'b.jpg' } });
  expect(g.height.width).toBe(1440);
});
```
`src/data/regionsSchema.test.ts`:

```ts
import { expect, it } from 'vitest';
import { parseRegions } from './regionsSchema';

const stats = { predMean: 0.5, predP90: null, fracPredGt05: 0.2, refMean: 0.4, slopeMeanDeg: 9, fracSlopeLt5: 0.1,
  fracSlopeLt8: 0.4, fracPsr: 0.05, psrDistMean: 1200, tmaxMeanK: 210 };

it('accepts nulls in stats and requires outline points', () => {
  const doc = parseRegions({ source: 's', doi: 'd', retrieved: '2026-09-24', regions: [
    { id: 'haworth', name: 'Haworth', outline: [[1, -87], [2, -87], [2, -88]], centroid: [1.5, -87.5], coverage: 1, stats },
  ] });
  expect(doc.regions[0]?.stats.predP90).toBeNull();
  expect(() => parseRegions({ source: 's', doi: 'd', retrieved: 'x' })).toThrow(/regions/);
});
```

- [ ] **Step 2: Run them.** `npm test`. Expected: FAIL (modules missing).

- [ ] **Step 3: Implement `grid.ts`**

```ts
export type Decoder = (raw: number) => number | null;

export const decodeU8 =
  (min: number, max: number): Decoder =>
  (raw) =>
    raw === 255 ? null : min + (raw / 254) * (max - min);

export const decodeI16: Decoder = (raw) => (raw === -32768 ? null : raw);

const inUnit = (u: number, v: number): boolean => u >= 0 && u <= 1 && v >= 0 && v <= 1;

export class ValueGrid {
  constructor(
    readonly width: number,
    readonly height: number,
    private readonly data: Int16Array | Uint8Array,
    private readonly decode: Decoder,
  ) {
    if (data.length !== width * height) throw new Error(`grid size ${data.length} != ${width}x${height}`);
  }

  private at(col: number, row: number): number | null {
    const raw = this.data[row * this.width + col];
    return raw === undefined ? null : this.decode(raw);
  }

  sample(u: number, v: number): number | null {
    if (!inUnit(u, v)) return null;
    const col = Math.min(this.width - 1, Math.floor(u * this.width));
    const row = Math.min(this.height - 1, Math.floor(v * this.height));
    return this.at(col, row);
  }

  bilinear(u: number, v: number): number | null {
    if (!inUnit(u, v)) return null;
    const fx = Math.min(Math.max(0, u * this.width - 0.5), this.width - 1);
    const fy = Math.min(Math.max(0, v * this.height - 0.5), this.height - 1);
    const c0 = Math.floor(fx);
    const r0 = Math.floor(fy);
    const c1 = Math.min(c0 + 1, this.width - 1);
    const r1 = Math.min(r0 + 1, this.height - 1);
    const q = [this.at(c0, r0), this.at(c1, r0), this.at(c0, r1), this.at(c1, r1)];
    if (q.some((x) => x === null)) return this.sample(u, v);
    const [a, b, c, d] = q as [number, number, number, number];
    const tx = fx - c0;
    const ty = fy - r0;
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
}
```

- [ ] **Step 4: Implement `schema.ts`** (hand-written guards; no runtime dependency)

```ts
import type { Pole, PsParams } from '../geo/polarStereo';

export class DataError extends Error {}

export type LegendKind = 'sequential' | 'diverging' | 'binary' | 'outline';
export interface Legend { kind: LegendKind; stops: string[]; min?: number; max?: number }
export interface LayerMeta {
  id: string;
  label: string;
  texture: string;
  legend: Legend;
  values?: { file: string; min: number; max: number };
}
export interface PoleMeta {
  version: 1;
  pole: Pole;
  crs: PsParams;
  grid: { x0: number; y0: number; pixelSize: number; width: number; height: number };
  mesh: { file: string; width: number; height: number; stride: number; units: 'm' };
  base: { file: string };
  edgeLatDeg: number;
  layers: LayerMeta[];
}
export interface GlobeMeta {
  version: 1;
  height: { file: string; width: number; height: number; units: 'm' };
  color: { hi: string; lo: string };
}

type Obj = Record<string, unknown>;
const KINDS: readonly LegendKind[] = ['sequential', 'diverging', 'binary', 'outline'];

export const obj = (v: unknown, path: string): Obj => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new DataError(`${path}: expected object`);
  return v as Obj;
};
export const num = (v: unknown, path: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new DataError(`${path}: expected number`);
  return v;
};
export const str = (v: unknown, path: string): string => {
  if (typeof v !== 'string' || v.length === 0) throw new DataError(`${path}: expected string`);
  return v;
};
export const arr = (v: unknown, path: string): unknown[] => {
  if (!Array.isArray(v)) throw new DataError(`${path}: expected array`);
  return v;
};
const optNum = (v: unknown, path: string): number | undefined => (v === undefined ? undefined : num(v, path));

function parseLegend(v: unknown, path: string): Legend {
  const o = obj(v, path);
  const kind = str(o.kind, `${path}.kind`) as LegendKind;
  if (!KINDS.includes(kind)) throw new DataError(`${path}.kind: unknown "${kind}"`);
  const stops = arr(o.stops, `${path}.stops`).map((s, i) => str(s, `${path}.stops[${i}]`));
  return { kind, stops, min: optNum(o.min, `${path}.min`), max: optNum(o.max, `${path}.max`) };
}

function parseLayer(v: unknown, path: string): LayerMeta {
  const o = obj(v, path);
  const layer: LayerMeta = {
    id: str(o.id, `${path}.id`),
    label: str(o.label, `${path}.label`),
    texture: str(o.texture, `${path}.texture`),
    legend: parseLegend(o.legend, `${path}.legend`),
  };
  if (o.values === undefined) return layer;
  const val = obj(o.values, `${path}.values`);
  return {
    ...layer,
    values: { file: str(val.file, `${path}.values.file`), min: num(val.min, `${path}.values.min`),
      max: num(val.max, `${path}.values.max`) },
  };
}

function parseCrs(v: unknown): PsParams {
  const c = obj(v, 'meta.crs');
  return { lat0: num(c.lat0, 'meta.crs.lat0'), k0: num(c.k0, 'meta.crs.k0'),
    falseEasting: num(c.falseEasting, 'meta.crs.falseEasting'),
    falseNorthing: num(c.falseNorthing, 'meta.crs.falseNorthing'), radius: num(c.radius, 'meta.crs.radius') };
}

export function parsePoleMeta(json: unknown): PoleMeta {
  const o = obj(json, 'meta');
  if (o.version !== 1) throw new DataError('meta.version: expected 1');
  const pole = str(o.pole, 'meta.pole');
  if (pole !== 'north' && pole !== 'south') throw new DataError('meta.pole: expected north|south');
  const g = obj(o.grid, 'meta.grid');
  const m = obj(o.mesh, 'meta.mesh');
  return {
    version: 1,
    pole,
    crs: parseCrs(o.crs),
    grid: { x0: num(g.x0, 'meta.grid.x0'), y0: num(g.y0, 'meta.grid.y0'), pixelSize: num(g.pixelSize, 'meta.grid.pixelSize'),
      width: num(g.width, 'meta.grid.width'), height: num(g.height, 'meta.grid.height') },
    mesh: { file: str(m.file, 'meta.mesh.file'), width: num(m.width, 'meta.mesh.width'),
      height: num(m.height, 'meta.mesh.height'), stride: num(m.stride, 'meta.mesh.stride'), units: 'm' },
    base: { file: str(obj(o.base, 'meta.base').file, 'meta.base.file') },
    edgeLatDeg: num(o.edgeLatDeg, 'meta.edgeLatDeg'),
    layers: arr(o.layers, 'meta.layers').map((l, i) => parseLayer(l, `meta.layers[${i}]`)),
  };
}

export function parseGlobeMeta(json: unknown): GlobeMeta {
  const o = obj(json, 'globe');
  if (o.version !== 1) throw new DataError('globe.version: expected 1');
  const h = obj(o.height, 'globe.height');
  const c = obj(o.color, 'globe.color');
  return {
    version: 1,
    height: { file: str(h.file, 'globe.height.file'), width: num(h.width, 'globe.height.width'),
      height: num(h.height, 'globe.height.height'), units: 'm' },
    color: { hi: str(c.hi, 'globe.color.hi'), lo: str(c.lo, 'globe.color.lo') },
  };
}
```

- [ ] **Step 5: Implement `regionsSchema.ts`**

```ts
import { DataError, arr, num, obj, str } from './schema';

export const STAT_KEYS = [
  'predMean', 'predP90', 'fracPredGt05', 'refMean', 'slopeMeanDeg', 'fracSlopeLt5', 'fracSlopeLt8', 'fracPsr',
  'psrDistMean', 'tmaxMeanK',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type RegionStats = Record<StatKey, number | null>;
export interface Region {
  id: string;
  name: string;
  outline: [number, number][];
  centroid: [number, number];
  coverage: number;
  stats: RegionStats;
}
export interface RegionsDoc { source: string; doi: string; retrieved: string; regions: Region[] }

const pair = (v: unknown, path: string): [number, number] => {
  const a = arr(v, path);
  if (a.length < 2) throw new DataError(`${path}: expected [lon, lat]`);
  return [num(a[0], `${path}[0]`), num(a[1], `${path}[1]`)];
};

function parseStats(v: unknown, path: string): RegionStats {
  const o = obj(v, path);
  const entries = STAT_KEYS.map((k) => [k, o[k] === null ? null : num(o[k], `${path}.${k}`)] as const);
  return Object.fromEntries(entries) as RegionStats;
}

function parseRegion(v: unknown, path: string): Region {
  const o = obj(v, path);
  const outline = arr(o.outline, `${path}.outline`).map((p, i) => pair(p, `${path}.outline[${i}]`));
  if (outline.length < 3) throw new DataError(`${path}.outline: expected ≥3 points`);
  return { id: str(o.id, `${path}.id`), name: str(o.name, `${path}.name`), outline,
    centroid: pair(o.centroid, `${path}.centroid`), coverage: num(o.coverage, `${path}.coverage`),
    stats: parseStats(o.stats, `${path}.stats`) };
}

export function parseRegions(json: unknown): RegionsDoc {
  const o = obj(json, 'regions.json');
  return { source: str(o.source, 'source'), doi: str(o.doi, 'doi'), retrieved: str(o.retrieved, 'retrieved'),
    regions: arr(o.regions, 'regions').map((r, i) => parseRegion(r, `regions[${i}]`)) };
}
```

- [ ] **Step 6: Implement `load.ts`**

```ts
import type { Pole } from '../geo/polarStereo';
import { ValueGrid, decodeI16, decodeU8 } from './grid';
import { parseRegions, type RegionsDoc } from './regionsSchema';
import { DataError, parseGlobeMeta, parsePoleMeta, type GlobeMeta, type PoleMeta } from './schema';

export interface LoadedPole { meta: PoleMeta; heights: ValueGrid; values: Record<string, ValueGrid>; url(file: string): string }
export interface LoadedGlobe { meta: GlobeMeta; heights: ValueGrid; url(file: string): string }

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new DataError(`${url}: HTTP ${res.status}`);
  return res;
}
const getJson = async (url: string): Promise<unknown> => (await fetchOk(url)).json();
const getBytes = async (url: string): Promise<ArrayBuffer> => (await fetchOk(url)).arrayBuffer();

// .i16.bin files are written little-endian by the pipeline; every supported browser is little-endian.
export async function loadPole(base: string, pole: Pole): Promise<LoadedPole> {
  const url = (file: string): string => `${base}data/${pole}/${file}`;
  const meta = parsePoleMeta(await getJson(url('meta.json')));
  const { width, height, file } = meta.mesh;
  const heights = new ValueGrid(width, height, new Int16Array(await getBytes(url(file))), decodeI16);
  const valued = meta.layers.flatMap((l) => (l.values ? [{ id: l.id, v: l.values }] : []));
  const grids = await Promise.all(
    valued.map(async ({ id, v }) => {
      const data = new Uint8Array(await getBytes(url(v.file)));
      return [id, new ValueGrid(width, height, data, decodeU8(v.min, v.max))] as const;
    }),
  );
  return { meta, heights, values: Object.fromEntries(grids), url };
}

export async function loadGlobe(base: string): Promise<LoadedGlobe> {
  const url = (file: string): string => `${base}data/globe/${file}`;
  const meta = parseGlobeMeta(await getJson(url('meta.json')));
  const data = new Int16Array(await getBytes(url(meta.height.file)));
  return { meta, heights: new ValueGrid(meta.height.width, meta.height.height, data, decodeI16), url };
}

export const loadRegions = async (base: string): Promise<RegionsDoc> =>
  parseRegions(await getJson(`${base}data/regions.json`));
```

- [ ] **Step 7: Run everything.** `npm test && npm run typecheck && npm run lint`. Expected: PASS. Run `npx prettier --write src` first if prettier complains about the formatting of the code above.

- [ ] **Step 8: Commit (ask first).** `feat(web): typed data contract, loaders and value grids`

---

### Task 11: Globe and polar-cap geometry

**Files:**
- Create: `web/src/scene/globeGeometry.ts`, `web/src/scene/capGeometry.ts`, `web/src/scene/globeGeometry.test.ts`, `web/src/scene/capGeometry.test.ts`

**Interfaces:**
- Consumes: `latLonToVec3`, `psInverse`, `MOON_RADIUS_M` (Task 9); `ValueGrid`, `PoleMeta` (Task 10).
- Produces:
  - `SCENE_RADIUS = 1`
  - `heightScale(exaggeration: number): number` (metres → scene units)
  - `equirectHeightAt(grid: ValueGrid): (lat: number, lon: number) => number`
  - `buildGlobeGeometry(o: GlobeOptions): THREE.BufferGeometry`, where `GlobeOptions = { latLimitDeg; lonSegments; latSegments; heightAt; exaggeration }`
  - `buildCapGeometry(meta: PoleMeta, heights: ValueGrid, exaggeration: number, overlapDeg: number): THREE.BufferGeometry` (attributes `position`, `normal`, `uv`, `edgeFade`)

- [ ] **Step 1: Write the failing tests**

`src/scene/globeGeometry.test.ts`:

```ts
import { expect, it } from 'vitest';
import { buildGlobeGeometry, heightScale } from './globeGeometry';

it('respects the latitude limit and displaces radially', () => {
  const g = buildGlobeGeometry({ latLimitDeg: 80.3, lonSegments: 8, latSegments: 4, heightAt: () => 1000, exaggeration: 5 });
  const pos = g.getAttribute('position');
  const r = 1 + 1000 * heightScale(5);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    expect(Math.hypot(pos.getX(i), y, pos.getZ(i))).toBeCloseTo(r, 6);
    expect(Math.abs((Math.asin(y / r) * 180) / Math.PI)).toBeLessThanOrEqual(80.3 + 1e-9);
  }
  expect(g.getIndex()!.count).toBe(8 * 4 * 6);
});

it('uses equirect uvs: u=0 at lon -180, v at north limit', () => {
  const g = buildGlobeGeometry({ latLimitDeg: 80, lonSegments: 4, latSegments: 2, heightAt: () => 0, exaggeration: 1 });
  const uv = g.getAttribute('uv');
  expect(uv.getX(0)).toBe(0);
  expect(uv.getY(0)).toBeCloseTo(170 / 180, 12);
});

it('faces outward', () => {
  const g = buildGlobeGeometry({ latLimitDeg: 60, lonSegments: 16, latSegments: 8, heightAt: () => 0, exaggeration: 1 });
  const n = g.getAttribute('normal');
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    expect(n.getX(i) * p.getX(i) + n.getY(i) * p.getY(i) + n.getZ(i) * p.getZ(i)).toBeGreaterThan(0);
  }
});
```
`src/scene/capGeometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ValueGrid, decodeI16 } from '../data/grid';
import type { PoleMeta } from '../data/schema';
import { buildCapGeometry } from './capGeometry';

const meta = (lat0: number): PoleMeta => ({
  version: 1,
  pole: lat0 < 0 ? 'south' : 'north',
  crs: { lat0, k0: 0.994, falseEasting: 500000, falseNorthing: 500000, radius: 1737400 },
  grid: { x0: 197863.76, y0: 802136.24, pixelSize: 238.56, width: 2560, height: 2560 },
  mesh: { file: '', width: 8, height: 8, stride: 320, units: 'm' },
  base: { file: '' },
  edgeLatDeg: 80,
  layers: [],
});
const flat = new ValueGrid(8, 8, new Int16Array(64), decodeI16);

describe.each([-90, 90])('cap lat0=%i', (lat0) => {
  const g = buildCapGeometry(meta(lat0), flat, 1, 0.3);

  it('keeps inner triangles only and maps uv to grid cells', () => {
    expect(g.getAttribute('position').count).toBe(64);
    expect(g.getIndex()!.count).toBeGreaterThan(0);
    expect(g.getIndex()!.count).toBeLessThan(7 * 7 * 6);
    const uv = g.getAttribute('uv');
    expect(uv.getX(0)).toBeCloseTo(0.5 / 8, 12);
    expect(uv.getY(0)).toBeCloseTo(1 - 0.5 / 8, 12);
  });

  it('edgeFade is within [0,1] and normals face outward', () => {
    const fade = g.getAttribute('edgeFade');
    const n = g.getAttribute('normal');
    const p = g.getAttribute('position');
    const used = new Set(Array.from(g.getIndex()!.array));
    for (const i of used) {
      expect(fade.getX(i)).toBeGreaterThanOrEqual(0);
      expect(fade.getX(i)).toBeLessThanOrEqual(1);
      expect(n.getX(i) * p.getX(i) + n.getY(i) * p.getY(i) + n.getZ(i) * p.getZ(i)).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run them.** Expected: FAIL (modules missing).

- [ ] **Step 3: Implement `globeGeometry.ts`**

```ts
import * as THREE from 'three';
import type { ValueGrid } from '../data/grid';
import { MOON_RADIUS_M } from '../geo/constants';
import { latLonToVec3 } from '../geo/sphere';

export const SCENE_RADIUS = 1;
export const heightScale = (exaggeration: number): number => (exaggeration * SCENE_RADIUS) / MOON_RADIUS_M;

export interface GlobeOptions {
  latLimitDeg: number;
  lonSegments: number;
  latSegments: number;
  heightAt: (lat: number, lon: number) => number;
  exaggeration: number;
}

export function equirectHeightAt(grid: ValueGrid): (lat: number, lon: number) => number {
  return (lat, lon) => grid.bilinear((lon + 180) / 360, (90 - lat) / 180) ?? 0;
}

function gridIndex(cols: number, rows: number): number[] {
  const index: number[] = [];
  const row = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * row + i;
      index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  return index;
}

export function buildGlobeGeometry(o: GlobeOptions): THREE.BufferGeometry {
  const s = heightScale(o.exaggeration);
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let j = 0; j <= o.latSegments; j++) {
    const lat = o.latLimitDeg - (2 * o.latLimitDeg * j) / o.latSegments;
    for (let i = 0; i <= o.lonSegments; i++) {
      const lon = -180 + (360 * i) / o.lonSegments;
      positions.push(...latLonToVec3(lat, lon, SCENE_RADIUS + o.heightAt(lat, lon) * s));
      uvs.push(i / o.lonSegments, (lat + 90) / 180);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(gridIndex(o.lonSegments, o.latSegments));
  g.computeVertexNormals();
  return g;
}
```
If the "faces outward" test fails, swap the winding in `gridIndex` to `(a, a + 1, a + row, a + 1, a + row + 1, a + row)`. The test decides; don't guess.

- [ ] **Step 4: Implement `capGeometry.ts`**

```ts
import * as THREE from 'three';
import type { ValueGrid } from '../data/grid';
import type { PoleMeta } from '../data/schema';
import { psInverse } from '../geo/polarStereo';
import { latLonToVec3 } from '../geo/sphere';
import { SCENE_RADIUS, heightScale } from './globeGeometry';

interface CapVertices { positions: Float32Array; uvs: Float32Array; fade: Float32Array; absLat: Float32Array }

function capVertices(meta: PoleMeta, heights: ValueGrid, exaggeration: number, overlapDeg: number): CapVertices {
  const { width: w, height: h } = meta.mesh;
  const cell = (meta.grid.width * meta.grid.pixelSize) / w;
  const s = heightScale(exaggeration);
  const out = { positions: new Float32Array(w * h * 3), uvs: new Float32Array(w * h * 2),
    fade: new Float32Array(w * h), absLat: new Float32Array(w * h) };
  const inner = meta.edgeLatDeg - overlapDeg;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const k = r * w + c;
      const { lat, lon } = psInverse(meta.grid.x0 + (c + 0.5) * cell, meta.grid.y0 - (r + 0.5) * cell, meta.crs);
      const hgt = heights.sample((c + 0.5) / w, (r + 0.5) / h) ?? 0;
      out.positions.set(latLonToVec3(lat, lon, SCENE_RADIUS + hgt * s), k * 3);
      out.uvs.set([(c + 0.5) / w, 1 - (r + 0.5) / h], k * 2);
      out.absLat[k] = Math.abs(lat);
      out.fade[k] = Math.min(1, Math.max(0, (Math.abs(lat) - inner) / (2 * overlapDeg)));
    }
  }
  return out;
}

function capIndex(w: number, h: number, absLat: Float32Array, minLat: number, flip: boolean): number[] {
  const index: number[] = [];
  for (let r = 0; r < h - 1; r++) {
    for (let c = 0; c < w - 1; c++) {
      const a = r * w + c;
      const quad = [a, a + 1, a + w, a + w + 1];
      if (!quad.every((q) => (absLat[q] ?? 0) >= minLat)) continue;
      const [p, q, d, e] = quad as [number, number, number, number];
      index.push(...(flip ? [p, q, d, q, e, d] : [p, d, q, q, d, e]));
    }
  }
  return index;
}

export function buildCapGeometry(meta: PoleMeta, heights: ValueGrid, exaggeration: number, overlapDeg: number): THREE.BufferGeometry {
  const v = capVertices(meta, heights, exaggeration, overlapDeg);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(v.positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(v.uvs, 2));
  g.setAttribute('edgeFade', new THREE.BufferAttribute(v.fade, 1));
  g.setIndex(capIndex(meta.mesh.width, meta.mesh.height, v.absLat, meta.edgeLatDeg - overlapDeg, meta.crs.lat0 > 0));
  g.computeVertexNormals();
  return g;
}
```
PS x/y mirrors between the poles, so the winding differs: `flip` is set for the north cap. If the outward-normal test fails for one pole, invert the `flip` expression; the test decides.

- [ ] **Step 5: Run everything.** `npm test && npm run typecheck && npm run lint`. Expected: PASS for both poles.

- [ ] **Step 6: Commit (ask first).** `feat(web): globe and polar-cap geometry builders`

---

### Task 12: Scene, materials, camera, picking (first visible Moon)

**Files:**
- Create: `web/src/scene/picking.ts`, `web/src/scene/picking.test.ts`, `web/src/scene/scene.ts`, `web/src/main.ts`, `web/src/ui/layers.ts` (stub), `web/src/ui/styles.css`
- Modify: `web/index.html`

**Interfaces:**
- Consumes: Tasks 9–11.
- Produces:
  - `lookupValues(pole: LoadedPole, lat: number, lon: number): PickValues`, with `PickValues = { uv: [number, number] | null; values: Record<string, number | null>; elevationM: number | null }`
  - `interface PickResult { lat: number; lon: number; elevationM: number | null; pole: Pole | null; values: Record<string, number | null> }`
  - `createAtlasScene(canvas: HTMLCanvasElement, globe: LoadedGlobe, poles: LoadedPole[], opts: { exaggeration: number }): AtlasScene`
  - `interface AtlasScene { setLayer(layerId: string | null): void; setTestOutline(on: boolean): void; setOpacity(v: number): void; flyTo(lat: number, lon: number, altitude: number): void; pick(ndcX: number, ndcY: number): PickResult | null; addRegionOutlines(doc: RegionsDoc): void; highlightRegion(id: string | null): void; dispose(): void }`

- [ ] **Step 1: Write the failing test** `src/scene/picking.test.ts`

```ts
import { expect, it } from 'vitest';
import { ValueGrid, decodeI16, decodeU8 } from '../data/grid';
import type { LoadedPole } from '../data/load';
import type { PoleMeta } from '../data/schema';
import { lookupValues } from './picking';

const meta: PoleMeta = {
  version: 1,
  pole: 'south',
  crs: { lat0: -90, k0: 0.994, falseEasting: 500000, falseNorthing: 500000, radius: 1737400 },
  grid: { x0: 197863.76, y0: 802136.24, pixelSize: 238.56, width: 2560, height: 2560 },
  mesh: { file: '', width: 2, height: 2, stride: 1280, units: 'm' },
  base: { file: '' },
  edgeLatDeg: 80,
  layers: [],
};
const pole: LoadedPole = {
  meta,
  url: (f) => f,
  heights: new ValueGrid(2, 2, Int16Array.from([10, 20, 30, 40]), decodeI16),
  values: { pred: new ValueGrid(2, 2, Uint8Array.from([0, 254, 127, 255]), decodeU8(0, 1)) },
};

it('maps the south pole into the cell containing (500000, 500000)', () => {
  const out = lookupValues(pole, -90, 0);
  expect(out.uv![0]).toBeCloseTo((500000 - 197863.76) / (2560 * 238.56), 9);
  expect(out.elevationM).toBe(10); // u = v ≈ 0.4947 → row 0, col 0
  expect(out.values.pred).toBe(0);
});

it('returns nothing equatorward of the cap or on the other hemisphere', () => {
  expect(lookupValues(pole, -70, 0).uv).toBeNull();
  expect(lookupValues(pole, 85, 0).uv).toBeNull();
});
```
Why row 0, col 0: u = 302,136.24 / 610,713.6 = 0.4947 and v = (802,136.24 − 500,000) / 610,713.6 = 0.4947. The pole lands just inside the upper-left cell because the grid is offset toward +x/−y (addendum §3).

- [ ] **Step 2: Run it.** Expected: FAIL (module missing).

- [ ] **Step 3: Implement `picking.ts`**

```ts
import type { LoadedPole } from '../data/load';
import type { Pole } from '../geo/polarStereo';
import { psForward } from '../geo/polarStereo';

export interface PickValues { uv: [number, number] | null; values: Record<string, number | null>; elevationM: number | null }
export interface PickResult { lat: number; lon: number; elevationM: number | null; pole: Pole | null; values: Record<string, number | null> }

const EMPTY: PickValues = { uv: null, values: {}, elevationM: null };

export function lookupValues(pole: LoadedPole, lat: number, lon: number): PickValues {
  const { meta } = pole;
  const sameHemisphere = meta.crs.lat0 < 0 ? lat < 0 : lat > 0;
  if (!sameHemisphere || Math.abs(lat) < meta.edgeLatDeg) return EMPTY;
  const { x, y } = psForward(lat, lon, meta.crs);
  const span = meta.grid.width * meta.grid.pixelSize;
  const u = (x - meta.grid.x0) / span;
  const v = (meta.grid.y0 - y) / span; // top-down, matching ValueGrid rows
  if (u < 0 || u > 1 || v < 0 || v > 1) return EMPTY;
  const values = Object.fromEntries(Object.entries(pole.values).map(([id, g]) => [id, g.sample(u, v)]));
  return { uv: [u, v], values, elevationM: pole.heights.sample(u, v) };
}
```

- [ ] **Step 4: Run it.** Expected: PASS.

- [ ] **Step 5: Implement `scene.ts`.** The pieces below all go in one file (target ≤ 300 lines; split `regionsLayer.ts` out if it grows past that), with each function under 50 lines:
  - **`createRenderer(canvas)`:**
    - `new THREE.WebGLRenderer({ canvas, antialias: true })`, `outputColorSpace = THREE.SRGBColorSpace`, `setPixelRatio(Math.min(devicePixelRatio, 2))`, clear colour `#0b0b0c`.
  - **`createCamera()`:**
    - `PerspectiveCamera(35, aspect, 0.001, 100)` at `(0, 0.6, 3.2)`.
    - `OrbitControls` from `three/addons/controls/OrbitControls.js` with `enableDamping = true`, `minDistance = 1.03`, `maxDistance = 8`, `enablePan = false`.
  - **`addLights(scene)`:**
    - `AmbientLight(0xffffff, 0.35)`
    - `DirectionalLight(0xffffff, 2.2)` at `(5, 2, 3)`
    - fill `DirectionalLight(0xffffff, 0.6)` at `(0, -5, 2)`, so the south cap reads well
  - **`createGlobe(globe, exaggeration, maxAnisotropy)`:**
    - Geometry: `buildGlobeGeometry({ latLimitDeg: 80.3, lonSegments: 720, latSegments: 360, heightAt: equirectHeightAt(globe.heights), exaggeration })`.
    - Material: `MeshStandardMaterial({ roughness: 1, metalness: 0 })`, with a texture from `globe.url(innerWidth < 900 ? color.lo : color.hi)`, `colorSpace = SRGBColorSpace` and `anisotropy = maxAnisotropy`.
  - **`createCap(pole, exaggeration)`:** returns `{ base: Mesh, overlay: Mesh, outline: Mesh }`, which share one `buildCapGeometry(meta, heights, exaggeration, 0.3)`.
    - **base:** `MeshStandardMaterial({ map: hillshade, color: 0xb9b7b0, transparent: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })`, with an `onBeforeCompile` patch:

```ts
material.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float edgeFade;\nvarying float vFade;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = edgeFade;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vFade;')
    .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vFade;');
};
```
    - **overlay:** `MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, opacity: 0.85 })`, with the same `edgeFade` patch.
    - **outline:** the same as overlay, but it always shows `test.png` when enabled.
    - Textures come from a `Map<string, THREE.Texture>` cache (load once, `colorSpace = SRGBColorSpace`).
  - **`setLayer(id)`:** for each cap, `overlay.visible = id !== null` and `overlay.material.map = texture(pole.url(layer.texture))` for the layer with that id; set `material.needsUpdate = true`.
  - **`pick(ndcX, ndcY)`:**
    - `Raycaster.setFromCamera` → intersect `[globeMesh, ...capBaseMeshes]` → first hit → `vec3ToLatLon`.
    - If `|lat| ≥ 80`, use `lookupValues` for the matching pole. Otherwise elevation comes from `globe.heights.bilinear((lon+180)/360, (90-lat)/180)` and values are `{}`.
    - Return `PickResult` with `pole` set only when `uv !== null`.
  - **`flyTo(lat, lon, altitude)`:**
    - Target `latLonToVec3(lat, lon, 1 + altitude)`. Slerp the camera direction and lerp the distance over 1,200 ms via `requestAnimationFrame`.
    - `controls.target` stays at the origin.
    - If `matchMedia('(prefers-reduced-motion: reduce)').matches`, set the position immediately.
  - **`addRegionOutlines(doc)`:**
    - For each region, build a `THREE.LineLoop` from its outline points. Each point is `latLonToVec3(lat, lon, 1 + ((lookupValues(southPole, lat, lon).elevationM ?? 0) + 150) * heightScale(exaggeration))`.
    - Material: `LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: true })`. Keep a `Map<id, LineLoop>`.
  - **`highlightRegion(id)`:** all loops go back to white at 0.8 opacity; the selected loop gets `color 0xeda100` at opacity 1 and `renderOrder = 10`. (The amber accent is reserved for selection only.)
  - **Render loop and resize:**
    - `renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); })`.
    - A `ResizeObserver` on the canvas parent updates the renderer size and camera aspect.
  - **`dispose()`:** stops the loop, disconnects the observer, and disposes geometries, materials and cached textures.

- [ ] **Step 6: Implement `main.ts`, the stub `ui/layers.ts`, and `index.html`**

`src/ui/layers.ts` (stub, replaced in Task 13):

```ts
import type { LoadedPole } from '../data/load';
import type { RegionsDoc } from '../data/regionsSchema';
import type { AtlasScene } from '../scene/scene';

export interface UiContext { scene: AtlasScene; poles: LoadedPole[]; regions: RegionsDoc; exaggeration: number }

export function mountUi(ctx: UiContext): void {
  ctx.scene.setLayer('pred');
}
```
`src/main.ts`:

```ts
import './ui/styles.css';
import { loadGlobe, loadPole, loadRegions } from './data/load';
import { createAtlasScene } from './scene/scene';
import { mountUi } from './ui/layers';

const BASE = import.meta.env.BASE_URL;
const EXAGGERATION = 6;

async function start(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#moon');
  const status = document.querySelector<HTMLElement>('#status');
  if (!canvas || !status) throw new Error('index.html is missing #moon or #status');
  try {
    status.textContent = 'Loading lunar data…';
    const [globe, north, south, regions] = await Promise.all([
      loadGlobe(BASE), loadPole(BASE, 'north'), loadPole(BASE, 'south'), loadRegions(BASE),
    ]);
    const scene = createAtlasScene(canvas, globe, [north, south], { exaggeration: EXAGGERATION });
    scene.addRegionOutlines(regions);
    mountUi({ scene, poles: [north, south], regions, exaggeration: EXAGGERATION });
    status.hidden = true;
  } catch (err) {
    status.textContent = `Could not load the atlas data (${err instanceof Error ? err.message : String(err)}). Try reloading.`;
    status.setAttribute('role', 'alert');
    throw err;
  }
}

void start();
```
`index.html` body:

```html
<main class="app">
  <canvas id="moon" aria-label="Interactive 3D Moon showing ice prospectivity at the poles"></canvas>
  <p id="status" aria-live="polite"></p>
  <aside id="panel" aria-label="Map controls"></aside>
  <div id="readout" aria-live="polite"></div>
  <dialog id="about" aria-labelledby="about-title"></dialog>
</main>
<script type="module" src="/src/main.ts"></script>
```
`styles.css` defines tokens (`--surface: #1a1a19; --text: #ffffff; --text-2: #c3c2b7; --focus: #cde2fb; --accent: #eda100`) with the canvas full-viewport and the panel docked right (a bottom sheet under 700 px wide).

- [ ] **Step 7: Run tests, then look at it.** Run `npm test && npm run typecheck && npm run lint && npm run dev` and open http://localhost:5173. Check by eye:
  - (a) The globe is textured with visible relief.
  - (b) Both caps meet the globe at ~80° with no crack, z-fighting or hard tone step while orbiting.
  - (c) Cap relief lines up with LROC colour features at the rim (e.g. the Shackleton/de Gerlache area).
  - (d) The `pred` overlay is visible and the 9% crescent is visibly empty.
  - (e) The region outlines sit on the south cap.

  Tune the overlap, `polygonOffset` or fill-light intensity if needed. **Screenshot both poles and show the user.**

- [ ] **Step 8: Commit (ask first).** `feat(web): render displaced globe with polar caps and picking`

---

### Task 13: UI: layers, legend, readout, About (P1 complete)

**Files:**
- Create: `web/src/ui/legend.ts`, `web/src/ui/readout.ts`, `web/src/ui/about.ts`, `web/src/ui/legend.test.ts`, `web/src/ui/readout.test.ts`
- Modify: `web/src/ui/layers.ts` (replaces the stub), `web/src/ui/styles.css`

**Interfaces:**
- Consumes: the `AtlasScene` API and `PickResult` (Task 12), `LayerMeta` (Task 10).
- Produces:
  - `renderLegend(layer: LayerMeta): HTMLElement`
  - `formatReadout(p: PickResult): string[]`
  - `renderAbout(dialog: HTMLDialogElement, rmse: string): void`
  - `mountUi(ctx: UiContext): void` (full)
  - `el(tag, className, text?)` helper exported from `legend.ts` and reused by Task 14

**Design rules (from the dataviz skill):**
- Dark surface `#1a1a19`; text `#ffffff` / `#c3c2b7`, never in series colours.
- The legend sits under its layer name.
- Sequential legend: a continuous gradient with ticks 0 / 0.5 / 1. Diverging: ticks −0.2 / 0 / 0.2 plus the words "model lower" / "model higher".
- PSR: a hatched swatch plus the word "(hatched)", so it isn't colour alone.
- The readout always shows numbers as text.
- Focus ring: `outline: 2px solid var(--focus)`.

- [ ] **Step 1: Write the failing tests**

`src/ui/legend.test.ts`:

```ts
// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { renderLegend } from './legend';

it('renders a gradient with min/mid/max ticks for sequential layers', () => {
  const el = renderLegend({ id: 'pred', label: 'Predicted', texture: 'pred.png',
    legend: { kind: 'sequential', stops: ['#184f95', '#cde2fb'], min: 0, max: 1 } });
  expect(el.querySelector<HTMLElement>('.legend-bar')!.style.background).toContain('linear-gradient');
  expect([...el.querySelectorAll('.tick')].map((t) => t.textContent)).toEqual(['0', '0.5', '1']);
});

it('labels diverging poles in words and uses a true minus sign', () => {
  const el = renderLegend({ id: 'err', label: 'Model − reference', texture: 'err.png',
    legend: { kind: 'diverging', stops: ['#f4b3b0', '#383835', '#9ec5f4'], min: -0.2, max: 0.2 } });
  expect(el.textContent).toContain('model lower');
  expect(el.textContent).toContain('model higher');
  expect(el.querySelector('.tick')!.textContent).toBe('−0.2');
});

it('marks binary layers as hatched', () => {
  const el = renderLegend({ id: 'psr', label: 'Permanently shadowed regions', texture: 'psr.png',
    legend: { kind: 'binary', stops: ['#9ec5f4'] } });
  expect(el.textContent).toContain('(hatched)');
  expect(el.querySelector('.swatch-binary')).not.toBeNull();
});
```
`src/ui/readout.test.ts`:

```ts
import { expect, it } from 'vitest';
import { formatReadout } from './readout';

it('formats coordinates, elevation and layer values', () => {
  const lines = formatReadout({ lat: -89.66, lon: 129.2, elevationM: -2210, pole: 'south',
    values: { pred: 0.8123, ref: null } });
  expect(lines).toEqual(['89.66°S, 129.20°E', 'Elevation −2,210 m', 'Predicted 0.81', 'Reference —']);
});

it('omits elevation when unknown', () => {
  expect(formatReadout({ lat: 10, lon: -20, elevationM: null, pole: null, values: {} })).toEqual(['10.00°N, 20.00°W']);
});
```

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement `readout.ts`**

```ts
import type { PickResult } from '../scene/picking';

const LABELS: Record<string, string> = { pred: 'Predicted', ref: 'Reference', err: 'Model − reference' };
const MINUS = '−';

const coord = (v: number, pos: string, neg: string): string => `${Math.abs(v).toFixed(2)}°${v >= 0 ? pos : neg}`;
const signed = (s: string): string => s.replace('-', MINUS);
const value = (v: number | null): string => (v === null ? '—' : signed(v.toFixed(2)));

export function formatReadout(p: PickResult): string[] {
  const lines = [`${coord(p.lat, 'N', 'S')}, ${coord(p.lon, 'E', 'W')}`];
  if (p.elevationM !== null) lines.push(`Elevation ${signed(Math.round(p.elevationM).toLocaleString('en-US'))} m`);
  return [...lines, ...Object.entries(p.values).map(([id, v]) => `${LABELS[id] ?? id} ${value(v)}`)];
}
```

- [ ] **Step 4: Implement `legend.ts`**

```ts
import type { LayerMeta } from '../data/schema';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const tick = (v: number): HTMLElement => el('span', 'tick', String(+v.toFixed(2)).replace('-', '−'));

export function renderLegend(layer: LayerMeta): HTMLElement {
  const root = el('div', 'legend');
  const { kind, stops, min = 0, max = 1 } = layer.legend;
  if (kind === 'binary' || kind === 'outline') {
    const swatch = el('span', `swatch swatch-${kind}`);
    swatch.style.setProperty('--c', stops[0] ?? '#ffffff');
    root.append(swatch, el('span', 'legend-label', kind === 'binary' ? `${layer.label} (hatched)` : layer.label));
    return root;
  }
  const bar = el('div', 'legend-bar');
  bar.style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
  const ticks = el('div', 'ticks');
  ticks.append(tick(min), tick((min + max) / 2), tick(max));
  root.append(bar, ticks);
  if (kind === 'diverging') {
    const poles = el('div', 'poles');
    poles.append(el('span', '', 'model lower'), el('span', '', 'model higher'));
    root.append(poles);
  }
  return root;
}
```
Add CSS for `.swatch-binary { background: repeating-linear-gradient(45deg, var(--c) 0 3px, transparent 3px 6px); }`.

- [ ] **Step 5: Implement `about.ts` and the full `layers.ts`:**
  - **`renderAbout(dialog, rmse)`** fills the dialog with:
    - The title "About the Lunar Ice Atlas".
    - The two model-card caveats quoted verbatim:
      - "The target is a knowledge-driven model, not measured ice"
      - "shouldn't substitute for instrumental measurements or operational decision-making regarding lunar landing sites"
    - "Vertical exaggeration ×6".
    - "Most polar patches were used to train the model; accuracy (RMSE ${rmse}) is measured on the 25 held-out test patches outlined when 'Show test patches' is on".
    - "About 9% of each polar cap has no model coverage in the benchmark (blank crescent)".
    - Credits, each with a link: NASA SVS CGI Moon Kit; NASA/IBM NI-LFM (Apache-2.0); SomBench (CC-BY-4.0); PDS LOLA GDR; USGS Artemis grids (CC0); Three.js (MIT).
    - A close button. `showModal()` gives native focus trapping, and Esc closes it.
  - **`mountUi(ctx)`** builds `#panel`:
    - An `<h1>Lunar Ice Atlas</h1>` and a one-line pitch.
    - `<fieldset><legend>Layer</legend>`: radio inputs for `pred` (checked), `ref`, `err`, `psr`, and "None". Each label shows the layer label with `renderLegend(layer)` beneath it. On change → `scene.setLayer(id | null)`.
    - A "Show held-out test patches" checkbox → `scene.setTestOutline(checked)`.
    - An opacity range input (`min 0`, `max 1`, `step 0.05`, `value 0.85`, `aria-label="Overlay opacity"`) → `scene.setOpacity`.
    - "North pole" / "South pole" buttons → `scene.flyTo(±89.9, 0, 0.9)`.
    - An "About" button → `about.showModal()`.
    - Hover: a `pointermove` on the canvas is throttled to one `requestAnimationFrame`. Convert to NDC, call `scene.pick`, and put `formatReadout(...).join(' · ')` in `#readout` (an empty string when there's no hit).
    - Keyboard: when the canvas has focus (`tabindex="0"`), pressing `i` picks at NDC (0, 0).
    - The RMSE string comes from a constant `TEST_RMSE` in `layers.ts`, copied from `docs/benchmarks.md` after Task 3.

- [ ] **Step 6: Run everything, then check by hand.** Run `npm test && npm run typecheck && npm run lint && npm run dev`. Every layer should switch with the right legend; hover values should change over the cap and show "—" in the crescent; the About dialog should open and close with Esc; and tabbing through every control should show a focus ring.

- [ ] **Step 7: Commit (ask first).** `feat(web): layer controls, legends, readout and about panel`

---

### Task 14: P3: Artemis region explorer

**Files:**
- Create: `web/src/ui/regions.ts`, `web/src/ui/regionChart.ts`, `web/src/ui/regions.test.ts`, `web/src/ui/regionChart.test.ts`
- Modify: `web/src/ui/layers.ts` (call `mountRegions` from `mountUi`)

**Interfaces:**
- Consumes: `RegionsDoc`, `Region`, `StatKey` (Task 10); `AtlasScene.flyTo/highlightRegion` (Task 12); `el` (Task 13).
- Produces:
  - `interface Metric { key: StatKey; label: string; note: string; format: (v: number) => string }`
  - `METRICS: readonly Metric[]`
  - `sortRegions(regions: readonly Region[], key: StatKey): Region[]` (pure, nulls last, no mutation)
  - `renderRegionChart(regions: readonly Region[], metric: Metric, selectedId: string | null): SVGSVGElement`
  - `renderRegionTable(regions: readonly Region[]): HTMLTableElement`
  - `renderRegionCard(region: Region): HTMLElement`
  - `mountRegions(container: HTMLElement, ctx: UiContext): void`

**Metrics** (region means over the polygon on the cap grid):

| key | label | format | note |
|---|---|---|---|
| `predMean` | Mean predicted prospectivity | `0.00` | "NI-LFM model output" |
| `fracPredGt05` | Area with prospectivity > 0.5 | `%` | "NI-LFM model output" |
| `fracSlopeLt8` | Area with slope < 8° | `%` | "HLS threshold; 240 m baseline is smoother than lander scale" |
| `fracSlopeLt5` | Area with slope < 5° | `%` | "HLS goal" |
| `fracPsr` | Area in permanent shadow | `%` | "LOLA-derived PSR mask" |
| `tmaxMeanK` | Mean max surface temperature | `0 K` | "Diviner" |

**Chart rules (dataviz):**
- One series, so there's no legend box; the title names the metric.
- Horizontal bars in a single hue `#3987e5`, with `rx=4` and 2 px row gaps, anchored at x = 0 on one axis.
- Selection gets **both** a lighter bar `#cde2fb` **and** a bold name.
- Each row is focusable and has `role="img"` plus an `aria-label` carrying the exact value; a `<title>` child gives a hover tooltip.
- A null value shows "no data" text instead of a bar.
- A "Table" toggle renders the same data as a `<table>`.
- A region with `coverage < 0.99` gets the note "partial model coverage (NN%)".

- [ ] **Step 1: Write the failing tests**

`src/ui/regions.test.ts`:

```ts
import { expect, it } from 'vitest';
import type { Region } from '../data/regionsSchema';
import { sortRegions } from './regions';

export const region = (id: string, predMean: number | null): Region => ({
  id, name: id, outline: [[0, -89], [1, -89], [1, -88]], centroid: [0.5, -88.5], coverage: 1,
  stats: { predMean, predP90: null, fracPredGt05: null, refMean: null, slopeMeanDeg: null, fracSlopeLt5: null,
    fracSlopeLt8: null, fracPsr: null, psrDistMean: null, tmaxMeanK: null },
});

it('sorts descending with nulls last and does not mutate input', () => {
  const input = [region('a', 0.2), region('b', null), region('c', 0.9)];
  expect(sortRegions(input, 'predMean').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  expect(input.map((r) => r.id)).toEqual(['a', 'b', 'c']);
});
```
`src/ui/regionChart.test.ts`:

```ts
// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { METRICS, renderRegionChart, renderRegionTable } from './regionChart';
import { region } from './regions.test';

const regions = [region('a', 0.9), region('b', 0.5), region('c', null)];

it('draws one bar per non-null region and marks the selection twice', () => {
  const svg = renderRegionChart(regions, METRICS[0]!, 'b');
  expect(svg.querySelectorAll('rect.bar')).toHaveLength(2);
  expect(svg.querySelector('[data-id="c"]')!.textContent).toContain('no data');
  expect(svg.querySelector('[data-id="b"] text.name')!.getAttribute('font-weight')).toBe('700');
  expect(svg.querySelector('[data-id="b"] rect.bar')!.getAttribute('fill')).toBe('#cde2fb');
  expect(svg.querySelector('[data-id="a"]')!.getAttribute('aria-label')).toBe('a: 0.90');
});

it('table view carries the same values', () => {
  const table = renderRegionTable(regions);
  expect(table.querySelectorAll('tbody tr')).toHaveLength(3);
  expect(table.textContent).toContain('0.90');
});
```
(Importing the `region` helper from a test file is fine for vitest. If eslint objects, move it to `src/ui/__testutils__.ts`.)

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement `regions.ts` (`sortRegions`, `renderRegionCard`, `mountRegions`)**

```ts
import type { Region, StatKey } from '../data/regionsSchema';
import { el } from './legend';
import type { UiContext } from './layers';
import { METRICS, renderRegionChart, renderRegionTable } from './regionChart';

export function sortRegions(regions: readonly Region[], key: StatKey): Region[] {
  return [...regions].sort((a, b) => {
    const va = a.stats[key];
    const vb = b.stats[key];
    if (va === null && vb === null) return a.name.localeCompare(b.name);
    if (va === null) return 1;
    if (vb === null) return -1;
    return vb - va;
  });
}

export function renderRegionCard(region: Region): HTMLElement {
  const card = el('section', 'region-card');
  card.append(el('h3', '', region.name));
  if (region.coverage < 0.99) card.append(el('p', 'note', `Partial model coverage (${Math.round(region.coverage * 100)}%)`));
  const tiles = el('dl', 'stat-tiles');
  for (const m of METRICS) {
    const v = region.stats[m.key];
    tiles.append(el('dt', '', m.label), el('dd', 'value', v === null ? 'no data' : m.format(v)), el('dd', 'note', m.note));
  }
  card.append(tiles);
  return card;
}

export function mountRegions(container: HTMLElement, ctx: UiContext): void {
  let metric = METRICS[0]!;
  let selected: string | null = null;
  let showTable = false;
  const section = el('section', 'regions');
  const chartSlot = el('div', 'chart-slot');
  const cardSlot = el('div', 'card-slot');
  const list = el('div', 'region-list');
  const select = el('select');
  select.setAttribute('aria-label', 'Compare regions by');
  METRICS.forEach((m, i) => select.append(new Option(m.label, String(i))));
  const tableToggle = el('button', 'link', 'Table');
  const render = (): void => {
    chartSlot.replaceChildren(showTable ? renderRegionTable(ctx.regions.regions)
      : renderRegionChart(sortRegions(ctx.regions.regions, metric.key), metric, selected));
    list.replaceChildren(...sortRegions(ctx.regions.regions, metric.key).map((r) => {
      const b = el('button', r.id === selected ? 'region selected' : 'region', r.name);
      b.setAttribute('aria-pressed', String(r.id === selected));
      b.addEventListener('click', () => {
        selected = r.id;
        ctx.scene.flyTo(r.centroid[1], r.centroid[0], 0.12);
        ctx.scene.highlightRegion(r.id);
        cardSlot.replaceChildren(renderRegionCard(r));
        render();
      });
      return b;
    }));
  };
  select.addEventListener('change', () => { metric = METRICS[Number(select.value)]!; render(); });
  tableToggle.addEventListener('click', () => { showTable = !showTable; tableToggle.textContent = showTable ? 'Chart' : 'Table'; render(); });
  section.append(
    el('h2', '', 'Artemis candidate landing regions'),
    el('p', 'lede', 'Nine regions near the south pole, announced Oct 2024 for Artemis III. After NASA\'s Feb 2026 restructuring, the first crewed landing is Artemis IV (early 2028).'),
    select, tableToggle, chartSlot, list, cardSlot,
    el('p', 'fineprint', `Region outlines: USGS, DOI ${ctx.regions.doi} (CC0), retrieved ${ctx.regions.retrieved}. Statistics are illustrative and not for landing-site decisions.`),
  );
  container.append(section);
  render();
}
```
`mountRegions` is about 45 lines. If eslint's complexity rule or the 50-line rule trips, split out `renderList(...)`.

- [ ] **Step 4: Implement `regionChart.ts`**

```ts
import type { Region, StatKey } from '../data/regionsSchema';

export interface Metric { key: StatKey; label: string; note: string; format: (v: number) => string }

const pct = (v: number): string => `${Math.round(v * 100)}%`;
export const METRICS: readonly Metric[] = [
  { key: 'predMean', label: 'Mean predicted prospectivity', note: 'NI-LFM model output', format: (v) => v.toFixed(2) },
  { key: 'fracPredGt05', label: 'Area with prospectivity > 0.5', note: 'NI-LFM model output', format: pct },
  { key: 'fracSlopeLt8', label: 'Area with slope < 8°', note: 'HLS threshold; 240 m baseline is smoother than lander scale', format: pct },
  { key: 'fracSlopeLt5', label: 'Area with slope < 5°', note: 'HLS goal', format: pct },
  { key: 'fracPsr', label: 'Area in permanent shadow', note: 'LOLA-derived PSR mask', format: pct },
  { key: 'tmaxMeanK', label: 'Mean max surface temperature', note: 'Diviner', format: (v) => `${v.toFixed(0)} K` },
];

const NS = 'http://www.w3.org/2000/svg';
const ROW_H = 28;
const LABEL_W = 130;
const BAR_W = 150;
const BAR = '#3987e5';
const BAR_SELECTED = '#cde2fb';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

function row(region: Region, metric: Metric, i: number, maxV: number, selected: boolean): SVGGElement {
  const v = region.stats[metric.key];
  const text = v === null ? 'no data' : metric.format(v);
  const g = svgEl('g', { 'data-id': region.id, transform: `translate(0 ${i * ROW_H})`, tabindex: 0, role: 'img',
    'aria-label': `${region.name}: ${text}` });
  const title = svgEl('title', {});
  title.textContent = `${region.name}: ${text}`;
  const name = svgEl('text', { class: 'name', x: 0, y: 18, fill: '#ffffff', 'font-weight': selected ? 700 : 400 });
  name.textContent = region.name;
  g.append(title, name);
  if (v !== null) {
    g.append(svgEl('rect', { class: 'bar', x: LABEL_W, y: 6, height: ROW_H - 12, rx: 4,
      width: Math.max(2, (v / maxV) * BAR_W), fill: selected ? BAR_SELECTED : BAR }));
  }
  const label = svgEl('text', { class: 'value', x: LABEL_W + (v === null ? 0 : (v / maxV) * BAR_W) + 6, y: 18, fill: '#c3c2b7' });
  label.textContent = text;
  g.append(label);
  return g;
}

export function renderRegionChart(regions: readonly Region[], metric: Metric, selectedId: string | null): SVGSVGElement {
  const values = regions.map((r) => r.stats[metric.key]).filter((v): v is number => v !== null);
  const maxV = Math.max(...values, 1e-9);
  const svg = svgEl('svg', { viewBox: `0 0 ${LABEL_W + BAR_W + 60} ${regions.length * ROW_H}`, width: '100%',
    role: 'group', 'aria-label': metric.label });
  regions.forEach((r, i) => svg.append(row(r, metric, i, maxV, r.id === selectedId)));
  return svg;
}

export function renderRegionTable(regions: readonly Region[]): HTMLTableElement {
  const table = document.createElement('table');
  const head = table.createTHead().insertRow();
  ['Region', ...METRICS.map((m) => m.label)].forEach((h) => { const th = document.createElement('th'); th.textContent = h; head.append(th); });
  const body = table.createTBody();
  regions.forEach((r) => {
    const tr = body.insertRow();
    tr.insertCell().textContent = r.name;
    METRICS.forEach((m) => { const v = r.stats[m.key]; tr.insertCell().textContent = v === null ? 'no data' : m.format(v); });
  });
  return table;
}
```
The `maxV` scale assumes non-negative metrics, which is true for all six.

- [ ] **Step 5: Wire it up.** In `mountUi`, after the layer controls, call `mountRegions(panel, ctx)`.

- [ ] **Step 6: Run everything, then check by hand.** Run `npm test && npm run typecheck && npm run lint && npm run dev`. All 9 outlines should show on the south cap. Clicking a region should fly to it, turn the outline amber, and show its card; the chart should re-sort and restyle when the metric changes; and the Table toggle should work. **Screenshot a selected region and show the user.**

- [ ] **Step 7: Commit (ask first).** `feat(web): Artemis candidate region explorer`

---

### Task 15: E2E, performance, accessibility, deploy, docs

**Files:**
- Create: `web/playwright.config.ts`, `web/e2e/atlas.spec.ts`, `.github/workflows/pages.yml`, `README.md`
- Modify: `CLAUDE.md` (Commands and Conventions → the real, verified commands), `docs/benchmarks.md`

- [ ] **Step 1: Write the E2E tests** `web/e2e/atlas.spec.ts`

```ts
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#status')).toBeHidden({ timeout: 60_000 });
});

test('renders a non-blank globe and switches layers without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = await page.locator('#moon').screenshot();
  expect(shot.byteLength).toBeGreaterThan(20_000);
  await page.getByRole('radio', { name: /Model − reference/ }).check();
  await expect(page.locator('#panel')).toContainText('model higher');
  expect(errors).toEqual([]);
});

test('region explorer shows a card for Haworth', async ({ page }) => {
  await page.getByRole('button', { name: 'Haworth', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Haworth' })).toBeVisible();
  await expect(page.locator('.region-card')).toContainText('Area with slope < 8°');
});

test('about dialog quotes the model caveats', async ({ page }) => {
  await page.getByRole('button', { name: 'About' }).click();
  await expect(page.getByRole('dialog')).toContainText('not measured ice');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});
```
`web/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  use: { baseURL: 'http://localhost:4173', launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader'] } },
  webServer: { command: 'npm run build && npm run preview', port: 4173, reuseExistingServer: true, timeout: 120_000 },
});
```

- [ ] **Step 2: Run it.** `npm run e2e`. Expected: `3 passed`. Fix failures in the app, not by loosening assertions.

- [ ] **Step 3: Performance.**
  - Run `npm run build && du -sh dist`; the result must be ≤ 40 MB.
  - Run Lighthouse (Chrome DevTools, desktop) on `npm run preview`.
  - Orbit for 10 s with the Performance panel recording; target ≥ 50 fps on the M1 Pro.
  - If it's slower, drop the globe segments to 512×256 first, then set `MESH_STRIDE = 8` and rebuild.
  - Record the dist size, Lighthouse scores and fps in `docs/benchmarks.md`.

- [ ] **Step 4: Accessibility pass.**
  - Tab order runs panel → canvas, with a visible focus ring everywhere.
  - `prefers-reduced-motion` makes `flyTo` jump instead of animate (check via DevTools rendering emulation).
  - All text contrast is ≥ 4.5:1 on `#1a1a19`: `#c3c2b7` measures ≈ 10:1.
  - The region chart has its table view.
  - The canvas has an `aria-label`, and the readout is `aria-live="polite"`.

- [ ] **Step 5: Deploy.** Ask the user for the GitHub repo name and whether it's public, then write `.github/workflows/pages.yml`:

```yaml
name: pages
on:
  push: { branches: [main] }
  workflow_dispatch:
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm, cache-dependency-path: web/package-lock.json }
      - run: npm ci
        working-directory: web
      - run: npm test && npm run lint && npm run build
        working-directory: web
        env: { BASE_PATH: "/${{ github.event.repository.name }}/" }
      - uses: actions/upload-pages-artifact@v3
        with: { path: web/dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.deployment.outputs.page_url }}" }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```
The pipeline doesn't run in CI, because it needs about 2 GB of data and the model. `web/public/data` is committed as build input.

- [ ] **Step 6: Docs.**
  - `README.md` contains:
    - a GIF of the orbit and a region fly-to (record with QuickTime → `ffmpeg -i in.mov -vf "fps=12,scale=900:-1" demo.gif`)
    - a pitch paragraph
    - the architecture diagram
    - "Reproduce" steps: `scripts/fetch_data.sh` → `scripts/predict_all.sh` → `python -m atlas.build all` → `cd web && npm ci && npm run dev`
    - the benchmark table, caveats and credits
  - Update CLAUDE.md → Commands and Conventions with the verified commands, replacing every `TBD`.

- [ ] **Step 7: Final verification.** Every step must pass. Paste the summary to the user.

```bash
pytest -q && pytest -m data -q && ruff check pipeline && mypy \
  && (cd web && npm test && npm run typecheck && npm run lint && npm run e2e)
```

- [ ] **Step 8: Commit and push (ask first).** `feat: e2e tests, accessibility pass and GitHub Pages deploy`. Push only after the user has created the repo and approved.

---

## Milestone map (links RESEARCH.md milestones to tasks)

| RESEARCH.md milestone | Tasks | Est. effort |
|---|---|---|
| M0 env + CPU benchmark | 0, 1 | 0.5–1 day |
| M1 full-cap inference | 2, 3, 4 | 1 day (+ compute time) |
| M2 web export | 5, 6, 8 | 2 days |
| M3 Three.js globe | 9, 10, 11, 12 | 3–4 days |
| M4 caps + overlays | 12, 13 | 2–3 days |
| M6 (P3) Artemis regions | 7, 14 | 2–3 days (+ manual USGS download) |
| M5 polish + deploy | 15 | 2 days |

About 3–4 weeks part-time. P3 moved from stretch goal to committed scope at the user's request.

## Risks (plan-specific; see RESEARCH.md §8 for the rest)

| Risk | Likelihood | Mitigation / trigger |
|---|---|---|
| CLI overrides (`backbone_checkpoint_path null`, `--custom_modules_path`) are rejected | Med | Task 1 fallbacks (download the 2.4 GB backbone; run from `vendor/ni-lfm` with absolute data roots) |
| `terratorch predict` output names or transforms differ from expectations | Low | Task 3 Step 6 tests check the count, dtype, transform and test RMSE before anything consumes the tiles |
| North-pole DEM alignment differs from the south (not spot-checked in research) | Low | Task 5 data test is parametrised over both poles; stop if r < 0.99 |
| ScienceBase blocks downloads, or the zip has no 9-polygon layer | Med | Manual browser download; else Cesium ion asset 2683531 with the user's token; **never** invented coordinates |
| Cap/globe seam artefacts (cracks, z-fighting, tone jump at 80°) | Med | 0.3° overlap + `edgeFade` alpha + `polygonOffset`; visual check at Task 12 Step 7 |
| Triangle winding flipped on one pole | Med | Outward-normal unit tests for the globe and both caps (Task 11) |
| Headless WebGL flaky in Playwright | Med | SwiftShader flags; e2e runs locally; CI runs unit tests and the build only |
| Payload > 40 MB | Low–Med | Lossless WebP overlays, a 2k colour map on small screens, `MESH_STRIDE = 8` |
| Over-claiming science | Med | Caveat copy fixed in Tasks 13–14 and asserted by e2e |
| Artemis plans change again | Low | Copy cites dated NASA pages; `retrieved` is stamped in regions.json |

## Self-review

- **Spec coverage:**
  - Globe with LROC colour + LOLA displacement → Tasks 8, 11, 12.
  - Polar caps with 240 m relief → Tasks 5, 11, 12.
  - Prediction/reference/error/PSR/test toggles → Tasks 6, 13.
  - Opacity, legend, hover readout, About with caveats → Task 13.
  - Static deploy → Task 15.
  - P3 region outlines + per-region stats + comparison chart → Tasks 7, 8, 14.
  - M0 go/no-go gate → Task 1.
  - "First step runnable on a laptop" → Tasks 0–1.
- **Placeholder scan:** Three steps are deliberate discovery against external files that couldn't be read in advance: the shapefile path and name field (Task 7 Step 1), the `LPSR_DIS` units (Task 7 Step 6) and the predict output suffix (Task 3 Step 5). Each has an exact command, a place to record the answer, and a stop condition. There are no TBD code blocks.
- **Type consistency:**
  - `PoleLayers` (Task 6) is built in Task 8's `pole_layers`.
  - `StatLayers`/`region_stats` (Task 7) are used in Task 8's `build_regions`.
  - The meta.json v1 keys (Task 6 `_meta`) match `parsePoleMeta` (Task 10).
  - `STAT_KEYS` (Task 10) equals the `region_stats` keys minus `coverage`, which `_region_entry` pops.
  - `PickResult` is defined in `picking.ts` (Task 12) and consumed by `formatReadout` (Task 13).
  - `UiContext` is defined in `ui/layers.ts` (Task 12 stub) and used by `mountRegions` (Task 14).
  - The `AtlasScene` methods used in Tasks 13–14 (`setLayer`, `setTestOutline`, `setOpacity`, `flyTo`, `pick`, `highlightRegion`) are all declared in Task 12.
