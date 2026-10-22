# CLAUDE.md

## Project Overview
Portfolio project built on the NASA-IBM Lunar Foundation Model (NI-LFM, released 2026-09-10, Apache-2.0).
Centerpiece: an interactive 3D Moon that drapes the model's downstream outputs over real lunar elevation.
Scope: **P1 Lunar Ice Atlas + P3 Artemis region explorer**.
Phase: built and deployable (plan.md Tasks 0–14, then `docs/superpowers/plans/2026-10-21-nasa-moon-pole-maps-and-ship.md`, which replaced the displaced-globe front end and finished Task 15). **Follow the plans task by task.** `RESEARCH.md` is a frozen spec; `plan.md`'s research addendum overrides it where they differ.

## Tech Stack
- Model runtime: Python 3.12 + PyTorch (CPU) + TerraTorch, using the `ni_lfm` / `terratorch_integration` packages from the NASA-IMPACT repo.
- Python env: conda `ni-lfm` on **Python 3.12**. The system Python is 3.13, which `ni_lfm` does not support (`>=3.11,<3.13`).
- Geospatial (offline pipeline): rasterio, pyproj, numpy. Export overlays as PNG/WebP textures plus JSON (GeoJSON for crater points).
- Frontend / 3D: **Three.js** (0.186, MIT) + Vite 8 + TypeScript **5.9.3**. Static site with no backend and no API keys. Requires **Node ≥ 22.12 (use 24 LTS)**; the local Node is v19.3.0, which is too old.
  - Landing: NASA SVS GLB Moon (three renders: Colour, Grid, Topography) compressed with meshopt + WebP into `web/public/models/` by `scripts/optimize_models.sh`; starfield; pulsing 12° polar caps that open the pole maps. Design source of truth: Figma file `kqQhaYmrrCWfJBZouM6Y6o`.
  - Pole maps (`#/south`, `#/north`): pre-rendered topographic basemaps from `atlas.polemaps` (styles A glow / B bands / D hotspots × dark / moon-grey themes) with Artemis outlines as an SVG overlay.
- Alternative considered: CesiumJS 1.145 with `Ellipsoid.MOON` and Cesium ion Moon Terrain (asset 2684829). Rejected for the MVP because it needs an ion token, the free tier is for non-commercial use only, and there's an unresolved ~2.5 km height offset against LOLA.
- QA / notebooks: matplotlib (PyVista optional) to check overlays before they go on the web globe.

## Data Sources
- Models (Hugging Face, `nasa-ibm-ai4science`):
  - `NASA-IBM-Lunar-Foundation-Model`: ViT-B backbone (2.4 GB) plus 9 VQ-VAE tokenizers (~1.15 GB each; not needed for fine-tuned inference)
  - `Crater-Detection-NASA-IBM-Lunar-Foundation-Model`: WAC (1.1 GB) and NAC (1.75 GB) checkpoints
  - `IMP-Segmentation-NASA-IBM-Lunar-Foundation-Model`: 1.09 GB checkpoint
  - `Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model`: 1.69 GB checkpoint
