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
