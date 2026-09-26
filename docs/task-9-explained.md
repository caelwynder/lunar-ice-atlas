# Task 9 explained: starting the website, and teaching it lunar maths

## The one-sentence version

We created the **website project** (TypeScript + Vite + Three.js) and wrote its first code: the small maths functions that convert between **latitude/longitude on the Moon**, **positions on the flat polar maps**, and **3D points on the globe**. They're tested against the Python pipeline so both sides agree to within half a millimetre.

---

## Why this step is needed

Tasks 0–8 were all Python: they turned raw NASA data into files in `web/public/data/`. From here on we build the **website that shows those files as an interactive 3D Moon**.

Before drawing anything, the website must answer the same geometry questions the Python side already answers:

- *"This pixel on the south-pole ice map. Where is it on the Moon?"* (needed for hover readouts)
- *"Haworth is at 86.77°S, 22.6°W. Where is that on the 3D sphere?"* (needed to fly the camera there)

If the website and the pipeline did this maths even slightly differently, the ice overlays would **slide off the terrain**. So this task writes the maths once, carefully, and **proves** it matches the Python version.

---

## Background you need

| Term | Plain meaning |
|---|---|
| **TypeScript** | JavaScript with types. The compiler catches mistakes like passing latitude where longitude was expected before the code runs. |
| **Vite** | The tool that runs the site locally (`npm run dev`) and bundles it for publishing (`npm run build`). |
| **Three.js** | The 3D graphics library that will draw the Moon (from Task 11). It's installed now but not used yet. |
| **Vitest** | The test runner for the website, the equivalent of pytest on the Python side. |
| **ESLint / Prettier** | A code-quality checker and an automatic formatter, so the code stays consistent. |
| **Polar stereographic (PS)** | The flat map projection used for the pole maps. It's like looking straight down on the pole, with distances in metres from a fixed origin. |
| **Fixture** | A small file of known-correct answers used by tests. Here, 8 points that the Python library **pyproj** converted in Task 2. |

---

## What Task 9 did, step by step

1. **Created the website project in `web/`.**
   - Installed exactly the versions in the plan (Three.js 0.186.1, Vite 8.3.1, TypeScript 5.9.3, Vitest 5.0.1, ESLint 10, Prettier 3.9.9, Playwright 1.63.0). I first checked that each version really exists on npm.
   - Added the standard commands:

     | Command (run in `web/`) | What it does |
     |---|---|
     | `npm run dev` | Starts the site locally |
     | `npm test` | Runs the tests |
     | `npm run typecheck` | Checks all the types |
     | `npm run lint` | Checks code quality and formatting |
     | `npm run build` | Produces the publishable site in `web/dist/` |

   - Installed the Chromium browser for Playwright. It isn't used yet; the end-to-end browser tests come in Task 15.

2. **Wrote the tests first**, watched them fail, then wrote the code (`web/src/geo/`):

   | File | What it does |
   |---|---|
   | `constants.ts` | The Moon's radius (1,737,400 m, the same single sphere used everywhere) and a degrees-to-radians factor |
   | `polarStereo.ts` | `psForward`: lat/lon → metres on the polar map. `psInverse`: metres → lat/lon. |
   | `sphere.ts` | `latLonToVec3`: lat/lon → a 3D point on the globe. `vec3ToLatLon`: the reverse (used when you click the globe). |

3. **Checked the website maths against the Python maths.** The test loads the 8 reference points from Task 2 and checks the TypeScript code gets the same answer. For example:

   | Point | pyproj (Python) says | TypeScript must match to |
   |---|---|---|
   | South pole (90°S) | x = 500,000.000 m, y = 500,000.000 m | 0.5 mm |
   | 84.2°S, 60.7°E | x = 652,585.629 m, y = 585,627.061 m | 0.5 mm |
   | 82°N, 45°W | x = 329,216.886 m, y = 329,216.886 m | 0.5 mm |

   All 8 match. It also converts each point **there and back** (lat/lon → map → lat/lon) and gets the original to within a billionth of a degree.

4. **Pinned down the globe's axis directions.** In the 3D scene, **up (+y) is the north pole**, longitude 0° points along **+x**, and 90°E points along **−z**. That's easy to get backwards, which would put features on the wrong side of the Moon, so there's a test for it.

5. **Small setup fixes the plan didn't anticipate:**
   - The config file reads `process.env` (to set the site's base path when publishing), so TypeScript needed Node's type definitions (`@types/node`). Without them, the typecheck failed.
   - The lint command checks only `src/` for now. The plan's version also checks an `e2e/` folder that won't exist until Task 15, and the linter errors on a missing folder. **Task 15 must add it back** (noted in `plan.md`).
   - The formatter now skips the fixture file, because Python generates it and would overwrite any reformatting.

---

## What it accomplished

- **A working website project.** `npm run dev`, `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` all succeed. The page is still blank, which is expected.
- **16 passing tests:**

  | Test | What it proves |
  |---|---|
  | `matches pyproj for …` (8 tests) | The website's polar-map maths equals the pipeline's to 0.5 mm, for both poles. |
  | `round-trips …` (6 tests) | Converting to the map and back returns the same place. (The exact poles are skipped because longitude has no meaning there.) |
  | `puts +90 lat on +y and lon 90E on -z` | The 3D globe is oriented correctly: north is up, east is the right way round. |
  | `round-trips` (sphere) | A point near Nobile Rim 2 survives lat/lon → 3D → lat/lon unchanged. |

- **One shared geometry.** The pipeline and the website now provably use the same Moon (a sphere of radius 1,737,400 m) and the same map projection, so overlays will line up.

---

## What it did *not* do (yet)

- **Nothing is drawn yet.** Task 10 loads the data files from Task 8, Task 11 builds the globe and polar-cap shapes, and Task 12 shows the first visible Moon.
- **No browser tests yet.** Playwright is installed, but its tests come in Task 15.

---

## How to re-run the checks

```bash
cd web
npm test            # 16 tests
npm run typecheck
npm run lint
npm run build
```

The task's checklist is in [`plan.md`](../plan.md), Task 9.
