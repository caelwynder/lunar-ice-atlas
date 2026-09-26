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
