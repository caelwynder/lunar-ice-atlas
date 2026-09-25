# Lunar Foundation Model × 3D Moon: Research & Plan

_Research date: 2026-09-24. Target machine: Apple M1 Pro, 10 CPU cores, 16 GB RAM, no CUDA GPU._
_"Verified" means the URL was fetched or HEAD-checked (HTTP 200) on the research date. Anything not confirmed is marked `UNVERIFIED`._

---

## 1. Summary

- **Four checkpoints are published under Apache-2.0**: the NI-LFM backbone plus three fine-tuned heads (crater detection in WAC and NAC versions, IMP segmentation, and polar ice prospectivity). Each fine-tuned `.ckpt` is self-contained at 1.1–1.75 GB and loads with `map_location="cpu"` [M2–M5, G2].
- **There is no published classification checkpoint.** "Image classification" would mean training a small probe on frozen backbone embeddings. That's doable on a CPU, but it's extra work (see idea P4).
- **The ice-prospectivity benchmark covers both polar caps almost completely.** It has 156 georeferenced 256×256 patches (78 per pole, 9×9 grid, 240 m/px, polar stereographic) [D4]. Running the model over every patch is ~156 forward passes, which should take minutes on a CPU (estimate, not yet benchmarked).
- **NASA publishes the 3D assets directly.** The SVS CGI Moon Kit provides equirectangular LOLA displacement and LROC colour maps [A1], and SVS 14959 provides Moon GLBs [A2]. PDS provides 240 m polar DEMs in the same projection family as the ice data [A5].
- **Rendering stack: Three.js** as a static site, with polar-cap meshes built in polar stereographic space. CesiumJS is the credible alternative, but it depends on a Cesium ion token and has an unresolved ~2.5 km height offset [R3].

**Recommended project: "Lunar Ice Atlas".** An interactive 3D Moon with NI-LFM ice-prospectivity predictions for both poles draped over LOLA elevation. The Artemis III candidate regions are the story hook, and a global WAC crater-detection layer is the stretch goal.

---

## 2. Model inventory

All models are in the HF collection [M1]. File sizes come from the HF API (`/api/models/<id>/tree/main`) on 2026-09-24.

| Model (HF repo) | Task | Input | Output | Licence | Size on disk | CPU? |
|---|---|---|---|---|---|---|
| `nasa-ibm-ai4science/NASA-IBM-Lunar-Foundation-Model` [M2] | Base: multimodal masked-token pretraining, feature extraction, cross-modal generation | 256×256 tiles, FlexiViT patch 16 (8 at fine-tune). 9 dense modalities: WAC vis (5 ch, 100 m), WAC UV (2 ch, 500 m), WAC DTM/slope/aspect (60 m), NAC pan (1 m), NAC DTM/slope/aspect (3 m). Plus 2 context vectors (8 optical-metadata fields, 28 static-map fields) | 768-d token embeddings (ViT-B encoder: 12 layers, 12 heads). Generation needs the VQ-VAE tokenizers and a diffusion decoder | Apache-2.0 [M2, G1] | `backbone/checkpoint.pt` 2.43 GB. 9 tokenizers at ~1.15 GB each (~10.3 GB total, **only needed for generation**). Technical report PDF 25 MB | ✅ Embedding inference (ViT-B). ❌ Pretraining (16×H100, ~1,100 GPU-h [M2]). ⚠️ Generation (diffusion decoder) is slow on CPU; GPU/Colab recommended. Parameter count not stated: `UNVERIFIED` |
| `…/Crater-Detection-NASA-IBM-Lunar-Foundation-Model` **WAC** [M3] | Single-class crater bounding boxes | 512×512 × **5-band WAC visible**, float32 reflectance, ~100 m/px (~51 km tile). Per-band normalisation stats in `WAC_config.yaml` | Boxes + scores (Faster R-CNN, multilayer SimpleFeaturePyramid neck). Test mAP 0.258, AP50 0.62 | Apache-2.0 | `WAC_ni_lfm_ps8_lora_s46.ckpt` 1.10 GB (LoRA r16) | ⚠️ Works, but slowly: 4,096 tokens/tile at patch 8. Estimated seconds per tile on CPU (`UNVERIFIED`), so 1,000 tiles ≈ hours. Run overnight or once on Colab |
| same repo, **NAC** [M3, G2] | Crater boxes on high-res imagery | 256×256 × 1-band NAC pan, ~1 m/px (0.8–5 m, resampled) | Boxes + scores. Test mAP 0.154, AP50 0.44 | Apache-2.0 | `NAC_ni_lfm_ps8_s44.ckpt` 1.75 GB (full fine-tune; the notebook says it "already carries the backbone weights" [G2]) | ✅ Official Colab notebook loads it with `map_location="cpu"` [G2] |
| `…/IMP-Segmentation-NASA-IBM-Lunar-Foundation-Model` [M4] | Binary segmentation of irregular mare patches | 256×256 × 1-band NAC, ~1 m/px | 256×256 binary mask. Test IoU 0.571, F1 0.727 | Apache-2.0 | `ni_lfm_ps8_frozen_s44.ckpt` 1.09 GB. The card says "only decoder weights", but the file size suggests the backbone is included: `UNVERIFIED` | ✅ Only 130 small tiles |
| `…/Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model` [M5] | Dense regression of near-surface water-ice prospectivity (0–1) | 256×256 at 240 m/px, polar (±80–90°). 8 layers / 9 channels: aspect (sin, cos), curvature, Diviner ice-stability depth (DICE), max temperature (TMAX), PSR mask, PSR density, distance to PSR, slope | 256×256 float map in [0, 1]. Test RMSE 0.029, R² 0.988 | Apache-2.0 | `ni_lfm_ps8_all_modalities_s42.ckpt` 1.69 GB (full fine-tune, self-contained) | ✅ **Best CPU fit**: 156 tiles total |
| Surya family (`Surya-1.0` and 4 heads) [M6] | Solar (SDO) forecasting | n/a for the Moon | n/a | not checked | not checked | Secondary only, not evaluated further |

