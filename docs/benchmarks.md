# Benchmarks

## M0: ice-prospectivity test split on CPU (2026-09-24)

Machine: Apple M1 Pro (10 CPU cores), 16 GB RAM, no GPU/MPS. Env: Python 3.12.14, torch 2.12.1, terratorch 1.2.13.
Command: `bash scripts/m0_benchmark.sh` (25 held-out test patches, `accelerator: cpu`).

| Metric | Measured | Model card |
|---|---|---|
| test/RMSE | **0.02773** | 0.0293 ± 0.0013 |
| test/MAE | 0.01847 | 0.0197 ± 0.0009 |
| test/R2 | 0.98963 | 0.9884 ± 0.0010 |
| Wall time | 145 s total (≈5.8 s/patch including model load) | n/a |
| Peak RSS | 5.1 GB | n/a |

Gate: PASS (RMSE ≤ 0.035 and ≤ 30 s/patch). All inference stays local on CPU; no Colab needed.

### Flag set that works
- `scripts/cpu_config.sh` derives `models/ice/config_cpu.yaml` (sets `accelerator: cpu` and
  `custom_modules_path: vendor/ni-lfm/terratorch_integration`).
- `backbone/checkpoint.pt` (2.4 GB) **must be downloaded**. LightningCLI re-applies the hyperparameters
  saved in the `.ckpt`, and those point at that path, so neither a config edit nor
  `--model.init_args.model_args.backbone_checkpoint_path null` can remove it. Its weights are then
  overwritten by the fine-tuned checkpoint's `state_dict`.

## Task 3: predictions for all 162 polar patches (2026-09-25)

Command: `bash scripts/predict_all.sh` → `data/derived/pred_tiles/<patch>_ASP_SIN_COS_pred.tif` (162 files, float32,
256×256, nodata −1, same CRS/geotransform as the input patch).

| Measure | Value |
|---|---|
| Wall time | 802 s (13.4 min), ≈4.9 s/patch |
| Peak RSS | 5.1 GB |
| RMSE, train split (108 patches) | 0.0264 |
| RMSE, val split (23) | 0.0283 |
| RMSE, test split (25) | **0.0277** (identical to M0, so predict and test preprocessing match) |
| RMSE, all 81 north patches | 0.0298 |
| RMSE, all 81 south patches | 0.0236 |

RMSE is computed only where the `PRO` label exists (inside the 80° circle). The small train/test gap (0.0264 vs
0.0277) means showing predictions on training patches is not badly flattering, but the UI still reports test RMSE only.

## Task 4: stitched polar mosaics (2026-09-25)

`mosaic(patch_files(dir, suffix, pole), cap_grid(pole))` builds one 2560×2560 float32 map per pole
(10×10 patches, 238.56 m/px, NaN where no tile or no label).

| Measure | North | South |
|---|---|---|
| Share of the ≥80° disk with data | 91.0% | 91.0% |
| Valid label pixels | 4,587,767 | 4,587,767 |
| Tile-border / in-tile jump ratio: reference `PRO` | 0.99 | 1.01 |
| Tile-border / in-tile jump ratio: prediction | 1.37 | 1.41 |
| Prediction pixels outside [0, 1] | 1.60% | 2.36% |

The reference map is seamless, but the predictions show mild tile-edge effects (each patch is predicted without
seeing its neighbours). They aren't visible at whole-pole scale. The out-of-range values come from an unclipped
regression head; `colorize.ramp_rgba` clamps them for display (Task 6).

## Task 5: LOLA elevation on the cap grid (2026-09-25)

`to_grid(*read_pds_dem("ldem_75{n,s}_240m.lbl"), cap_grid(pole))`: bilinear reprojection from PDS polar stereographic
(k₀ 1, 240 m) to the ice grid (k₀ 0.994, 238.56 m).

| Measure | North | South |
|---|---|---|
| Cap grid filled with elevation | 100% | 100% |
| Elevation range (m above 1737.4 km) | −5,040 … +2,372 | −7,280 … +7,020 |
| Slope correlation vs dataset `SLOPE` (all 81 patches, 5.3 M px) | **r = 0.9965** | **r = 0.9981** |
| Median absolute slope difference | 0.24° | 0.18° |

This is the first check of the north pole; research only spot-checked three south patches. Both clear the r ≥ 0.99 test.