- Datasets (SomBench on Hugging Face, CC-BY-4.0):
  - `Sombench-Ice-Prospectivity-Regression`: 162 patches on disk (81 per pole, 9×9 grid; split lists use 156) of 256×256 at 238.56 m/px. Single-band GeoTIFFs, one per layer. CRS: Moon sphere R=1737400 m, polar stereographic, k0=0.994, false easting/northing 500000. ~0.4 GB.
  - `Sombench-WAC-Crater-Detection`: 1,000 tiles of 512×512×5 float32 (~100 m/px), ~3.9 GB. The TIFFs have **no geotransform**. Location comes from `metadata.parquet` (center and corner lat/lon, LTM bounds in metres).
  - `Sombench-IMP-Segmentation`: 130 image/mask pairs of 256×256 at 1 m/px. GeoTIFFs in a per-tile Transverse Mercator projection on the Moon sphere. ~30 MB.
  - `Sombench-NAC-Crater-Detection`: 408 `.npy` tiles of 256×256 from 6 NAC sites. COCO JSON plus `crater_catalog.parquet` (coordinates in metres in the site's projection). ~0.1 GB.
- Elevation / basemaps:
  - Globe: NASA SVS CGI Moon Kit (svs.gsfc.nasa.gov/4720). `ldem_16.tif` (5760×2880, float km relative to 1737.4 km, equirectangular, centred on 0° longitude) and `lroc_color_16bit_srgb_4k/8k.tif`.
  - Poles: PDS LOLA `ldem_75{n,s}_240m.img` (polar stereographic, 3812², int16 × 0.5 m, 29 MB each).
  - Hi-res reference only: USGS `Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif` (8.5 GB) and `Lunar_LRO_LROC-WAC_Mosaic_global_100m_June2013.tif` (6 GB). Too large for the web; crop these rather than downloading the whole file.
- Artemis regions: USGS DOI 10.5066/P1MEQ6UK (CC0). ScienceBase is behind Cloudflare, so it's a manual browser download into `data/artemis/`. **Never hand-type coordinates.** Artemis III is now a LEO test flight; the first crewed landing is Artemis IV (early 2028).
- 3D assets: NASA SVS 14959 Moon GLBs (`moon_small.glb` 13.8 MB, `Moon_NASA_LRO_8k_Topo_Small.glb` 81.5 MB). Credit "NASA's Goddard Space Flight Center".

## Directory Layout (planned)
MVP = "Lunar Ice Atlas" (RESEARCH.md §7).
```
NASA_proj/
├── RESEARCH.md, plan.md, CLAUDE.md
├── vendor/ni-lfm/              # git clone of NASA-IMPACT repo (gitignored)
├── models/ice/                 # HF checkpoint + config.yaml (gitignored)
├── backbone/config.yaml        # backbone config referenced by the task configs (gitignored)
├── data/prospectivity_dataset/ # SomBench ice patches; path matches config data roots (gitignored)
├── data/dem/                   # PDS ldem_75{n,s}_240m (gitignored)
├── data/svs/                   # SVS ldem_4.tif + lroc_color_16bit_srgb_4k.tif (gitignored)
├── data/artemis/               # USGS region shapefiles, manual download (gitignored)
├── data/derived/               # predictions, mosaics (gitignored)
├── scripts/                    # fetch_data.sh, m0_benchmark.sh, predict_all.sh
├── pipeline/atlas/             # Python package (crs, tiles, dem, colorize, regions, export_web, polemaps, build)
├── pipeline/tests/             # pytest; `-m data` tests need downloaded data
├── notebooks/                  # QA plots only
└── web/                        # Vite + TS + three; public/data/ holds exported overlays
```

## Commands
- Node: **24.21.0 via Homebrew** (`brew install node@24`, linked to /opt/homebrew/bin, which comes before the old v19 in /usr/local/bin).
- Env (done 2026-09-24): `conda create -n ni-lfm python=3.12 -y && conda activate ni-lfm && pip install -e vendor/ni-lfm && pip install pyproj shapely pyogrio pytest ruff mypy && pip install -e .`. Installed: torch 2.12.1, terratorch 1.2.13, rasterio 1.5.1, huggingface-hub 1.33.0.
- Download: `hf download nasa-ibm-ai4science/Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model --local-dir models/ice`, then `hf download nasa-ibm-ai4science/Sombench-Ice-Prospectivity-Regression --repo-type dataset --local-dir data/prospectivity_dataset`
- Data: `conda run --no-capture-output -n ni-lfm bash scripts/fetch_data.sh` (~4.6 GB including the required 2.4 GB `backbone/checkpoint.pt`).
- CPU eval (verified 2026-09-24, RMSE 0.0277, ~2.5 min): `conda run --no-capture-output -n ni-lfm bash scripts/m0_benchmark.sh`. It sources `scripts/cpu_config.sh`, which writes `models/ice/config_cpu.yaml`.
- Web (verified 2026-10-21, run in `web/`): `npm ci`, `npm run dev`, `npm test` (vitest, 68 tests), `npm run typecheck`, `npm run lint` (eslint + prettier), `npm run build` (dist 36 MB), `npm run e2e` (Playwright, 5 tests; builds and serves on :4173). Playwright Chromium installed via `npx playwright install chromium`.
- Moon models (verified 2026-10-21): `bash scripts/optimize_models.sh` reads `Moon Renders/*_Small.glb` (gitignored) → `web/public/models/{color,grid,topo}.glb` (27 MB total).
- Build web data (verified 2026-10-21): `conda run --no-capture-output -n ni-lfm python -m atlas.build {regions|maps|all}` → `web/public/data/regions.json` + `web/public/data/maps/{north,south}/` (12 WebP basemaps + meta.json, 8 MB). Legacy targets `globe|north|south` still exist but are no longer shipped.
- Deploy: `.github/workflows/pages.yml` builds `web/` with `BASE_PATH=/<repo>/` and publishes to GitHub Pages on every push to `main`.
- Python tests/lint/typecheck: `conda run -n ni-lfm pytest -q` (add `-m data` once data is fetched), `conda run -n ni-lfm ruff check pipeline`, `conda run -n ni-lfm mypy`

## Constraints
- Laptop only, **no GPU**. Anything that needs a GPU runs as a one-off job on free Colab, and the outputs are cached as files.
- Portfolio scope: a polished, demo-able result within a few weeks. Prefer precomputed outputs over live inference.
- Download only the specific checkpoint files needed. The full base-model repo is about 13 GB because of the tokenizers.

## Conventions
- A single Moon model everywhere: sphere R = 1,737,400 m. Heights are in metres above it. Never assume two rasters share a pixel grid; reproject with `rasterio.warp`.
- Always pass `--trainer.accelerator cpu`, because every shipped config hard-codes `accelerator: gpu`.
- Treat model outputs as "prospectivity", not measured ice. Show the model-card caveats and NASA/SVS/GSFC credits in the UI.
- Never commit large binaries (checkpoints, datasets, DEMs). Only web-ready exports under `web/public/data/`.
- Ask before every git commit.
- TDD per plan.md.
- Python: ruff (line length 120) + mypy with strict defs.
- Web: eslint (typescript-eslint strict) + prettier.
- Colour ramps are fixed and validated (see plan.md addendum §9); don't change them without re-running the dataviz validator.

## Open Questions
See `RESEARCH.md` §8 and the Risks table in `plan.md`.
