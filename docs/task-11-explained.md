# Task 11 explained: building the 3D shape of the Moon

## The one-sentence version

We wrote the code that turns the height data into **3D surfaces**: a bumpy **globe** for most of the Moon, plus two detailed **polar caps** for the ice regions, shaped so they'll blend together seamlessly when the Moon is drawn in Task 12.

---

## Why this step is needed

A 3D graphics card can't draw "a height grid". It draws **triangles**. To show the Moon, we have to build a mesh:

- a list of **points** (vertices) in 3D space,
- a list of **triangles** joining those points,
- and for each point, **where it lands on the images** (so the colour and ice layers are painted in the right place).

The Moon is drawn as **three pieces**, because the ice data only exists near the poles, on its own flat polar maps:

```
          north cap  (polar map, detailed ice layers, above 80°N)
        ─────────────
         globe       (whole-Moon colour image, 80.3°S to 80.3°N)
        ─────────────
          south cap  (polar map, detailed ice layers, below 80°S)
```

The pieces overlap slightly (80° to 80.3°), and each cap **fades out at its edge** so no seam is visible.

---

## Background you need

| Term | Plain meaning |
|---|---|
| **Mesh / geometry** | A 3D shape made of points joined into triangles. |
| **Vertex** | One point of the mesh. |
| **Displacement** | Pushing each point outward or inward from a perfect sphere by the terrain height, so mountains stick up and craters sink. |
| **Exaggeration** | Multiplying heights (e.g. ×5) so relief is visible. The real Moon's 10 km mountains are only 0.6% of its radius, which looks almost perfectly smooth. |
| **UV coordinates** | For each vertex, "which spot on the image goes here". u runs left→right and v runs bottom→top, both 0 to 1. |
| **Normal** | The direction a surface faces. Lighting uses it, and it must point **outward**, or the Moon looks lit from inside. |
| **Winding order** | The order a triangle's 3 corners are listed. It decides which side counts as the front, and so which way the normal points. |
| **Edge fade** | A 0→1 value per vertex saying how much to fade the cap near its edge, used for the seamless blend. |

---

## What Task 11 did, step by step

Code is in `web/src/scene/`, written test-first.

1. **Checked the globe's height map is the right way round.** In Task 8 we assumed NASA's globe height file runs from 180°W on the left to 180°E on the right, with north at the top. If that were wrong, every mountain would be in the wrong place. I checked it against famous landmarks:

   | Landmark | Where it really is | What the file says there |
   |---|---|---|
   | **Selenean summit** (highest point on the Moon) | 5.4°N, 158.6°W | **+10,504 m**, the maximum in the whole file, at exactly that spot |
   | **Antoniadi crater** (deepest area, in the South Pole–Aitken basin) | 70°S, 172°W | **−8,878 m**, the minimum in the whole file, at exactly that spot |
   | **Mare Imbrium** (big dark lowland plain) | 33°N, 16°W | **−2,240 m**, low as expected |

   The orientation is correct, and it's now an automatic test.

2. **The globe (`globeGeometry.ts`).**
   - Lays a grid of points over the sphere from 80.3°S to 80.3°N, every so many degrees of longitude and latitude.
   - Looks up each point's height (`equirectHeightAt`, smoothly blended between cells) and pushes it outward: 1 unit = the Moon's radius, so +1,000 m at ×5 exaggeration is +0.29% of the radius.
   - Gives each point its UV spot on the colour image, and joins neighbouring points into two triangles per grid square.

3. **The polar caps (`capGeometry.ts`).**
   - The cap's grid is the **flat polar map** from Task 4 (640 × 640 points after thinning), not lat/lon. Each point is converted polar map → lat/lon (Task 9 maths) → 3D, then pushed out by its LOLA height.
   - Because the grid *is* the polar map, the ice images line up with it **with no re-warping**, just "pixel (col, row) → UV".
   - The square map's corners reach below 80°, where the globe takes over, so **triangles outside the circle are dropped**. Each point near the edge gets an **edge-fade** value from 0 (fully faded) to 1 (fully shown).

4. **Fixed a mistake in the plan (the tests caught it).**
   The plan said the north cap's triangles must be listed in the **opposite order** to the south cap's, because the polar map is mirrored between the poles. The test showed the north cap's surface then **faced inward**, so it would have looked hollow and lit from inside.
   Why: the polar map is mirrored *and* the north cap sits on the mirrored half of the 3D sphere. **Two mirror flips cancel out**, so both caps need the same order. I removed the flip, and both poles now pass.

5. **Two small test fixes:**
   - One test asked for UV values accurate to 12 decimal places, but 3D graphics store them as 32-bit numbers with only ~7 digits. The test now asks for 6.
   - The plan's tests used `!` ("trust me, this isn't empty"), which the project's strict code checker forbids. They now use a small helper that fails with a clear message instead.

---

## What it accomplished

### Real-data build sizes and speed

Built from the real files on your laptop:

| Piece | Points | Triangles | Build time |
|---|---|---|---|
| South cap | 409,600 | 661,420 | 170 ms |
| North cap | 409,600 | 661,420 | 144 ms |
| Globe (at full data resolution) | 928,004 | ~1.85 million | 293 ms |

All three together take **under 0.7 seconds**, fast enough to build when the page loads with no loading spinner needed. Task 12 decides the final globe resolution.

### Tests

**35** website tests pass (8 new), and typecheck and lint are clean.

| Test | What it proves |
|---|---|
| `respects the latitude limit and displaces radially` | The globe stops at ±80.3° and heights push points straight outward by the right amount. |
| `uses equirect uvs: u=0 at lon -180, v at north limit` | The colour image is placed the right way round. |
| `faces outward` (globe) | The globe is lit from outside, not inside. |
| `reads the real SVS heights with the right orientation` | **Real data:** the highest and lowest points land on the Selenean summit and Antoniadi. |
| `keeps inner triangles only and maps uv to grid cells` (×2 poles) | Caps drop their square corners, and images map onto grid cells exactly. |
| `edgeFade is within [0,1] and normals face outward` (×2 poles) | The fade is valid, and **both caps face outward** (the test that caught the plan's mistake). |

---

## What it did *not* do (yet)

- **Nothing is on screen yet.** These functions *build* shapes, and Task 12 adds the camera, lighting, materials (images and ice layers) and shows the first visible Moon.
- **The edge-fade blend isn't drawn yet.** The values are computed here, and Task 12's material uses them.

---

## How to re-run the checks

```bash
cd web
npm test            # 35 tests, including the real-landmark check
npm run typecheck
npm run lint
```

The task's checklist is in [`plan.md`](../plan.md), Task 11.
