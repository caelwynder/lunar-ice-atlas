#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/cpu_config.sh

START=$(date +%s)
terratorch test -c "$CPU_CONFIG" \
  --ckpt_path models/ice/ni_lfm_ps8_all_modalities_s42.ckpt \
  --trainer.devices 1 2>&1 | tee data/m0_test.log
END=$(date +%s)
echo "elapsed_s=$((END-START)) patches=25" | tee -a data/m0_test.log
