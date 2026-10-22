import * as THREE from 'three';

export interface StarUniforms {
  [uniform: string]: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
  uScale: THREE.IUniform<number>;
}

const R_MIN = 40;
const R_SPREAD = 20;

const VERTEX = `
  attribute float aBright; attribute float aPhase; attribute float aSpeed;
  uniform float uTime; uniform float uScale;
  varying float vAlpha;
  void main() {
    vAlpha = aBright * (0.7 + 0.3 * sin(uTime * aSpeed + aPhase));
    gl_PointSize = (1.8 + aBright * 1.4) * uScale;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const FRAGMENT = `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(0.9, 0.94, 1.0, smoothstep(0.5, 0.0, d) * vAlpha);
  }`;

function unitVector(rand: () => number): [number, number, number] {
  const z = rand() * 2 - 1;
  const a = rand() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  return [s * Math.cos(a), s * Math.sin(a), z];
}

export function makeStars(count: number, rand: () => number): { points: THREE.Points; uniforms: StarUniforms } {
  const pos = new Float32Array(count * 3);
  const bright = new Float32Array(count);
  const phase = new Float32Array(count);
  const speed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = R_MIN + rand() * R_SPREAD;
    pos.set(
      unitVector(rand).map((v) => v * r),
      i * 3,
    );
    bright[i] = 0.6 + rand() ** 3 * 0.4;
    phase[i] = rand() * Math.PI * 2;
    speed[i] = 0.3 + rand() * 0.9;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
  const uniforms: StarUniforms = { uTime: { value: 0 }, uScale: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  return { points: new THREE.Points(geometry, material), uniforms };
}
