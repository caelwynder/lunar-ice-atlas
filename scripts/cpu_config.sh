#!/usr/bin/env bash
# Derives a CPU-only copy of the shipped ice config (accelerator + custom_modules_path).
# backbone_checkpoint_path can't be changed here: LightningCLI re-applies the hyperparameters saved
# in the .ckpt, which point at backbone/checkpoint.pt, so fetch_data.sh downloads that file.
set -euo pipefail
CPU_CONFIG=models/ice/config_cpu.yaml
sed -e 's|^custom_modules_path: terratorch_integration$|custom_modules_path: vendor/ni-lfm/terratorch_integration|' \
    -e 's|^  accelerator: gpu$|  accelerator: cpu|' \
    models/ice/config.yaml > "$CPU_CONFIG"
for expected in 'custom_modules_path: vendor/ni-lfm/terratorch_integration' 'accelerator: cpu'; do
  grep -q "$expected" "$CPU_CONFIG" || { echo "cpu_config: failed to set '$expected'" >&2; exit 1; }
done
export CPU_CONFIG
