import { describe, expect, it } from 'vitest';
import { buildTerrainGeometry, mapToWorld, sampleHeight } from './poleTerrain';

const GRID = Int16Array.from([0, 10, 20, 30, 40, 50, 60, 70, 80]);

describe('buildTerrainGeometry', () => {
  it('lays the grid out as a unit square with the image top at the far edge', () => {
    const g = buildTerrainGeometry(GRID, 3, 0.01);
    const pos = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    expect(pos.count).toBe(9);
    expect([pos.getX(0), pos.getY(0), pos.getZ(0)].map((v) => +v.toFixed(6))).toEqual([-0.5, 0, -0.5]);
    expect([pos.getX(8), pos.getY(8), pos.getZ(8)].map((v) => +v.toFixed(6))).toEqual([0.5, 0.8, 0.5]);
    expect([uv.getX(0), uv.getY(0)]).toEqual([0, 1]);
    expect([uv.getX(8), uv.getY(8)]).toEqual([1, 0]);
  });

  it('points normals up on flat ground', () => {
    const g = buildTerrainGeometry(new Int16Array(9), 3, 1);
    expect(g.getAttribute('normal').getY(4)).toBeCloseTo(1);
  });
});

describe('sampleHeight', () => {
  it('returns grid values at the corners and blends between them', () => {
    expect(sampleHeight(GRID, 3, 0, 0)).toBe(0);
    expect(sampleHeight(GRID, 3, 1, 1)).toBe(80);
    expect(sampleHeight(GRID, 3, 0.5, 0.5)).toBe(40);
    expect(sampleHeight(GRID, 3, 0.25, 0)).toBe(5);
  });

  it('clamps outside the grid', () => {
    expect(sampleHeight(GRID, 3, -1, 2)).toBe(60);
  });
});

describe('mapToWorld', () => {
  it('turns basemap pixels into ground positions with a lift', () => {
    const p = mapToWorld([800, 800], 1600, GRID, 3, 0.01, 5);
    expect([p.x, p.y, p.z]).toEqual([0, 0.45, 0]);
  });
});
