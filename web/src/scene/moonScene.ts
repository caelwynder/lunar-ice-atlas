import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Pole } from '../geo/polarStereo';
import { type Cap, makeCap } from './caps';
import { makeStars } from './stars';

export type RenderId = 'color' | 'grid' | 'topo';
export const RENDER_IDS: readonly RenderId[] = ['color', 'grid', 'topo'];
export const RENDER_LABEL: Record<RenderId, string> = { color: 'Colour', grid: 'Grid', topo: 'Topography' };
export const MODEL_URL: Record<RenderId, string> = {
  color: 'models/color.glb',
  grid: 'models/grid.glb',
  topo: 'models/topo.glb',
};

const CAP_DEG = 12;
const STAR_COUNT = 2600;
const ROTATION_PER_FRAME = 0.0008;
const CLICK_SLOP_PX = 4;
const STILL_CAP_OPACITY = 0.47;
const CAMERA_START = new THREE.Vector3(0, 1.4, 4.0);

export interface RendererLike {
  setPixelRatio(ratio: number): void;
  getPixelRatio(): number;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
  setAnimationLoop(callback: ((time: number) => void) | null): void;
  dispose(): void;
}
export interface SceneDeps {
  createRenderer(canvas: HTMLCanvasElement): RendererLike;
  loadModel(url: string): Promise<THREE.Object3D>;
}
export interface SceneOptions {
  reducedMotion: boolean;
  onStatus(message: string | null): void;
  onPole(pole: Pole): void;
}
export interface MoonScene {
  readonly moon: THREE.Group;
  readonly caps: Record<Pole, Cap>;
  setRender(id: RenderId): Promise<void>;
  setRunning(running: boolean): void;
  tick(timeSec: number): void;
  resize(): void;
  dispose(): void;
}

const defaultDeps: SceneDeps = {
  createRenderer(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    return renderer;
  },
  async loadModel(url) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    return (await loader.loadAsync(url)).scene;
  },
};

function normalise(root: THREE.Object3D): THREE.Group {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  root.position.sub(box.getCenter(new THREE.Vector3()));
  const wrap = new THREE.Group();
  wrap.add(root);
  wrap.scale.setScalar(2 / Math.max(size.x, size.y, size.z, 1e-9));
  return wrap;
}

function buildStage(canvas: HTMLCanvasElement) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  camera.position.copy(CAMERA_START);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.minDistance = 1.6;
  controls.maxDistance = 8;
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.set(-4, 2, 5);
  scene.add(sun);
  const stars = makeStars(STAR_COUNT, Math.random);
  const moon = new THREE.Group();
  const caps: Record<Pole, Cap> = { north: makeCap('north', CAP_DEG), south: makeCap('south', CAP_DEG) };
  scene.add(stars.points, moon, caps.north.group, caps.south.group);
  return { scene, camera, controls, stars, moon, caps };
}

function capPicker(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  caps: Record<Pole, Cap>,
  onPole: (p: Pole) => void,
) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const targets = [caps.north.hit, caps.south.hit];
  const hit = (ev: PointerEvent): Pole | null => {
    const r = canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const pole = ray.intersectObjects(targets)[0]?.object.userData['pole'] as Pole | undefined;
    return pole ?? null;
  };
  let downAt: [number, number] | null = null;
  const move = (ev: PointerEvent): void => void (canvas.style.cursor = hit(ev) ? 'pointer' : 'grab');
  const down = (ev: PointerEvent): void => void (downAt = [ev.clientX, ev.clientY]);
  const up = (ev: PointerEvent): void => {
    if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > CLICK_SLOP_PX) return;
    const pole = hit(ev);
    if (pole) onPole(pole);
  };
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointerup', up);
  return (): void => {
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointerup', up);
  };
}

export function createMoonScene(
  canvas: HTMLCanvasElement,
  opts: SceneOptions,
  deps: SceneDeps = defaultDeps,
): MoonScene {
  const renderer = deps.createRenderer(canvas);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const { scene, camera, controls, stars, moon, caps } = buildStage(canvas);
  const models = new Map<RenderId, Promise<THREE.Group>>();
  let wanted: RenderId | null = null;

  const model = (id: RenderId): Promise<THREE.Group> => {
    const cached = models.get(id) ?? deps.loadModel(`${import.meta.env.BASE_URL}${MODEL_URL[id]}`).then(normalise);
    models.set(id, cached);
    return cached;
  };

  async function setRender(id: RenderId): Promise<void> {
    wanted = id;
    opts.onStatus('Loading Moon…');
    try {
      const obj = await model(id);
      if (wanted !== id) return;
      moon.clear();
      moon.add(obj);
      opts.onStatus(null);
    } catch (err) {
      models.delete(id);
      opts.onStatus(`Could not load the ${RENDER_LABEL[id]} render. Try another render or reload the page.`);
      throw err;
    }
  }

  function tick(timeSec: number): void {
    const t = opts.reducedMotion ? 0 : timeSec;
    stars.uniforms.uTime.value = t;
    const opacity = opts.reducedMotion ? STILL_CAP_OPACITY : 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2));
    for (const cap of Object.values(caps)) (cap.hit.material as THREE.MeshBasicMaterial).opacity = opacity;
    if (!opts.reducedMotion) moon.rotation.y += ROTATION_PER_FRAME;
    controls.update();
    renderer.render(scene, camera);
  }

  function resize(): void {
    const host = canvas.parentElement;
    const w = Math.max(host?.clientWidth ?? window.innerWidth, 1);
    const h = Math.max(host?.clientHeight ?? window.innerHeight, 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.setViewOffset(w * 2, h * 2, 0, 0, w, h);
    stars.uniforms.uScale.value = renderer.getPixelRatio();
  }

  const unpick = capPicker(canvas, camera, caps, opts.onPole);
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  if (canvas.parentElement) observer?.observe(canvas.parentElement);
  resize();
  const setRunning = (running: boolean): void =>
    renderer.setAnimationLoop(running ? (ms: number): void => tick(ms / 1000) : null);

  return {
    moon,
    caps,
    setRender,
    setRunning,
    tick,
    resize,
    dispose(): void {
      setRunning(false);
      unpick();
      observer?.disconnect();
      controls.dispose();
      renderer.dispose();
    },
  };
}