**Caveats from the cards.** The ice target is "a knowledge-driven model, not measured ice" [M5]. The base card warns that outputs "shouldn't substitute for instrumental measurements or operational decision-making regarding lunar landing sites" [M2]. The UI should show both warnings.

**Code** [G1, G3]: `ni_lfm` plus `terratorch_integration` from the GitHub repo. It requires Python `>=3.11,<3.13` and `terratorch>=1.2.6,<2`, `torch>=2.12` (current releases: terratorch 1.2.13, torch 2.14 [P1]). Every shipped YAML sets `accelerator: gpu`, so CPU runs need `--trainer.accelerator cpu`. The configs also point `backbone_checkpoint_path` at the 2.4 GB `backbone/checkpoint.pt`. The notebook avoids that download by setting `backbone_checkpoint_path=None` [G2].

---

## 3. Datasets & 3D assets

### 3a. Model-paired datasets (SomBench benchmark collection [D0], all CC-BY-4.0)

| Dataset | Content | Projection / georef (inspected from sample files) | Resolution | Download size |
|---|---|---|---|---|
| `Sombench-Ice-Prospectivity-Regression` [D4] | 11 single-band GeoTIFF layers per patch (DICE, TMAX, LPSR, LPSR_DIS, LPSR_DEN, SLOPE, CUR, ASP_SIN_COS, ONLYCOS, target PRO). Splits 108/23/25 = **156** patches (the README says 162: discrepancy) | **Polar stereographic** on a "Moon (2015) sphere", R = 1,737,400 m, **k₀ = 0.994**, false E/N = 500,000 m. Full geotransform in every file | 238.56 m/px (nominal 240), 256×256, 78 patches per pole on a 9×9 grid ≈ 550 km across | ~0.23–0.38 GB |
| `Sombench-WAC-Crater-Detection` [D2] | 1,000 tiles (800/100/100), 11 LTM zones, lat −77…+78°, lon −171…+171°. COCO JSON labels from the Robbins catalogue | **TIFFs have an identity geotransform (no georef).** `metadata.parquet` gives centre and corner lat/lon plus LTM bounds in metres, and incidence/phase/sub-solar angles | 512×512×5 float32, ~100 m/px (51.2 km tiles) | ~3.9 GB |
| `Sombench-IMP-Segmentation` [D3] | 130 image/mask pairs | GeoTIFF, **per-tile Transverse Mercator** on the Moon sphere (for example central meridian −40°, k₀ 0.999) | 1 m/px, 256×256 | ~30 MB |
| `Sombench-NAC-Crater-Detection` [D1] | 408 `.npy` tiles from 6 NAC PHO sites (e.g. Apollo 15 S-IVB). 49,106-row `crater_catalog.parquet` | Catalogue has `center_x_m/center_y_m` in the site DTM projection. README mentions a per-tile `geotransform`; its exact CRS is `UNVERIFIED` | 0.8–5 m/px | ~0.1 GB |
| `Sombench-pretraining-data` [D5] | Sample of pretraining bundles (NetCDF) | per-bundle | mixed | ~0.15 GB (sample only) |

