import * as THREE from 'three';
import type { RegionsDoc } from '../data/regionsSchema';
import { latLonToVec3 } from '../geo/sphere';

const LIFT_M = 500; // clears steep massif relief between 1 km outline vertices at 6x exaggeration
const IDLE = { color: 0xffffff, opacity: 0.8 };
const SELECTED = { color: 0xeda100, opacity: 1 };

type Loop = THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;

export interface RegionsLayer {
  group: THREE.Group;
  highlight(id: string | null): void;
  dispose(): void;
}

function outlineLoop(outline: [number, number][], heightM: (lat: number, lon: number) => number, scale: number): Loop {
  const points = outline.map(
    ([lon, lat]) => new THREE.Vector3(...latLonToVec3(lat, lon, 1 + (heightM(lat, lon) + LIFT_M) * scale)),
  );
  const material = new THREE.LineBasicMaterial({ ...IDLE, transparent: true, depthTest: true });
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material);
}

export function createRegionsLayer(
  doc: RegionsDoc,
  heightM: (lat: number, lon: number) => number,
  scale: number,
): RegionsLayer {
  const group = new THREE.Group();
  const loops = new Map<string, Loop>();
  for (const region of doc.regions) {
    const loop = outlineLoop(region.outline, heightM, scale);
    loops.set(region.id, loop);
    group.add(loop);
  }
  return {
    group,
    highlight(id) {
      for (const [key, loop] of loops) {
        const style = key === id ? SELECTED : IDLE;
        loop.material.color.set(style.color);
        loop.material.opacity = style.opacity;
        loop.renderOrder = key === id ? 10 : 0;
      }
    },
    dispose() {
      for (const loop of loops.values()) {
        loop.geometry.dispose();
        loop.material.dispose();
      }
    },
  };
}
