# NASA Moon, Pole Maps & Ship (replaces the P1/P3 front end, then plan.md Task 15) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the displaced-globe front end with the design the user approved in Figma: NASA's GLB Moon with three switchable renders, a slide-in info panel, and clickable polar caps that open South and North pole maps drawn on a topographic basemap with switchable styles (A soft glow, B contour bands, D hotspots) and dark/moon-grey themes. Then finish plan.md Task 15 (E2E, performance, accessibility, GitHub Pages deploy, docs) against this new UI.

**Architecture:**
- **Offline pipeline** (`pipeline/atlas/polemaps.py`, new `maps` build target) renders every pole basemap (2 poles × 3 styles × 2 themes = 12 WebP images) from the real DEM and prediction mosaics. It writes `maps/<pole>/meta.json` with the crop box, scale, pole position, per-pole stats and (south) every Artemis outline already projected into image pixels, so the browser does no map projection.
- **Model assets:** `scripts/optimize_models.sh` compresses the three NASA GLBs (meshopt geometry, WebP textures ≤ 8192 px, simplified topo mesh) into `web/public/models/`.
- **Web app** (Three.js + Vite + TS): a hash router switches between the landing view (`#/`) and the pole maps (`#/south`, `#/north`). The landing scene, starfield and caps are Three.js. The pole map view is plain DOM: an `<img>` basemap, an SVG overlay for regions, and the side panel.

**Tech Stack:** Python 3.12 (numpy, matplotlib, pillow, pyproj, shapely), Node 24, three 0.186.1 (GLTFLoader + MeshoptDecoder, OrbitControls), Vite 8, Vitest 5 (jsdom), Playwright 1.63, `@gltf-transform/cli@4.1.1` (via npx, dev-time only).