## Task 6: colour ramps and per-pole web export (2026-09-25)

Trial export of the real south pole into the scratchpad (the real export into `web/public/data` is Task 8): 11.4 s.

| File | Size |
|---|---|
| `pred.webp` / `ref.webp` / `err.webp` (lossless, 2560², RGBA) | 6.79 / 7.03 / 4.24 MB |
| `psr.webp` / `test.webp` | 0.09 / 0.00 MB |
| `hillshade.jpg` (2560², q85) | 1.11 MB |
| `height.i16.bin` (640², int16 m) | 0.82 MB |
| `pred/ref/err.u8.bin` (640², uint8) | 0.41 MB each |
| **Total per pole** | **21.3 MB** (PNG overlays were 31.7 MB) |

Format comparison for the three big overlays (south):

| Format | pred | ref | err | Colour error |
|---|---|---|---|---|
| PNG | 8.73 | 9.08 | 10.48 MB | none |
| **WebP lossless (chosen)** | 6.79 | 7.03 | 4.24 MB | none |
| WebP q95 | 3.82 | 4.11 | 1.68 MB | mean 2/255 (pred, ref), up to 112/255 (err) |

Projected site payload with lossless overlays: ≈ 2 × 21.3 + globe (~5 MB) ≈ **47 MB**, over the plan's 40 MB budget.
**Decision (user, 2026-09-25): option B.** `pred`/`ref` are WebP q95 (alpha exact); `err`/`psr`/`test` stay lossless.
Re-measured south export: pred 3.82 MB, ref 4.11 MB, err 4.24 MB, **15.4 MB per pole** → projected site ≈ **36 MB** (within 40 MB).

## Task 7: Artemis candidate regions (2026-09-25)

Source: USGS DOI 10.5066/P1MEQ6UK, one folder per region with `*_1km_S_Grid.shp` in the ice-grid CRS. The region area is
taken as the union of the 1 km cells (the "grid footprint"). Statistics use the south cap grid (238.56 m pixels);
slope comes from the reprojected 240 m LOLA DEM; `LPSR_DIS` is in metres.

| Region | Centroid | Area km² | Model cover | Pred mean | Ref mean | Pred > 0.5 | Slope mean | < 8° | < 5° | PSR | Dist. to PSR | Tmax |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Haworth | 86.74°S 22.7°W | 930 | 100% | 0.41 | 0.41 | 34% | 10.1° | 38% | 17% | 1% | 2.8 km | 230 K |
| Malapert Massif | 85.98°S 0.2°W | 462 | 100% | 0.14 | 0.13 | 8% | 16.9° | 12% | 5% | 1% | 4.1 km | 266 K |
| Mons Mouton | 85.42°S 31.7°E | 289 | 100% | 0.30 | 0.30 | 19% | 12.1° | 33% | 12% | 3% | 2.6 km | 240 K |
| Mons Mouton Plateau | 84.24°S 30.0°E | 4,524 | 100% | 0.24 | 0.24 | 16% | 11.6° | 37% | 19% | 2% | 3.1 km | 254 K |
| Nobile Rim 1 | 85.43°S 37.3°E | 441 | 100% | 0.21 | 0.21 | 14% | 16.5° | 17% | 9% | 2% | 3.6 km | 258 K |
| Nobile Rim 2 | 83.95°S 58.8°E | 420 | 100% | 0.39 | 0.39 | 33% | 11.2° | 38% | 20% | 9% | 3.0 km | 231 K |
| Peak near Cabeus B | 83.65°S 68.7°W | 441 | 100% | 0.21 | 0.21 | 19% | 18.5° | 4% | 1% | 0% | 4.3 km | 264 K |
| Slater Plain | 87.16°S 125.5°E | 441 | 100% | 0.45 | 0.44 | 41% | 8.7° | 51% | 27% | 4% | 2.4 km | 220 K |
| de Gerlache Rim 2 | 88.21°S 65.0°W | 441 | 100% | 0.19 | 0.20 | 9% | 12.3° | 25% | 11% | 2% | 4.5 km | 251 K |

Georeferencing sanity checks: Shackleton crater (89.67°S 129.2°E) projects 9.9 km from the grid centre, and the layout
matches NASA's official figure (LPSC 2026 #1901, Image 1).
