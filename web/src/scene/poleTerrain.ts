import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { MapsMeta, Px } from '../data/mapsSchema';

export const RELIEF_EXAGGERATION = 4;
const LINE_LIFT_M = 300;
const LINE_COLOR = 0xffffff;
const ACTIVE_COLOR = 0xffc46b;
const CAMERA_START = new THREE.Vector3(0, 0.75, 0.85);

export interface TerrainOptions {
  meta: MapsMeta;
  heights: Int16Array;
  outlines: Px[][];
  reducedMotion: boolean;
}
export interface TerrainView {
  setTexture(url: string): Promise<void>;
  setActive(index: number | null): void;
  project(px: Px): { x: number; y: number } | null;
  onFrame(cb: () => void): void;
  setRunning(running: boolean): void;
  resetView(): void;
  dispose(): void;
}

export function buildTerrainGeometry(heights: Int16Array, n: number, scale: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 1, n - 1, n - 1);
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setY(i, (heights[i] ?? 0) * scale);
  g.computeVertexNormals();
  return g;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function sampleHeight(heights: Int16Array, n: number, u: number, v: number): number {
  const fx = clamp01(u) * (n - 1);
  const fy = clamp01(v) * (n - 1);
  const c0 = Math.min(Math.floor(fx), n - 2);
  const r0 = Math.min(Math.floor(fy), n - 2);
  const tx = fx - c0;
  const ty = fy - r0;
  const h = (r: number, c: number): number => heights[r * n + c] ?? 0;
  const top = h(r0, c0) * (1 - tx) + h(r0, c0 + 1) * tx;
  const bottom = h(r0 + 1, c0) * (1 - tx) + h(r0 + 1, c0 + 1) * tx;
  return top * (1 - ty) + bottom * ty;
}

export function mapToWorld(
  [px, py]: Px,
  size: number,
  heights: Int16Array,
  n: number,
  scale: number,
  liftM: number,
): THREE.Vector3 {
  const u = px / size;
  const v = py / size;
  return new THREE.Vector3(u - 0.5, (sampleHeight(heights, n, u, v) + liftM) * scale, v - 0.5);
}

const verticalScale = (meta: MapsMeta): number => RELIEF_EXAGGERATION / (meta.size * meta.kmPerPx * 1000);

function buildOutlines(opts: TerrainOptions, scale: number): THREE.LineLoop[] {
  const { meta, heights } = opts;
  return opts.outlines.map((pts) => {
    const points = pts.map((p) => mapToWorld(p, meta.size, heights, meta.height.size, scale, LINE_LIFT_M));
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.LineLoop(geom, new THREE.LineBasicMaterial({ color: LINE_COLOR }));
  });
}

function buildStage(canvas: HTMLCanvasElement, opts: TerrainOptions) {
  const scale = verticalScale(opts.meta);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(-1, 0.6, -0.4);
  scene.add(sun);
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const ground = new THREE.Mesh(buildTerrainGeometry(opts.heights, opts.meta.height.size, scale), material);
  const outlines = buildOutlines(opts, scale);
  scene.add(ground, ...outlines);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.005, 20);
  camera.position.copy(CAMERA_START);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !opts.reducedMotion;
  controls.screenSpacePanning = false;
  controls.minDistance = 0.08;
  controls.maxDistance = 2.2;
  controls.maxPolarAngle = Math.PI * 0.47;
  return { scene, camera, controls, ground, material, outlines, scale };
}

export function createPoleTerrain(canvas: HTMLCanvasElement, opts: TerrainOptions): TerrainView {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const stage = buildStage(canvas, opts);
  const { scene, camera, controls, material, outlines } = stage;
  const loader = new THREE.TextureLoader();
  const listeners: (() => void)[] = [];
  const tmp = new THREE.Vector3();
  let wantedUrl = '';

  const resize = (): void => {
    const w = Math.max(canvas.clientWidth, 1);
    const h = Math.max(canvas.clientHeight, 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const frame = (): void => {
    controls.update();
    renderer.render(scene, camera);
    for (const cb of listeners) cb();
  };
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  observer?.observe(canvas);
  resize();

  return {
    async setTexture(url) {
      wantedUrl = url;
      const tex = await loader.loadAsync(url);
      if (wantedUrl !== url) return tex.dispose();
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      material.map?.dispose();
      material.map = tex;
      material.needsUpdate = true;
    },
    setActive(index) {
      outlines.forEach((line, i) =>
        (line.material as THREE.LineBasicMaterial).color.set(i === index ? ACTIVE_COLOR : LINE_COLOR),
      );
    },
    project(px) {
      tmp.copy(mapToWorld(px, opts.meta.size, opts.heights, opts.meta.height.size, stage.scale, LINE_LIFT_M * 2));
      tmp.project(camera);
      if (tmp.z > 1) return null;
      return { x: (tmp.x + 1) / 2, y: (1 - tmp.y) / 2 };
    },
    onFrame(cb) {
      listeners.push(cb);
    },
    setRunning(running) {
      renderer.setAnimationLoop(running ? frame : null);
    },
    resetView() {
      camera.position.copy(CAMERA_START);
      controls.target.set(0, 0, 0);
      controls.update();
    },
    dispose() {
      renderer.setAnimationLoop(null);
      observer?.disconnect();
      controls.dispose();
      stage.ground.geometry.dispose();
      material.map?.dispose();
      material.dispose();
      for (const l of outlines) {
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      }
      renderer.dispose();
    },
  };
}
