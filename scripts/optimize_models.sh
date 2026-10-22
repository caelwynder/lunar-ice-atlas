#!/usr/bin/env bash
# Compress NASA SVS Moon GLBs (meshopt geometry, WebP textures) into web/public/models/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/Moon Renders"
OUT="$ROOT/web/public/models"
GT="npx -y @gltf-transform/cli@4.1.1"
COMMON=(--compress meshopt --texture-compress webp --texture-size 8192)

mkdir -p "$OUT"
$GT optimize "$SRC/moon_small.glb" "$OUT/color.glb" "${COMMON[@]}" --simplify false
$GT optimize "$SRC/Moon_NASA_LRO_15k_Grid_Small.glb" "$OUT/grid.glb" "${COMMON[@]}" --simplify false
# meshoptimizer cannot simplify this mesh at any error budget (1.01M vertices stay), so only the texture is reduced.
$GT optimize "$SRC/Moon_NASA_LRO_8k_Topo_Small.glb" "$OUT/topo.glb" --compress meshopt --texture-compress webp \
  --texture-size 4096 --simplify false

du -h "$OUT"/*.glb
