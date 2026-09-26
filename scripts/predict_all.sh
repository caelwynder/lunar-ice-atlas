#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/cpu_config.sh
mkdir -p data/derived/pred_tiles
START=$(date +%s)
terratorch predict -c "$CPU_CONFIG" \
  --ckpt_path models/ice/ni_lfm_ps8_all_modalities_s42.ckpt \
  --trainer.devices 1 \
  --predict_output_dir data/derived/pred_tiles
END=$(date +%s)
echo "elapsed_s=$((END-START)) files=$(ls data/derived/pred_tiles/*_pred.tif | wc -l | tr -d ' ')"
