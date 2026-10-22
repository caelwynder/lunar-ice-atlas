import * as THREE from 'three';
import type { Pole } from '../geo/polarStereo';

const CAP_RADIUS = 1.012;
const RING_RADIUS = 1.014;
const CAP_COLOR = 0x7fd4ff;
const RING_COLOR = 0x9fe0ff;
const RING_SEGMENTS = 128;

export interface Cap {
  group: THREE.Group;
  hit: THREE.Mesh;
}

function ring(theta: number, sign: number): THREE.Line {
  const y = Math.cos(theta) * RING_RADIUS * sign;
  const r = Math.sin(theta) * RING_RADIUS;
  const pts = Array.from({ length: RING_SEGMENTS + 1 }, (_, i) => {
    const a = (i / RING_SEGMENTS) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  });
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: RING_COLOR }),
  );
}

export function makeCap(pole: Pole, capDeg: number): Cap {
  const theta = THREE.MathUtils.degToRad(capDeg);
  const start = pole === 'north' ? 0 : Math.PI - theta;
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(CAP_RADIUS, 64, 8, 0, Math.PI * 2, start, theta),
    new THREE.MeshBasicMaterial({
      color: CAP_COLOR,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  hit.userData['pole'] = pole;
  const group = new THREE.Group();
  group.add(hit, ring(theta, pole === 'north' ? 1 : -1));
  return { group, hit };
}