### 3b. Elevation, basemaps and 3D assets

| Asset | URL (all verified 200 unless noted) | Projection | Resolution | Size | Licence / credit |
|---|---|---|---|---|---|
| CGI Moon Kit: LOLA displacement | https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16.tif (also `ldem_4.tif`, `ldem_64.tif`, `ldem_16_uint.tif`) | Equirectangular, centred on 0° lon | 16 px/deg (5760×2880). Float **km relative to 1737.4 km** | 66 MB (ldem_4: 4 MB; ldem_64: 1.06 GB) | "Please give credit … NASA's Scientific Visualization Studio" [A1]. NASA media guidelines [A7] |
| CGI Moon Kit: LROC colour | https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_16bit_srgb_4k.tif (also `_8k.tif`, `lroc_color_2k.jpg`, `lroc_color_poles_4k.tif`) | Equirectangular | 4096×2048 / 8192×4096 | 62 MB / 243 MB / 0.46 MB | same as above [A1] |
| SVS Moon 3D models (Jan 2026) | https://svs.gsfc.nasa.gov/vis/a010000/a014900/a014959/moon_small.glb · `Moon_NASA_LRO_8k_Topo_Small.glb` · `Moon_NASA_LRO_8k_Topo.glb` | GLB (UV sphere; the page notes "pinched poles") | 8k texture, topo-displaced versions | 13.8 MB / 81.5 MB / 313 MB | "Please give credit … NASA's Goddard Space Flight Center" [A2] |
| NASA 3D Resources hub | https://science.nasa.gov/3d-resources/ and https://github.com/nasa/NASA-3D-Resources | GLB/USDZ spacecraft (LRO, LM, etc.) | n/a | per model | "free to download and use" [A3] |
| PDS LOLA polar DEM | https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_75s_240m.img (+ `.lbl`, and `ldem_75n_240m`). Finer: `ldem_80s_20m/40m/80m`, `ldem_85s_10m` | Polar stereographic, R 1737.4 km (k₀ = 1, different from the ice data) | 240 m, 3812×3812. int16 × 0.5 m relative to 1737.4 km | 29 MB each | PDS public domain (NASA data) |
| USGS LOLA global DEM 118 m | https://planetarymaps.usgs.gov/mosaic/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif (page [A4]) | Equirectangular | 118 m | 8.5 GB | USGS / NASA public domain |
| USGS LROC WAC global mosaic 100 m | https://planetarymaps.usgs.gov/mosaic/Lunar_LRO_LROC-WAC_Mosaic_global_100m_June2013.tif (page [A6]) | Equirectangular | 100 m | 6.0 GB | USGS / NASA public domain |
| USGS Robbins crater DB | https://astrogeology.usgs.gov/search/map/moon_crater_database_v1_robbins [A8] | lat/lon table | craters ≥ 1–2 km | (not sized) | Ground truth for comparing WAC detections |
| USGS Unified Geologic Map 1:5M | https://astrogeology.usgs.gov/search/map/unified_geologic_map_of_the_moon_1_5m_2020 [A9] | vector | 1:5M | (not sized) | Labels for a classification probe (P4) |
| SLDEM2015 (LOLA + Kaguya 59 m, ±60°) | page https://astrogeology.usgs.gov/search/map/moon_lro_lola_selene_kaguya_tc_dem_merge_60n60s_59m (the guessed direct TIF URL returned **404**) | Equirectangular | 59 m | `UNVERIFIED` | optional |
| PGDA high-res south-pole DEMs | https://pgda.gsfc.nasa.gov/products/78 , /products/90 | Polar stereographic | down to ~5 m | `UNVERIFIED` | optional hero close-ups |
| Cesium Moon Terrain (3D Tiles) | ion asset **2684829**. Moon boundaries 2683530, Artemis III regions 2683531 (from Cesium's Moon Sandcastle [R2]) | `Ellipsoid.MOON` | higher resolution at the poles | streamed | Cesium ion account and token. Community tier "Free", "personal and non-commercial use" [R4] |

---

## 4. Rendering stack comparison and recommendation

| Criterion | **Three.js** (0.186, MIT) [R1] | **CesiumJS** (1.145, Apache-2.0) + Moon Terrain [R2–R4] | **Python** PyVista 0.49 / Plotly 7.1 [R5, P1] |
|---|---|---|---|
| Real elevation | SVS `ldem_16` as `displacementMap` on a sphere; polar DEM on custom cap meshes | 3D Tiles Moon terrain, highest resolution at the poles | `StructuredGrid` from DEM, exact |
| Correct Moon geodesy / lat-lon picking | Hand-written: roughly 20 lines of sphere math | Native (`Ellipsoid.MOON`, `Cartographic`) | Native in NumPy |
| Draping model outputs | Texture in the same projection as the mesh UVs. Polar overlays go on a polar-stereographic cap mesh with **no image reprojection** | Imagery must be in a geographic or Web-Mercator tiling scheme, so polar-stereographic data must be warped first | Scalars on the mesh; easy |
| External dependencies at runtime | None; fully static (GitHub Pages) | Cesium ion token embedded in the client, free tier for non-commercial use only [R4] | Needs a Python server (trame) or a static HTML export |
| Known issues | Equirectangular UVs pinch at the poles, which is exactly where the ice data is, hence the cap meshes | Reported **~2.5 km constant height offset** of ion Moon terrain vs LOLA/SLDEM2015, unresolved in the forum [R3] | Plotly `surface` gets slow above ~1M vertices. Neither looks like a polished product |
| Portfolio polish / control | Full shader control (glow, hillshade, fly-to, UI) | Good out of the box, less visual control, heavy bundle | Low |
| Effort for MVP | Medium | Low–medium | Low (prototype only) |

**Recommendation: Three.js** (Vite + TypeScript, no framework to start), with Python/matplotlib used offline for QA.

- The MVP's data sits at the poles in polar stereographic. In Three.js, a cap mesh generated in that projection takes the model's GeoTIFF output as a texture unchanged, and the matching PDS 240 m DEM supplies the vertex heights.
- The finished site is fully static and self-hosted with no API keys. A portfolio link will keep working in 2 years, whereas an ion token can expire and hit quota.
- CesiumJS is the fallback if the scope moves toward "real GIS" features such as measuring distances, streaming 5 m terrain, or loading the Artemis III regions asset directly.

---

## 5. Georeferencing pipeline

Runs offline in Python (rasterio, pyproj, numpy) and writes web-ready assets.

1. **Pick one Moon model everywhere:** sphere R = 1,737,400 m. The ice GeoTIFFs, the IMP GeoTIFFs, the PDS DEMs and the SVS displacement maps all use it [D4, D3, A5, A1]. Heights are metres above that sphere (SVS float maps are in km; PDS is DN × 0.5 m).
2. **Read the tile's CRS and geotransform.**
   - *Ice / IMP:* read directly from the GeoTIFF, since the predicted mask/map has the same pixel grid as the input tile.
   - *WAC craters:* the TIFF has none, so rebuild it from `metadata.parquet`. `BOUNDS_XMIN/XMAX/YMIN/YMAX` are LTM-zone metres (512 px × 100 m = 51,200 m ✔). Build an affine transform from them plus the zone's Transverse Mercator CRS. The LTM zone CRS parameters are `UNVERIFIED`; the corner lat/lon columns are a fallback that allows a 4-corner fit.
3. **Run inference per tile** and keep the output in the tile's own pixel grid.
4. **Convert outputs to geometry.**
   - *Raster outputs (ice map, IMP mask):* keep them as rasters. Mosaic the 78 polar patches per pole into one GeoTIFF with `rasterio.merge` (same CRS and grid, so this is exact).
   - *Detections (crater boxes):* box centre (px) → affine → projected metres → `pyproj` inverse → (lat, lon). Diameter ≈ mean(box w, h) × pixel size. Write GeoJSON points with `diameter_m` and `score`.
5. **Resample onto the render grid.**
   - *Poles:* `rasterio.warp.reproject` the ice mosaic from its polar stereographic (k₀ = 0.994, 238.56 m) onto the PDS `ldem_75{n,s}_240m` grid (k₀ = 1, 240 m) cropped to ≥ 80°. The grids **do not align without reprojection** because the scale factors differ. Export the DEM crop as the height grid (Float32 binary or 16-bit PNG) and the ice mosaic as an RGBA PNG through a colour map. Transparent means no data or zero.
   - *Global layers:* reproject to equirectangular (EPSG-style "Moon 2015 sphere", lon −180…180 centred on 0° to match SVS [A1]) at the texture resolution (e.g. 8192×4096).
6. **Build the 3D geometry in the browser.**
   - *Globe:* `SphereGeometry` with UVs matching equirectangular; `displacementMap = ldem_16` with `displacementScale` in scene units (true relief is ±~10 km on 1737 km, so exaggerate ×5–10 and show the factor in the UI).
   - *Polar caps:* a regular grid over PS x/y. For each vertex, inverse polar stereographic gives (lat, lon); position = (R + h) · unit(lat, lon); UV = normalised PS x/y, so the overlay PNG maps with no warping. Offset the caps slightly outward, or clip the globe above 80°, to avoid z-fighting.
7. **Overlays.** Stack a raster overlay texture per layer (opacity slider, colour ramp legend) on the same mesh (second material or custom shader). Draw point layers (craters) as instanced sprites or rings placed at `(R + h(lat, lon) + ε)` using the same exaggeration.
8. **Picking and QA.** Raycast hit → convert to lat/lon → sample the value. For QA, check that the rendered PSR mask lines up with the LROC colour map at known features (e.g. Shackleton crater rim, ~89.7°S) and plot overlays in matplotlib in the source CRS first.

---

## 6. Project ideas

Each column is scored 1–5, where 5 is best. For **Effort, 5 = least effort** (≈ 1 week) and 1 = most (≥ 5 weeks).

| # | Project | No-GPU feasibility | Visual impact | Data availability | Effort | **Total /20** |
|---|---|---|---|---|---|---|
| **P1** | **Lunar Ice Atlas**: polar ice prospectivity on the 3D Moon | 5 | 4 | 5 | 4 | **18** |
| P3 | Artemis III site explorer (P1 + slope, PSR proximity, candidate regions) | 5 | 5 | 4 | 3 | 17 (builds on P1) |
| P5 | IMP finder: fly-to tour of young volcanic patches | 5 | 3 | 4 | 4 | 16 |
| P2 | Global crater detection explorer (WAC detector → globe) | 3 | 5 | 4 | 3 | 15 |
| P7 | Embedding similarity search ("find terrain like this") | 4 | 3 | 4 | 3 | 14 |
| P6 | Crater density / relative surface age map (from P2) | 3 | 4 | 4 | 2 | 13 |
| P4 | "Lunar terrain classification" mapped on elevation (frozen-backbone embeddings + probe) | 3 | 4 | 3 | 2 | 12 |

**P1: Lunar Ice Atlas.** Run the ice-prospectivity checkpoint over all 156 polar patches (train, val and test, labelled in the UI so no one mistakes it for held-out evaluation), mosaic per pole, and drape the result over PDS 240 m polar DEM caps on a Three.js Moon. Toggle between the model prediction, the reference `PRO` target, their difference, and input layers like the PSR mask and max temperature. Every input is a clean georeferenced GeoTIFF and the compute is ~156 ViT-B forward passes. This is the most feasible option and it answers a question people care about ("where is the water?").

**P2: Global crater detection explorer.** Run the WAC LoRA detector on the 1,000 WAC tiles spread across the globe and turn boxes into lat/lon crater rings. Colour detections by whether they match the Robbins catalogue (true positive, missed, "new"). It's visually strong, but at 512×512 with patch 8 CPU inference is slow (hours), so run it overnight or on one Colab session. The tiles also have to be re-georeferenced from parquet metadata.

**P3: Artemis III site explorer.** A storytelling layer on top of P1. Add the nine NASA candidate regions [N2], slope from LOLA, and distance to PSRs, then let users click a region to see the ice prospectivity and slope statistics nearby. High impact. It must carry the model card's disclaimer that this is not for landing-site decisions [M2]. The candidate list is from Oct 2024; whether it has changed since is `UNVERIFIED`.

**P4: Terrain "classification" on elevation.** This is the literal brief, but no classification head is published. You'd extract backbone embeddings for the WAC tiles on a CPU, label them from the USGS Unified Geologic Map (e.g. mare / highland / crater material), train a logistic-regression probe, and paint class colours on the globe. It's interesting ML but carries the most research risk: the backbone's WAC-vis input path outside the fine-tuned configs is untested, and the labels need spatial joins. The repo does include a `LunarClassificationTask` [G1], so a fine-tuned head is possible later.

**P5: IMP finder.** Run the IMP segmentation model on the 130 NAC tiles and show them as pins on the globe. Clicking one flies to it and opens a 2D panel with the 1 m image and the predicted mask vs the label. It's cheap and charming, but at globe scale IMPs are tiny (≤ 256 m), so the 3D view is mostly navigation.

**P6: Crater density / surface age.** Aggregate P2 detections per area into a crater-density heat map as a relative-age proxy. Scientifically nice, but it depends on finishing P2, and tile coverage is patchy (1,000 tiles is not global coverage).

**P7: Embedding similarity search.** Precompute a backbone embedding per tile and click any tile to highlight the k most similar tiles on the globe. It's the cleanest demo of the "foundation model" idea itself, but less intuitive to a general audience.

---

## 7. Recommended MVP: Lunar Ice Atlas (P1), with P3 as the stretch goal

### Scope

- **In:** a 3D Moon (LROC colour + LOLA displacement), north and south polar caps with real 240 m relief, and an NI-LFM ice-prospectivity overlay for both poles. Layer toggles for prediction / reference / |error| / PSR mask / TMAX, an opacity slider, a legend, and a hover readout (lat, lon, elevation, prospectivity). An "About the model" panel with the caveats and citations. Deployed as a static site.
- **Stretch:** Artemis III region markers with per-region stats (P3), then WAC craters (P2).
- **Out:** live in-browser inference, training, and anything that needs a GPU.

### Architecture sketch

```
┌──────────────── offline, laptop CPU (Python 3.12, conda env "ni-lfm") ────────────────┐
│ HF: Ice ckpt (1.7 GB) + SomBench ice (0.4 GB)       PDS: ldem_75{n,s}_240m (29 MB ×2)  │
│            │                                               │                         │
│   pipeline/infer_ice.py  (terratorch, accelerator=cpu)     │                         │
│            │  156 × prediction GeoTIFF (tile CRS)          │                         │
│   pipeline/mosaic.py  → pred_{N,S}.tif, ref_{N,S}.tif      │                         │
│            └────────── pipeline/export_web.py ─────────────┘                         │
│      reproject to PDS grid, crop ≥80°, colourise → web/public/data/                  │
│        south/{height.bin, pred.png, ref.png, err.png, psr.png, meta.json}            │
└──────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────── web/ (Vite + TS + three) ──────────── static, GitHub Pages ───────────┐
│ Globe: Sphere + ldem_16 displacement + lroc_color_4k                                  │
│ PolarCap(north|south): PS grid mesh ← height.bin, UV → overlay PNGs                   │
│ UI: layer toggles, opacity, legend, hover (raycast → lat/lon → value), About panel    │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Milestones (≈ 3–4 weeks part-time)

| # | Milestone | Done when |
|---|---|---|
| M0 | **Environment + CPU benchmark (first step, below)** | `terratorch test` finishes on the 25 ice test patches on CPU. RMSE ≈ 0.03 reproduced. Seconds per tile recorded |
| M1 | Full-cap inference | Predictions saved for all 156 patches. Per-pole mosaics open correctly in QGIS or matplotlib |
| M2 | Web export | Reprojected ice + DEM crops + PNGs + `meta.json` for both poles. QA plot shows PSRs line up with the DEM |
| M3 | Three.js globe | Displaced, textured Moon with orbit controls and a lat/lon hover readout |
| M4 | Polar caps + overlays | Caps render seamlessly against the globe. Layer toggles, legend and opacity work |
| M5 | Polish + deploy | About panel, credits, loading states, mobile check. Deployed to GitHub Pages. README with GIF |
| M6 (stretch) | Artemis III regions | 9 region markers with prospectivity and slope stats |

### First step you can run on the laptop (M0)

These are proposed commands; none have been run yet. §8 lists their risks.

```bash
cd ~/NASA_proj
conda create -n ni-lfm python=3.12 -y && conda activate ni-lfm
git clone https://github.com/NASA-IMPACT/NASA-IBM-Lunar-Foundation-Model vendor/ni-lfm
pip install -e vendor/ni-lfm                      # installs torch (CPU on macOS), terratorch, rasterio…

# ~1.7 GB checkpoint + ~0.4 GB data + tiny backbone config
hf download nasa-ibm-ai4science/Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model --local-dir models/ice
hf download nasa-ibm-ai4science/NASA-IBM-Lunar-Foundation-Model backbone/config.yaml --local-dir .
hf download nasa-ibm-ai4science/Sombench-Ice-Prospectivity-Regression --repo-type dataset \
    --local-dir data/prospectivity_dataset         # path matches the config's data roots

# Evaluate on the 25 test patches, CPU only; time it
time terratorch test -c models/ice/config.yaml \
    --ckpt_path models/ice/ni_lfm_ps8_all_modalities_s42.ckpt \
    --trainer.accelerator cpu \
    --model.init_args.model_args.backbone_checkpoint_path null
```

If the `backbone_checkpoint_path null` override doesn't work, the fallback is to download `backbone/checkpoint.pt` (2.4 GB) too. The fine-tuned checkpoint's weights then overwrite it.

---

## 8. Risks and open questions

| Risk / question | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CPU inference is slower than estimated. The ice estimate (~1 s per 256² tile) and WAC estimate (several s per 512² tile) come from ViT-B FLOP counts and are **not benchmarked** | Med | Med | M0 measures it. 156 tiles is fine even at 10 s each. Move WAC (P2) to one Colab run if needed |
| CLI config quirks: `accelerator: gpu` hard-coded, `backbone_checkpoint_path` points at the 2.4 GB file, `custom_modules_path: terratorch_integration` is a relative path | High | Low | Run from the repo root or with the package installed. Use overrides or the notebook-style Python loading [G2] |
| Python version: the system has 3.13, and the package needs <3.13 | Certain | Low | Dedicated conda 3.12 env |
| Grid mismatch between ice patches (k₀ 0.994, 238.56 m) and PDS DEM (k₀ 1, 240 m) | Certain | Med if ignored | Always `rasterio.warp.reproject`; never assume pixel alignment |
| Equirectangular pole pinching on the globe | Certain | Med | Separate polar-cap meshes (§5.6) |
| Dataset count mismatch: README says 162 ice patches, the split files list 156 | Low | Low | Use the split files as the source of truth |
| Showing predictions on training patches could be misread as evaluation | Med | Med (credibility) | Label the split per patch in the UI and report metrics on the test split only |
| Scientific over-claiming ("ice map", "landing sites") | Med | High (credibility) | Show model-card caveats [M2, M5] prominently. Say "prospectivity" rather than "ice" |
| IMP checkpoint contents: the card says decoder-only, but the file is 1.09 GB | — | Low | Inspect the `state_dict` keys when used (P5 only) |
| WAC tile georeferencing: LTM zone CRS definitions are `UNVERIFIED` | Med | Med (P2 only) | Fall back to the 4-corner lat/lon fit from `metadata.parquet` |
| Asset size in the browser (8k textures ~243 MB TIFF) | Med | Med | Convert to 4k/8k JPEG/KTX2, lazy-load the poles, keep the site under ~50 MB |
| Artemis III regions may have been revised after Oct 2024 | Unknown | Low | Check NASA before M6: `UNVERIFIED` |
| Apple-Silicon MPS could speed inference, but it's a GPU backend and the brief says CPU | — | — | Optional experiment only. Everything must work on CPU |

**Open questions for you**

1. Is Colab acceptable for the one-off WAC crater run (P2), or does everything have to run locally?
2. Should the deployed site be public (GitHub Pages) with NASA/SVS credits? The SVS and PDS assets allow this with credit [A1, A2]; confirm you're comfortable.
3. MVP framework: vanilla TS + Three.js (recommended, simplest) or React + @react-three/fiber (better if you want to show React skills)?

---

## 9. Sources

All URLs were accessed 2026-09-24.

**Models & code**
- [M1] HF collection: https://huggingface.co/collections/nasa-ibm-ai4science/nasa-ibm-lunar-fm-and-downstream-models
- [M2] Base model card: https://huggingface.co/nasa-ibm-ai4science/NASA-IBM-Lunar-Foundation-Model
- [M3] Crater detection: https://huggingface.co/nasa-ibm-ai4science/Crater-Detection-NASA-IBM-Lunar-Foundation-Model
- [M4] IMP segmentation: https://huggingface.co/nasa-ibm-ai4science/IMP-Segmentation-NASA-IBM-Lunar-Foundation-Model
- [M5] Ice prospectivity: https://huggingface.co/nasa-ibm-ai4science/Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model
- [M6] Org page (Surya etc.): https://huggingface.co/nasa-ibm-ai4science
- File sizes: `https://huggingface.co/api/models/nasa-ibm-ai4science/<repo>/tree/main?recursive=true`
- [G1] GitHub repo (LICENSE Apache-2.0, `pyproject.toml`, `requirements.txt`, configs): https://github.com/NASA-IMPACT/NASA-IBM-Lunar-Foundation-Model
- [G2] Crater inference notebook (Colab, CPU loading): https://colab.research.google.com/github/NASA-IMPACT/NASA-IBM-Lunar-Foundation-Model/blob/main/examples/crater_detection_inference.ipynb
- [G3] TerraTorch: https://github.com/IBM/terratorch · docs https://torchgeo.org/terratorch/quick_start/
- [N1] NASA announcement (2026-09-10): https://science.nasa.gov/science-research/artificial-intelligence-lunar-foundation-model/

**Datasets**
- [D0] SomBench collection: https://huggingface.co/collections/nasa-ibm-ai4science/lunar-fm-ml-ready-benchmark-dataset-sombench
- [D1] https://huggingface.co/datasets/nasa-ibm-ai4science/Sombench-NAC-Crater-Detection
- [D2] https://huggingface.co/datasets/nasa-ibm-ai4science/Sombench-WAC-Crater-Detection
- [D3] https://huggingface.co/datasets/nasa-ibm-ai4science/Sombench-IMP-Segmentation
- [D4] https://huggingface.co/datasets/nasa-ibm-ai4science/Sombench-Ice-Prospectivity-Regression
- [D5] https://huggingface.co/datasets/nasa-ibm-ai4science/Sombench-pretraining-data
- The CRS and geotransform facts in §3a come from reading sample-file headers (GeoTIFF tags / parquet schema) downloaded from D2–D4.

**3D assets & elevation**
- [A1] NASA SVS CGI Moon Kit: https://svs.gsfc.nasa.gov/4720
- [A2] NASA SVS Moon 3D Models for Web, AR, and Animation: https://svs.gsfc.nasa.gov/14959/
- [A3] NASA 3D Resources: https://science.nasa.gov/3d-resources/ · https://github.com/nasa/NASA-3D-Resources
- [A4] USGS LOLA DEM 118 m: https://astrogeology.usgs.gov/search/map/moon_lro_lola_dem_118m
- [A5] PDS LOLA GDR polar: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/
- [A6] USGS LROC WAC mosaic 100 m: https://astrogeology.usgs.gov/search/map/moon_lro_lroc_wac_global_morphology_mosaic_100m
- [A7] NASA images & media usage guidelines: https://www.nasa.gov/nasa-brand-center/images-and-media/
- [A8] Robbins crater DB: https://astrogeology.usgs.gov/search/map/moon_crater_database_v1_robbins
- [A9] Unified Geologic Map of the Moon: https://astrogeology.usgs.gov/search/map/unified_geologic_map_of_the_moon_1_5m_2020
- PGDA south-pole products: https://pgda.gsfc.nasa.gov/products/78 · https://pgda.gsfc.nasa.gov/products/90
- LROC QuickMap (manual browsing): https://quickmap.lroc.asu.edu/

**Rendering**
- [R1] Three.js `MeshStandardMaterial` (displacementMap): https://threejs.org/docs/#api/en/materials/MeshStandardMaterial
- [R2] Cesium Moon Sandcastle (`Ellipsoid.MOON`, ion 2684829): https://cesium.com/downloads/cesiumjs/releases/1.134/Apps/Sandcastle/gallery/Moon.html · blog https://cesium.com/blog/2024/08/06/introducing-cesium-moon-terrain/ · `Ellipsoid` API https://cesium.com/learn/cesiumjs/ref-doc/Ellipsoid.html
- [R3] Cesium forum, Moon terrain ~2.5 km offset: https://community.cesium.com/t/cesium-ion-moon-terrain-appears-2-5-km-higher-than-lola-sldem2015-dem-at-the-same-lon-lat/46282
- [R4] Cesium ion pricing (Community = free, non-commercial): https://cesium.com/platform/cesium-ion/pricing/
- [R5] PyVista docs: https://docs.pyvista.org/
- [P1] Package versions: npm registry (three 0.186.1, cesium 1.145.0, geotiff 3.0.5) and PyPI (terratorch 1.2.13, torch 2.14.0, pyvista 0.49.0, plotly 7.1.0, rasterio 1.5.1, pyproj 3.8.0)

**Context**
- [N2] Artemis III candidate regions (2024-10-28): https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
