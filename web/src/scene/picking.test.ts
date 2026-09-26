import { expect, it } from 'vitest';
import { ValueGrid, decodeI16, decodeU8 } from '../data/grid';
import type { LoadedPole } from '../data/load';
import type { PoleMeta } from '../data/schema';
import { heightScale } from './globeGeometry';
import { lookupValues, raySurface } from './picking';

const meta: PoleMeta = {
  version: 1,
  pole: 'south',
  crs: { lat0: -90, k0: 0.994, falseEasting: 500000, falseNorthing: 500000, radius: 1737400 },
  grid: { x0: 197863.76, y0: 802136.24, pixelSize: 238.56, width: 2560, height: 2560 },
  mesh: { file: '', width: 2, height: 2, stride: 1280, units: 'm' },
  base: { file: '' },
  edgeLatDeg: 80,
  layers: [],
};
const pole: LoadedPole = {
  meta,
  url: (f) => f,
  heights: new ValueGrid(2, 2, Int16Array.from([10, 20, 30, 40]), decodeI16),
  values: { pred: new ValueGrid(2, 2, Uint8Array.from([0, 254, 127, 255]), decodeU8(0, 1)) },
};

it('maps the south pole into the cell containing (500000, 500000)', () => {
  const out = lookupValues(pole, -90, 0);
  expect(out.uv?.[0]).toBeCloseTo((500000 - 197863.76) / (2560 * 238.56), 9);
  expect(out.elevationM).toBe(10); // u = v ≈ 0.4947 → row 0, col 0
  expect(out.values.pred).toBe(0);
});

it('returns nothing equatorward of the cap or on the other hemisphere', () => {
  expect(lookupValues(pole, -70, 0).uv).toBeNull();
  expect(lookupValues(pole, 85, 0).uv).toBeNull();
});

const scale = heightScale(6);

it('raySurface hits the displaced sphere head-on', () => {
  const hit = raySurface([0, 0, 5], [0, 0, -1], () => 1000, scale);
  expect(hit?.lat).toBeCloseTo(0, 9);
  expect(hit?.lon).toBeCloseTo(-90, 9); // +z is lon -90 (lon 90E is -z)
  expect(hit?.r).toBeCloseTo(1 + 1000 * scale, 9);
});

it('raySurface converges onto varying terrain and reports misses', () => {
  const heightAt = (lat: number): number => 8000 * Math.sin((lat * Math.PI) / 30);
  const hit = raySurface([0.3, 0.2, 5], [0, 0, -1], heightAt, scale);
  expect(hit).not.toBeNull();
  expect(hit?.r).toBeCloseTo(1 + heightAt(hit?.lat ?? 0) * scale, 6);
  expect(raySurface([0, 3, 5], [0, 0, -1], () => 0, scale)).toBeNull();
});
