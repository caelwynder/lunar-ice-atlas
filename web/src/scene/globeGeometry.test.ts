import { readFile } from 'node:fs/promises';
import type * as THREE from 'three';
import { expect, it } from 'vitest';
import { ValueGrid, decodeI16 } from '../data/grid';
import { buildGlobeGeometry, equirectHeightAt, heightScale } from './globeGeometry';

const indexOf = (g: THREE.BufferGeometry): THREE.BufferAttribute => {
  const index = g.getIndex();
  if (!index) throw new Error('geometry has no index');
  return index;
};

it('respects the latitude limit and displaces radially', () => {
  const g = buildGlobeGeometry({
    latLimitDeg: 80.3,
    lonSegments: 8,
    latSegments: 4,
    heightAt: () => 1000,
    exaggeration: 5,
  });
  const pos = g.getAttribute('position');
  const r = 1 + 1000 * heightScale(5);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    expect(Math.hypot(pos.getX(i), y, pos.getZ(i))).toBeCloseTo(r, 6);
    expect(Math.abs((Math.asin(y / r) * 180) / Math.PI)).toBeLessThanOrEqual(80.3 + 1e-9);
  }
  expect(indexOf(g).count).toBe(8 * 4 * 6);
});

it('uses equirect uvs: u=0 at lon -180, v at north limit', () => {
  const g = buildGlobeGeometry({ latLimitDeg: 80, lonSegments: 4, latSegments: 2, heightAt: () => 0, exaggeration: 1 });
  const uv = g.getAttribute('uv');
  expect(uv.getX(0)).toBe(0);
  expect(uv.getY(0)).toBeCloseTo(170 / 180, 6); // float32 attribute
});

it('faces outward', () => {
  const g = buildGlobeGeometry({
    latLimitDeg: 60,
    lonSegments: 16,
    latSegments: 8,
    heightAt: () => 0,
    exaggeration: 1,
  });
  const n = g.getAttribute('normal');
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    expect(n.getX(i) * p.getX(i) + n.getY(i) * p.getY(i) + n.getZ(i) * p.getZ(i)).toBeGreaterThan(0);
  }
});

it('reads the real SVS heights with the right orientation (known landmarks)', async () => {
  const bytes = await readFile(new URL('../../public/data/globe/height.i16.bin', import.meta.url));
  const data = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const heightAt = equirectHeightAt(new ValueGrid(1440, 720, data, decodeI16));
  expect(heightAt(5.4, -158.6)).toBeGreaterThan(10_000); // Selenean summit, the Moon's highest point
  expect(heightAt(-70.4, -172.4)).toBeLessThan(-8_500); // Antoniadi crater, South Pole–Aitken basin
  expect(heightAt(33, -16)).toBeLessThan(-1_500); // Mare Imbrium lowlands
});

it('closes the antimeridian seam: matching positions and normals at lon -180 and +180', () => {
  const heights = new ValueGrid(4, 2, Int16Array.from([0, 3000, 6000, 9000, 1000, 2000, 3000, 4000]), decodeI16);
  const lonSegments = 8;
  const g = buildGlobeGeometry({
    latLimitDeg: 60,
    lonSegments,
    latSegments: 4,
    heightAt: equirectHeightAt(heights),
    exaggeration: 6,
  });
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  for (let row = 0; row <= 4; row++) {
    const a = row * (lonSegments + 1);
    const b = a + lonSegments;
    for (const attr of [p, n]) {
      expect(attr.getX(a)).toBeCloseTo(attr.getX(b), 6);
      expect(attr.getY(a)).toBeCloseTo(attr.getY(b), 6);
      expect(attr.getZ(a)).toBeCloseTo(attr.getZ(b), 6);
    }
  }
});