**Spec (read all three before starting):**
- **Figma file** `kqQhaYmrrCWfJBZouM6Y6o` (https://www.figma.com/design/kqQhaYmrrCWfJBZouM6Y6o), page "Landing screen". This is the source of truth for layout, sizes and colours. Read frames with the Figma MCP (`get_design_context` / `get_metadata`):
  - `4:2` Landing
  - `5:2` Landing · info panel open
  - `6:2` Info panel · full content
  - `10:2` South Pole map · dark (B)
  - `13:2` South Pole map · moon grey (B)
  - `15:2` North Pole map · dark (B)
  - `16:2` North Pole map · moon grey (B)
- `docs/design/landing-mockup/index.html`: the working landing mockup (behaviour reference for the stars, caps, view offset, drawer and toggle). Its `/files/*.glb` paths become `models/*.glb`.
- `docs/design/pole-map-concepts/`: the reference renderers `render_topo.py` (styles A/B/D), `render_b.py` (themes) and `render_north.py`, plus their output images. Port these; don't reinvent them.

## Global Constraints

- **Moon renders:** three, toggled by icon buttons. Colour = `moon_small.glb`, Grid = `Moon_NASA_LRO_15k_Grid_Small.glb`, Topography = `Moon_NASA_LRO_8k_Topo_Small.glb`. Topography is the default. Sources are in `Moon Renders/` (gitignored); only the optimized copies in `web/public/models/` are committed.
- **Landing framing:** the camera uses `setViewOffset(w*2, h*2, 0, 0, w, h)`, so the Moon sits large in the bottom right. Starting camera: `(0, 1.4, 4.0)`, FOV 35. The Moon auto-rotates at 0.0008 rad/frame.
- **Stars:** 2600 points at radius 40–60. Brightness `0.6 + rand³·0.4`, twinkle `0.7 + 0.3·sin(t·speed + phase)` with speed 0.3–1.2. Point size `(1.8 + bright·1.4)·pixelRatio`.
- **Caps:** spherical caps of 12° at both poles, radius 1.012, colour `#7fd4ff`, additive blending. Opacity pulses `0.35 + 0.25·(0.5 + 0.5·sin(2t))`, plus a ring line in `#9fe0ff`.
- **Font:** Tajawal (Google Fonts, weights 400/500/700) everywhere.
- **Landing title:** label 13 px, uppercase, letter-spacing 1.76 px, `#7fd4ff`; heading 48 px bold `#e8ecf4`.
- **Top-right cluster:** render toggle pill (3 × 44 px buttons; fill `#060810`, border `#4a4a4a`; top 18 px, right 81 px), then the ⓘ button (45 px; fill `#060810`, border `#4a4a4a`; top 22 px, right 32 px). Hover labels appear *below* the buttons.
- **Info drawer:** width `max(25vw, 340px)`. It slides in from the right and pushes the stage left; it is not an overlay. Background `#000`; label `#0088ff`; section headings white; stat cards black with a white 1 px border. Sections, in order: Run log, Accuracy by pole, Artemis candidate regions, Credits. Credits ends with the two model-card quotes as one muted line. **Keep the quotes:** plan.md requires them, and the user was told they were kept.
- **Pole map styles:** A soft glow, B contour bands, D hotspots. All three are on a topographic base: LOLA contours every 500 m, index line every 2000 m, `contour.negative_linestyle = 'solid'`. **B is the default.** Hex grid (C) is out.
- **Prediction smoothing:** box-downsample to S/9 then bicubic upsample (≈5 km at the south crop). Bands at **0.4 / 0.6 / 0.8 / 1**; below 0.4 shows topography only. Hotspots = top 15% of the smoothed field.
- **Theme colours** (both pass `validate_palette.js --ordinal` against their surface):
  - Dark: bg `#000000`, bands `#256abf #6da7ec #cde2fb`, edges `#3987e5 #9ec5f4 #ffffff`.
  - Moon grey: bg `#c9c5bd`, bands `#3987e5 #256abf #184f95`, edges `#0f2a52`, plus a `#f5f3ef` 3.2 px halo.
  - **Dark is the default theme.**
- **South map crop:** cap-grid pixel box `(214, 19, 2223, 2028)`, rendered at 1600 px. **North map:** the full 2560 cap.
- **Copy:** say "prospectivity", never "ice detected". Artemis wording: nine regions announced Oct 2024 for Artemis III; first crewed landing is Artemis IV (early 2028).
- **Run-log numbers** (from `docs/benchmarks.md`; do not recompute):
  - 162 patches, 13.4 min, ≈4.9 s/patch, M1 Pro CPU
  - test RMSE 0.0277 (card 0.0293), R² 0.990 (card 0.988), MAE 0.0185
  - North RMSE 0.0298, South RMSE 0.0236
- **Payload:** `web/dist` ≤ 40 MB total. No single committed file > 95 MB.
- **Repo rules:**
  - Ask before every `git commit` (one approval may cover a stated batch).
  - TDD: write the failing test first.
  - Files ≤ 400 lines, functions ≤ 50 lines, no `console.log`.
  - Immutable inputs.
  - ruff (line length 120) + strict mypy; eslint + prettier.
- **Figma loop:** every new UI state built here that isn't in Figma yet goes into the same Figma file for the user to edit (Task 8). The style/theme controls are the main example.

## Review Focus

1. **Keyboard-only users can reach the pole maps.** The 3D caps are pointer-only, so the landing page has two visually hidden "Open South Pole map" / "Open North Pole map" buttons that appear on focus (Task 4 test).
2. **A failed model download** (offline or 404) must show a readable status message, not a blank canvas. It must also keep the other renders working when you toggle (Task 3 test).
3. **Back/forward and deep links:** opening `/#/south` directly renders the map, and the browser Back button returns to the Moon (Task 6 test, Task 7 e2e).
4. **Reduced motion:** `prefers-reduced-motion: reduce` stops auto-rotation, cap pulsing and star twinkle (Task 3 test).
5. **Small screens:** at 390 px wide, the drawer takes the full width and the pole-map side panel stacks below the map with no horizontal scroll (Task 7 e2e at a 390×844 viewport).

---

## File Structure

| Path | Responsibility |
|---|---|
| `scripts/optimize_models.sh` | `Moon Renders/*_Small.glb` → `web/public/models/{color,grid,topo}.glb` |
| `pipeline/atlas/polemaps.py` | smooth field, classes, hotspot threshold, topo/style/theme rendering, pixel projection of outlines, meta |
| `pipeline/tests/test_polemaps.py` | unit tests (synthetic arrays) + `-m data` test on real output |
| `pipeline/atlas/build.py` | new `maps` target; `all` = `regions` + `maps` |
| `web/src/data/mapsSchema.ts` (+test) | parse `maps/<pole>/meta.json` |
| `web/src/scene/stars.ts` (+test) | `makeStars(count, rand)` |
| `web/src/scene/caps.ts` (+test) | `makeCap(pole, capDeg)` |
| `web/src/scene/moonScene.ts` | renderer, camera framing, controls, model cache, picking, motion |
| `web/src/ui/topBar.ts` (+test) | render toggle + info button |
| `web/src/ui/infoPanel.ts` (+test) | drawer content + open/close/Esc/focus |
| `web/src/content/runLog.ts` | fixed run-log numbers and copy from Global Constraints |
| `web/src/ui/poleMap.ts` (+test) | pole map view: basemap img, SVG overlay, legend, style/theme switch, side panel |
| `web/src/router.ts` (+test) | `parseRoute(hash)` and the hash listener |
| `web/src/main.ts`, `web/index.html`, `web/src/ui/styles.css` | wiring + styles |
| `web/e2e/atlas.spec.ts`, `web/playwright.config.ts` | E2E |
| `.github/workflows/pages.yml`, `README.md`, `docs/benchmarks.md`, `CLAUDE.md` | ship + docs |

**Deleted** (superseded by the new design; their tests go too):
- `web/src/scene/{scene,globeGeometry,capGeometry,picking,regionsLayer}.ts`
- `web/src/ui/{layers,legend,readout,about,regions,regionChart,__testutils__}.ts`
- `web/public/data/{globe,north,south}/`

Keep: `web/src/data/{grid,load,schema,regionsSchema}.ts` (regions still load) and `web/src/geo/*` (tests still pass, and `psForward` is used by nothing new; delete it if lint flags it as unused).

---

### Task 1: Optimized Moon models

**Files:**
- Create: `scripts/optimize_models.sh`, `web/public/models/{color,grid,topo}.glb`

**Interfaces:**
- Produces: `web/public/models/color.glb`, `grid.glb`, `topo.glb`. Each has a meshopt-compressed geometry and a WebP baseColor texture ≤ 8192 px wide. Total ≤ 22 MB.

- [ ] **Step 1: Write `scripts/optimize_models.sh`.** Use `set -euo pipefail`. For each source → target pair, run `npx -y @gltf-transform/cli@4.1.1 optimize <src> <dst> --compress meshopt --texture-compress webp --texture-size 8192`. For topo only, add `--simplify true --simplify-ratio 0.25 --simplify-error 0.0005`. Then print `du -h` of the outputs.
- [ ] **Step 2: Run it** (`bash scripts/optimize_models.sh`). Expected: three files, total ≤ 22 MB, each < 95 MB. If topo is still > 12 MB, lower `--simplify-ratio` to 0.15 and re-run.
- [ ] **Step 3: Verify** with `npx -y @gltf-transform/cli@4.1.1 inspect web/public/models/topo.glb`. Expected: `EXT_meshopt_compression` is in extensionsUsed and the texture is `image/webp`.
- [ ] **Step 4: Commit (ask).** `feat(web): optimized NASA Moon models (meshopt + webp)`

### Task 2: Pole basemaps in the pipeline

**Files:**
- Create: `pipeline/atlas/polemaps.py`, `pipeline/tests/test_polemaps.py`
- Modify: `pipeline/atlas/build.py`, `pipeline/atlas/constants.py` (add `MAP_PX = 1600`, `SOUTH_MAP_BOX = (214, 19, 2223, 2028)`, `BAND_LEVELS = (0.4, 0.6, 0.8)`, `HOTSPOT_PCT = 85`, `SMOOTH_DIV = 9`, `TOPO_STEP_M = 500`, `TOPO_INDEX_M = 2000`)

**Interfaces:**
- Consumes: `PoleLayers.dem`, `PoleLayers.pred` (float32 2560² cap grids, NaN = no data) from `build.pole_layers`; `load_regions(ARTEMIS_DIR)`; `cap_grid(pole)`.
- Produces:
  - `smooth_field(pred: np.ndarray, size: int, div: int) -> np.ndarray` returns a size² array with NaN kept where `pred` is NaN.
  - `band_class(v: np.ndarray, levels: Sequence[float]) -> np.ndarray` returns int8: −1 for NaN, 0 below `levels[0]`, then 1..len(levels).
  - `hotspot_threshold(v: np.ndarray, pct: float) -> float` (nanpercentile).
  - `to_map_px(xy_m: np.ndarray, grid: Grid, box: tuple[int, int, int, int], size: int) -> np.ndarray` maps metres to image pixels.
  - `render_map(pole, style: Literal['a','b','d'], theme: Literal['dark','moon'], dem, field, out: Path) -> None`.
  - `export_maps(pole, layers: PoleLayers, regions: list[Region] | None, out_dir: Path) -> dict` writes `{a,b,d}-{dark,moon}.webp` and `meta.json`.
  - `meta.json` shape: `{"version":1, "pole", "size":1600, "kmPerPx", "polePx":[x,y], "levels":[0.4,0.6,0.8], "hotspot":t, "styles":["a","b","d"], "themes":["dark","moon"], "stats":{"mean","fracGe04","fracGe06","fracGe08","coverage","rmse"}, "regions":[{"id","name","px":[[x,y],...],"centroidPx":[x,y]}]}`. `regions` is `[]` for north.
  - The web reads files as `data/maps/<pole>/<style>-<theme>.webp`.

- [ ] **Step 1: Write failing tests** in `test_polemaps.py`:
  - `test_smooth_field_keeps_nan_mask_and_range`: a 64² ramp with a NaN corner gives output size 32 with NaN in the same corner, and finite values within [0, 1].
  - `test_band_class_levels`: `[nan, 0.1, 0.4, 0.59, 0.6, 0.85]` with `(0.4, 0.6, 0.8)` gives `[-1, 0, 1, 1, 2, 3]`.
  - `test_hotspot_threshold_is_85th_percentile`: `np.arange(100.)` with 85 → `84.15`.
  - `test_to_map_px_round_trip_corners`: the box corners map to `(0,0)` and `(size,size)`.
  - `test_export_maps_writes_12_files_and_meta(tmp_path)`: a synthetic 256² dem/pred, `regions=None`. Expect `{a,b,d}-{dark,moon}.webp` all present at 1600², `meta["regions"] == []`, and `0 <= stats["fracGe04"] <= 1`.
  - `@pytest.mark.data test_south_meta_has_nine_regions_inside_image`: run against real data. Expect 9 regions, every px point in `[0, 1600]`, and `stats.rmse` within 0.001 of 0.0236.
- [ ] **Step 2: Run** `conda run -n ni-lfm pytest pipeline/tests/test_polemaps.py -q`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `polemaps.py`.** Port `docs/design/pole-map-concepts/render_topo.py` + `render_b.py`, with these changes:
  - Render with matplotlib at `size/100` inches and 100 dpi.
  - Draw **no** region outlines into the image; the web draws them.
  - Write WebP with Pillow at `quality=90, method=6`.
  - Style A uses the theme's band colours as a continuous ramp: `bands[0]` at 0.2 rising to `bands[2]` at 1, with alpha `clip((v−0.2)/0.55)^1.4·0.8`.
  - Style D fills ≥ threshold with `bands[2]` (dark) or `bands[2]` (moon), with an edge in `edges[1]`.
  - RMSE = `sqrt(nanmean((pred−ref)²))` over pixels where both are finite. Pass `ref` in via `PoleLayers`.
  - Keep each function ≤ 50 lines; split `_topo(ax, dem, theme)` and `_overlay(ax, style, field, theme, thr)`.
- [ ] **Step 4: Wire `build.py`.** Add target `maps`, which runs `export_maps(pole, pole_layers(pole), regions if south else None, WEB_DATA_DIR / "maps" / pole)` for both poles. Change `all` to `regions` + `maps`; keep the `globe`, `north` and `south` targets callable. Delete `web/public/data/{globe,north,south}/`.
- [ ] **Step 5: Run** `conda run -n ni-lfm pytest -q && conda run -n ni-lfm pytest -m data -q && conda run -n ni-lfm python -m atlas.build maps && conda run -n ni-lfm ruff check pipeline && conda run -n ni-lfm mypy`. Expected: all pass; `du -sh web/public/data/maps` ≤ 8 MB.
- [ ] **Step 6: Eyeball** `web/public/data/maps/south/b-dark.webp`. It must match Figma frame `10:2`'s map; the only difference is no white boxes.
- [ ] **Step 7: Commit (ask).** `feat(pipeline): topographic pole basemaps (styles A/B/D, dark + moon themes)`

### Task 3: Landing scene (Moon, stars, caps, motion)

**Files:**
- Create: `web/src/scene/stars.ts`, `web/src/scene/caps.ts`, `web/src/scene/moonScene.ts`, `web/src/scene/stars.test.ts`, `web/src/scene/caps.test.ts`, `web/src/scene/moonScene.test.ts`
- Delete: the old `web/src/scene/*` files listed above, with their tests

**Interfaces:**
- Produces:
  - `makeStars(count: number, rand: () => number): { points: THREE.Points; uniforms: { uTime: {value:number}; uScale: {value:number} } }`
  - `makeCap(pole: Pole, capDeg: number): { group: THREE.Group; hit: THREE.Mesh }`, with `hit.userData.pole === pole`
  - `export type RenderId = 'color' | 'grid' | 'topo'`
  - `export const MODEL_URL: Record<RenderId, string>` = `models/color.glb` etc. (prefixed with `import.meta.env.BASE_URL` at call time)
  - `createMoonScene(canvas, opts: { reducedMotion: boolean; onStatus(msg: string | null): void; onPole(p: Pole): void }): MoonScene`
  - `MoonScene` has:
    - `setRender(id: RenderId): Promise<void>`: cached per id; it rejects on a load error, calls `onStatus` with a message, and keeps the previous model visible.
    - `resize(): void`
    - `dispose(): void`

- [ ] **Step 1: Write failing tests.**
  - `stars.test.ts`: `makeStars(500, seeded)` has 500 positions, all with radius in [40, 60]; `aBright` in [0.6, 1]; `aSpeed` in [0.3, 1.2].
  - `caps.test.ts`: every vertex of `makeCap('north', 12).hit` has `y/r ≥ cos(12°) − 1e-6`; south has `y/r ≤ −cos(12°) + 1e-6`; `hit.userData.pole` is set.
  - `moonScene.test.ts`, with GLTFLoader mocked and the WebGL renderer stubbed through a `deps` injection param:
    - `setRender('grid')` rejecting calls `onStatus` with text containing "Could not load" and keeps the previous model as the child.
    - With `reducedMotion: true`, one animation tick leaves the Moon's rotation.y unchanged and the cap opacity constant.
- [ ] **Step 2: Run** `npm test` (in `web/`). Expected: new tests FAIL.
- [ ] **Step 3: Implement** using the values in Global Constraints and the mockup's code:
  - GLTFLoader gets `setMeshoptDecoder(MeshoptDecoder)` from `three/examples/jsm/libs/meshopt_decoder.module.js`.
  - Normalise each model to radius 1 (bounding-box centre and scale), as the mockup does.
  - A ResizeObserver on the canvas parent applies the view offset.
  - Picking uses the canvas bounding rect for NDC. A click counts only if the pointer moved < 4 px.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit (ask).** `feat(web): NASA GLB Moon scene with starfield and pulsing pole caps`

### Task 4: Top bar, info drawer, landing wiring

**Files:**
- Create: `web/src/ui/topBar.ts`, `web/src/ui/infoPanel.ts`, `web/src/content/runLog.ts`, and tests `topBar.test.ts`, `infoPanel.test.ts` (jsdom: `// @vitest-environment jsdom`)
- Modify: `web/index.html`, `web/src/ui/styles.css`
- Delete: the old `web/src/ui/*` files listed above

**Interfaces:**
- Consumes: `RenderId`, `MoonScene` (Task 3), `RegionsDoc` (`loadRegions`).
- Produces:
  - `mountTopBar(root: HTMLElement, opts: { initial: RenderId; onRender(id: RenderId): void; onInfo(): void }): { setInfoOpen(open: boolean): void }`
  - `mountInfoPanel(aside: HTMLElement, regions: RegionsDoc, onClose: () => void): { open(): void; close(): void; isOpen(): boolean }`
  - `RUN_LOG` constants
- DOM ids: `#stage` (wraps canvas, title, top bar, status), `#moon`, `#status`, `#info` (aside), `#pole-links` (the two focus-visible buttons), `#map-view`.

- [ ] **Step 1: Write failing tests.**
  - The top bar renders 3 buttons with `aria-label`s "Colour render", "Grid render" and "Topography render". The initial one has `aria-pressed="true"`. Clicking Grid sets only Grid pressed and calls `onRender('grid')`.
  - The ⓘ button has `aria-expanded` that toggles via `setInfoOpen`.
  - The info panel contains, in order, the headings "Run log", "Accuracy by pole", "Artemis candidate regions" and "Credits". It contains "0.0277", "0.0298", "0.0236" and the text "not measured ice". The region table lists 9 rows sorted by `predMean` descending, with Slater Plain first in the real fixture. Esc closes it, and `inert` is set while closed.
  - The pole links: two buttons named "Open South Pole map" and "Open North Pole map".
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** the Figma frames `4:2`, `5:2` and `6:2` exactly: read them with `get_design_context` first, and take the copy, sizes and colours from them and the Global Constraints. Add `body.info-open` to push `#stage` right by the drawer width. The pole-link buttons are positioned off-screen until `:focus-visible`.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit (ask).** `feat(web): top bar, info drawer and landing layout from Figma`

### Task 5: Pole map view

**Files:**
- Create: `web/src/data/mapsSchema.ts`, `web/src/ui/poleMap.ts`, and tests `mapsSchema.test.ts`, `poleMap.test.ts`

**Interfaces:**
- Consumes: `maps/<pole>/meta.json` (Task 2 shape), `RegionsDoc`.
- Produces:
  - `parseMapsMeta(json: unknown): MapsMeta` (throws `DataError` on a bad shape)
  - `loadMapsMeta(base: string, pole: Pole): Promise<MapsMeta>`
  - `mountPoleMap(root: HTMLElement, opts: { base: string; pole: Pole; meta: MapsMeta; regions: RegionsDoc; onBack(): void }): { dispose(): void }`
  - `export type MapStyle = 'a' | 'b' | 'd'`, `export type MapTheme = 'dark' | 'moon'`
  - The style and theme persist to `localStorage` keys `atlas.mapStyle` / `atlas.mapTheme`, inside try/catch. Defaults are `'b'` / `'dark'`.

- [ ] **Step 1: Write failing tests.**
  - `parseMapsMeta` rejects a missing `size` or a region `px` that isn't an array.
  - The south mount:
    - renders 9 numbered badges and 9 SVG outlines
    - renders a side list sorted by prospectivity (row 1 = Slater Plain)
    - makes the img src end with `maps/south/b-dark.webp`
  - Clicking the style radio "Hotspots" changes the src to `d-dark.webp` and the legend to one swatch labelled `≥ <hotspot>`. The theme switch "Moon grey" gives `d-moon.webp`.
  - Hovering list row 2 adds `.is-active` to outline 2.
  - The north mount renders no badges and shows stat cards with the `meta.stats` values ("62%" for `fracGe04 = 0.6227`).
  - The legend for B shows 3 swatches labelled "0.4 – 0.6", "0.6 – 0.8" and "0.8 – 1"; for A it shows a continuous bar from 0.2 to 1.
  - "Back to Moon" calls `onBack`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** from Figma frames `10:2`, `13:2`, `15:2` and `16:2` (read them with `get_design_context`):
  - Add a segmented control "Map style: Glow · Bands · Hotspots" and a theme toggle "Dark / Moon grey" above the legend, styled like the landing toggle pill.
  - The SVG viewBox is `0 0 size size`, scaled with the img.
  - Outline stroke: white in dark, black in moon.
  - Pole label on a dark pill; 100 km scale bar from `kmPerPx`.
  - The side panel stacks under the map below 900 px wide.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit (ask).** `feat(web): pole map view with style/theme switcher and Artemis regions`

### Task 6: Router and main wiring

**Files:**
- Create: `web/src/router.ts`, `web/src/router.test.ts`
- Modify: `web/src/main.ts`

**Interfaces:**
- Produces:
  - `export type Route = { view: 'moon' } | { view: 'map'; pole: Pole }`
  - `parseRoute(hash: string): Route`: `#/south` → south map, `#/north` → north map, anything else → moon
  - `routeHash(r: Route): string`

- [ ] **Step 1: Failing tests:** `parseRoute('')`, `'#/'` and `'#/mars'` all give moon. `'#/south'` gives `{view:'map',pole:'south'}`. `routeHash` round-trips.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement and wire `main.ts`:**
  - Load regions plus both maps metas once.
  - Create the scene once.
  - On `hashchange`:
    - The map route hides `#stage`, mounts the pole map into `#map-view` and pauses the render loop.
    - The moon route disposes the map and resumes.
  - Cap clicks and pole links set `location.hash`. Back sets `#/`.
  - Read `prefers-reduced-motion` with `matchMedia`.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: PASS. Then `npm run dev` and check by hand: the toggle, the drawer, cap click → south map, Back, and a direct load of `/#/north`.
- [ ] **Step 5: Commit (ask).** `feat(web): hash routing between the Moon and pole maps`

### Task 7: Task 15: E2E, performance, accessibility, deploy, docs

**Files:**
- Create: `web/playwright.config.ts` (exactly as plan.md Task 15), `web/e2e/atlas.spec.ts`, `.github/workflows/pages.yml` (as plan.md Task 15), `README.md`
- Modify: `docs/benchmarks.md`, `CLAUDE.md`

- [ ] **Step 1: Write the E2E tests** (these replace plan.md's three, which test the deleted UI). Each test fails on any `pageerror`.
  - **landing:** `#status` hidden within 60 s; a `#moon` screenshot is > 20 kB; clicking "Grid render" sets `aria-pressed=true`.
  - **info:** clicking "Project information" opens the drawer showing "0.0277" and "not measured ice"; Esc closes it; the canvas box width shrinks while it's open.
  - **south map via keyboard:** focus "Open South Pole map" with Tab, press Enter. The URL ends `#/south`, the heading is "Candidate landing regions", and the list row 1 is "Slater Plain". Clicking "Hotspots" makes the img src end with `d-dark.webp`. "Back to Moon" returns to `#/`.
  - **deep link:** `goto('/#/north')` shows the heading "Predicted ice prospectivity" and text "62%".
  - **mobile** (viewport 390×844): `document.documentElement.scrollWidth <= 390` on `#/` with the drawer open and on `#/south`.
- [ ] **Step 2: Run** `npm run e2e`. Expected: `5 passed`. Fix the app, not the assertions.
- [ ] **Step 3: Performance.**
  - `npm run build && du -sh dist` must be ≤ 40 MB.
  - Lighthouse desktop on `npm run preview`.
  - 10 s orbit fps on the M1 Pro, target ≥ 50. If it's lower, swap the default render to Colour and re-measure.
  - Record all of this in `docs/benchmarks.md`.
- [ ] **Step 4: Accessibility pass.**
  - Visible focus ring on every control.
  - Text contrast ≥ 4.5:1 on `#000` and, for moon-theme map labels, on `#c9c5bd`.
  - The canvas has an `aria-label`; `#status` is `aria-live`.
  - The side list is a real `<table>`.
  - Reduced motion is verified with DevTools emulation.
- [ ] **Step 5: Deploy.** The repo `caelwynder/lunar-ice-atlas` is public.
  - Write `pages.yml`.
  - **Ask the user** before running `gh api -X POST repos/caelwynder/lunar-ice-atlas/pages -f build_type=workflow` (this enables Pages) and before pushing.
- [ ] **Step 6: Docs.**
  - README:
    - a GIF (QuickTime → `ffmpeg -i in.mov -vf "fps=12,scale=900:-1" demo.gif`; if the user can't record one now, leave a clearly marked `<!-- GIF: record per README -->` placeholder and say so)
    - the pitch, an architecture diagram and the Reproduce steps (`scripts/fetch_data.sh` → `scripts/predict_all.sh` → `scripts/optimize_models.sh` → `python -m atlas.build all` → `cd web && npm ci && npm run dev`)
    - the benchmark table, caveats, credits (including "NASA's Goddard Space Flight Center" for the Moon models) and the live URL
  - Update the CLAUDE.md Commands section with the verified commands.
- [ ] **Step 7: Final verification** (all must pass; paste the summary): `conda run -n ni-lfm pytest -q && conda run -n ni-lfm pytest -m data -q && conda run -n ni-lfm ruff check pipeline && conda run -n ni-lfm mypy && (cd web && npm test && npm run typecheck && npm run lint && npm run e2e)`
- [ ] **Step 8: Commit and push (ask).** `feat: e2e tests, accessibility pass and GitHub Pages deploy`

### Task 8: Sync the new UI into Figma

**Files:** none (Figma file `kqQhaYmrrCWfJBZouM6Y6o`)

- [ ] **Step 1:** With `npm run preview` running, capture with `generate_figma_design`, appending under page `0:1`:
  - `/#/south` in each style (A, B, D)
  - `/#/north` with style B
  - the 390 px mobile landing with the drawer open
- [ ] **Step 2:** Name the frames `Built · South map · A glow`, `Built · South map · D hotspots`, `Built · Mobile · info open`, and so on. Place them in a new row below `16:2` (y = existing max + 200). Return the node IDs.
- [ ] **Step 3:** Screenshot one frame to check that the fonts are Tajawal and the images are present. Report the frame links to the user. No commit.
