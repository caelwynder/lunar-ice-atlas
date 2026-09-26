import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ValueGrid, decodeI16 } from '../data/grid';
import type { PoleMeta } from '../data/schema';
import { buildCapGeometry } from './capGeometry';

const indexOf = (g: THREE.BufferGeometry): THREE.BufferAttribute => {
  const index = g.getIndex();
  if (!index) throw new Error('geometry has no index');
  return index;
};

const meta = (lat0: number): PoleMeta => ({
  version: 1,
  pole: lat0 < 0 ? 'south' : 'north',
  crs: { lat0, k0: 0.994, falseEasting: 500000, falseNorthing: 500000, radius: 1737400 },
  grid: { x0: 197863.76, y0: 802136.24, pixelSize: 238.56, width: 2560, height: 2560 },
  mesh: { file: '', width: 8, height: 8, stride: 320, units: 'm' },
  base: { file: '' },
  edgeLatDeg: 80,
  layers: [],
});
const flat = new ValueGrid(8, 8, new Int16Array(64), decodeI16);

describe.each([-90, 90])('cap lat0=%i', (lat0) => {
  const g = buildCapGeometry(meta(lat0), flat, 1, 0.3);

  it('keeps inner triangles only and maps uv to grid cells', () => {
    expect(g.getAttribute('position').count).toBe(64);
    expect(indexOf(g).count).toBeGreaterThan(0);
    expect(indexOf(g).count).toBeLessThan(7 * 7 * 6);
    const uv = g.getAttribute('uv');
    expect(uv.getX(0)).toBeCloseTo(0.5 / 8, 12);
    expect(uv.getY(0)).toBeCloseTo(1 - 0.5 / 8, 12);
  });

  it('edgeFade is within [0,1] and normals face outward', () => {
    const fade = g.getAttribute('edgeFade');
    const n = g.getAttribute('normal');
    const p = g.getAttribute('position');
    const used = new Set(Array.from(indexOf(g).array));
    for (const i of used) {
      expect(fade.getX(i)).toBeGreaterThanOrEqual(0);
      expect(fade.getX(i)).toBeLessThanOrEqual(1);
      expect(n.getX(i) * p.getX(i) + n.getY(i) * p.getY(i) + n.getZ(i) * p.getZ(i)).toBeGreaterThan(0);
    }
  });
});
