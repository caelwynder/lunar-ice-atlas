import * as THREE from 'three';
import type { ValueGrid } from '../data/grid';
import { MOON_RADIUS_M } from '../geo/constants';
import { latLonToVec3 } from '../geo/sphere';

export const SCENE_RADIUS = 1;
export const heightScale = (exaggeration: number): number => (exaggeration * SCENE_RADIUS) / MOON_RADIUS_M;

export interface GlobeOptions {
  latLimitDeg: number;
  lonSegments: number;
  latSegments: number;
  heightAt: (lat: number, lon: number) => number;
  exaggeration: number;
}

export function equirectHeightAt(grid: ValueGrid): (lat: number, lon: number) => number {
  return (lat, lon) => grid.bilinear((lon + 180) / 360, (90 - lat) / 180, true) ?? 0;
}

function gridIndex(cols: number, rows: number): number[] {
  const index: number[] = [];
  const row = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * row + i;
      index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  return index;
}

/** Lon -180 and +180 are duplicate vertices; give both the average normal so no shading line shows. */
function weldSeamNormals(g: THREE.BufferGeometry, cols: number, rows: number): void {
  const n = g.getAttribute('normal');
  const avg = new THREE.Vector3();
  for (let j = 0; j <= rows; j++) {
    const a = j * (cols + 1);
    const b = a + cols;
    avg.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, avg.x, avg.y, avg.z);
    n.setXYZ(b, avg.x, avg.y, avg.z);
  }
  n.needsUpdate = true;
}

export function buildGlobeGeometry(o: GlobeOptions): THREE.BufferGeometry {
  const s = heightScale(o.exaggeration);
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let j = 0; j <= o.latSegments; j++) {
    const lat = o.latLimitDeg - (2 * o.latLimitDeg * j) / o.latSegments;
    for (let i = 0; i <= o.lonSegments; i++) {
      const lon = -180 + (360 * i) / o.lonSegments;
      positions.push(...latLonToVec3(lat, lon, SCENE_RADIUS + o.heightAt(lat, lon) * s));
      uvs.push(i / o.lonSegments, (lat + 90) / 180);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(gridIndex(o.lonSegments, o.latSegments));
  g.computeVertexNormals();
  weldSeamNormals(g, o.lonSegments, o.latSegments);
  return g;
}
