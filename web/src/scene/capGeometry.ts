import * as THREE from 'three';
import type { ValueGrid } from '../data/grid';
import type { PoleMeta } from '../data/schema';
import { psInverse } from '../geo/polarStereo';
import { latLonToVec3 } from '../geo/sphere';
import { SCENE_RADIUS, heightScale } from './globeGeometry';

interface CapVertices {
  positions: Float32Array;
  uvs: Float32Array;
  fade: Float32Array;
  absLat: Float32Array;
}

function capVertices(meta: PoleMeta, heights: ValueGrid, exaggeration: number, overlapDeg: number): CapVertices {
  const { width: w, height: h } = meta.mesh;
  const cell = (meta.grid.width * meta.grid.pixelSize) / w;
  const s = heightScale(exaggeration);
  const out = {
    positions: new Float32Array(w * h * 3),
    uvs: new Float32Array(w * h * 2),
    fade: new Float32Array(w * h),
    absLat: new Float32Array(w * h),
  };
  const inner = meta.edgeLatDeg - overlapDeg;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const k = r * w + c;
      const { lat, lon } = psInverse(meta.grid.x0 + (c + 0.5) * cell, meta.grid.y0 - (r + 0.5) * cell, meta.crs);
      const hgt = heights.sample((c + 0.5) / w, (r + 0.5) / h) ?? 0;
      out.positions.set(latLonToVec3(lat, lon, SCENE_RADIUS + hgt * s), k * 3);
      out.uvs.set([(c + 0.5) / w, 1 - (r + 0.5) / h], k * 2);
      out.absLat[k] = Math.abs(lat);
      out.fade[k] = Math.min(1, Math.max(0, (Math.abs(lat) - inner) / (2 * overlapDeg)));
    }
  }
  return out;
}

function capIndex(w: number, h: number, absLat: Float32Array, minLat: number): number[] {
  const index: number[] = [];
  for (let r = 0; r < h - 1; r++) {
    for (let c = 0; c < w - 1; c++) {
      const a = r * w + c;
      const quad = [a, a + 1, a + w, a + w + 1];
      if (!quad.every((q) => (absLat[q] ?? 0) >= minLat)) continue;
      const [p, q, d, e] = quad as [number, number, number, number];
      index.push(p, d, q, q, d, e);
    }
  }
  return index;
}

export function buildCapGeometry(
  meta: PoleMeta,
  heights: ValueGrid,
  exaggeration: number,
  overlapDeg: number,
): THREE.BufferGeometry {
  const v = capVertices(meta, heights, exaggeration, overlapDeg);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(v.positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(v.uvs, 2));
  g.setAttribute('edgeFade', new THREE.BufferAttribute(v.fade, 1));
  g.setIndex(capIndex(meta.mesh.width, meta.mesh.height, v.absLat, meta.edgeLatDeg - overlapDeg));
  g.computeVertexNormals();
  return g;
}
