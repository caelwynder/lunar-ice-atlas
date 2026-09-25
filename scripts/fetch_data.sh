#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

hf download nasa-ibm-ai4science/Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model --local-dir models/ice
# checkpoint.pt (2.4 GB) is required: the fine-tuned ckpt's saved hparams reference it at load time.
hf download nasa-ibm-ai4science/NASA-IBM-Lunar-Foundation-Model backbone/config.yaml backbone/checkpoint.pt --local-dir .
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
