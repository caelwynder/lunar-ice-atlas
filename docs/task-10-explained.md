# Task 10 explained: teaching the website to read the data files safely

## The one-sentence version

We wrote the website code that **downloads the data files from Task 8, checks they're exactly the shape we expect, and turns the raw bytes into numbers** you can look up by position, like "what's the predicted ice value under the mouse pointer?".

---

## Why this step is needed

Task 8 wrote 27 files into `web/public/data/`. The browser needs to read them, but:

- **Some files are just raw bytes.** `pred.u8.bin` is 409,600 numbers from 0 to 255 with no labels. Something has to know that 255 means "no data" and that 127 means about 0.5.
- **The JSON files are a contract between Python and TypeScript.** If the pipeline ever renamed a field (say `mesh` → `terrain`), the website would crash deep inside the 3D code with a baffling error. It's much better to stop immediately with a message like `meta.mesh: expected object`.
- **The 3D code (Tasks 11–14) needs clean, typed data**, not "some JSON that's hopefully right".

So Task 10 is the **front door** for all data: nothing reaches the 3D scene without passing through it.

---

## Background you need

| Term | Plain meaning |
|---|---|
| **Data contract / schema** | An agreed description of a file's shape: which fields exist, and what type each one is. |
| **Validation (parsing)** | Checking a file matches the contract *when it's loaded*, and giving a clear error if not. TypeScript types alone can't do this, because they vanish when the code runs. |
| **Raw binary grid** | A long list of numbers with no labels, one per map cell, row by row. It's compact and fast, but meaningless without instructions. |
| **u8 / i16** | Number sizes. **u8** = 0–255 (1 byte), used for ice values. **i16** = −32,768 to 32,767 (2 bytes), used for heights in metres. |
| **Nodata** | A special value meaning "nothing measured here": 255 for u8 and −32,768 for i16. |
| **u, v coordinates** | Position inside a grid as fractions: u runs 0→1 left to right, v runs 0→1 **top to bottom**. |
| **Bilinear interpolation** | Blending the 4 nearest cells for a smooth value between them, instead of jumping from cell to cell. |

---

## What Task 10 did, step by step

All code is in `web/src/data/`, written test-first.

1. **`grid.ts`: turning bytes into values.**
   - `decodeU8(min, max)` reverses the Python encoding from Task 6. The byte 0 becomes `min`, 254 becomes `max`, and **255 becomes "no data"** (returned as `null`, never as a fake 0).
   - `decodeI16` reads heights in metres, with −32,768 as "no data".
   - `ValueGrid` wraps a grid and answers "what's the value at (u, v)?":
     - `sample(u, v)` gives the nearest cell (used for hover readouts),
     - `bilinear(u, v)` gives a smooth blend of the 4 nearest cells. **If any of those 4 is "no data", it falls back to the nearest cell** rather than blending in garbage.
     - It refuses to build a grid if the byte count doesn't match width × height, which catches truncated downloads.

2. **`schema.ts`: checking the pole and globe `meta.json` files.**
   Each field is checked by hand (no extra library, so nothing is added to the download size). Errors say **exactly where** the problem is, for example `meta.layers[0].legend.kind: unknown "rainbow"`.

3. **`regionsSchema.ts`: checking `regions.json`.** It checks all 9 regions, their outlines (at least 3 points), centres, and the 10 statistics. A statistic may be `null` ("no data"), but it can never be missing or text.

4. **`load.ts`: fetching everything.**
   - `loadPole(base, 'south')` downloads the pole's `meta.json`, validates it, then downloads the height grid and the three value grids (`pred`, `ref`, `err`) **in parallel**.
   - `loadGlobe(base)` and `loadRegions(base)` do the same for the globe and the regions.
   - A failed download becomes a clear `DataError` naming the file, e.g. `/data/north/meta.json: HTTP 404`.

5. **An extra test the plan didn't have: loading the *real* files.** The plan only tested the parsers on made-up examples. I added `load.test.ts`, which runs the real loaders on the actual files Task 8 produced, reading them from disk in place of the internet. This proves the Python output and the TypeScript contract agree **today**, and it will fail loudly if a future pipeline change breaks them.

---

## What it accomplished

### The website can now read every data file, and the values make sense

Examples from the real data, read the same way the new code reads them:

| What | Raw bytes | Decoded value |
|---|---|---|
| Predicted ice at the centre of the south-pole map (about 3 km from the pole) | `251` | **0.988**, very high, as expected in the cold polar craters |
| A cell outside the mapped area (cap corners and dataset gaps, ~30% of cells) | `255` | **no data** (`null`) |
| Globe height at 0°N, 0°E | `-722` | **−722 m** below the reference sphere |

### Tests

**27** website tests pass (11 new), and typecheck and lint are clean.

| Test | What it proves |
|---|---|
| `samples nearest with v=0 at the top row` | Grids are read top-down, like the images, so hover values line up with the colours. |
| `returns null outside [0,1] and rejects wrong sizes` | Out-of-range lookups return "no data", and truncated files are rejected. |
| `bilinear falls back to nearest next to nodata` | Smoothing never mixes in missing data. |
| `accepts the v1 contract` / `parses globe meta` | Correct files are accepted. |
| `rejects wrong version and missing fields with a clear path` | Broken files fail with a message that points at the bad field. |
| `accepts nulls in stats and requires outline points` | Region statistics can be "no data", and outlines must be real shapes. |
| `loads the real south pole export …` | **The real south-pole files** load, with ice values between 0 and 1. |
| `loads the real globe with heights in metres` | **The real globe** loads as a 1440 × 720 grid of plausible heights. |
| `loads all nine real regions` | **The real `regions.json`** has all 9 regions and the USGS DOI. |
| `reports missing files as DataError with the url` | A missing file gives a clear error naming it. |

---

## What it did *not* do (yet)

- **Nothing is drawn yet.** Task 11 uses these grids to build the 3D globe and polar-cap shapes, and Task 12 shows the first visible Moon.
- **The images (`.jpg`, `.webp`) aren't loaded here.** `url(file)` gives their address, and the 3D code loads them as textures in Task 12.

---

## How to re-run the checks

```bash
cd web
npm test            # 27 tests, including the real-data loaders
npm run typecheck
npm run lint
```

The task's checklist is in [`plan.md`](../plan.md), Task 10.
