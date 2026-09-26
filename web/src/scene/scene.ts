import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { LoadedGlobe, LoadedPole } from '../data/load';
import type { RegionsDoc } from '../data/regionsSchema';
import { latLonToVec3 } from '../geo/sphere';
import { buildCapGeometry } from './capGeometry';
import { buildGlobeGeometry, equirectHeightAt, heightScale } from './globeGeometry';
import { type PickResult, lookupValues, raySurface } from './picking';
import { type RegionsLayer, createRegionsLayer } from './regionsLayer';

const GLOBE_LAT_LIMIT = 80.3;
const CAP_OVERLAP_DEG = 0.3;
const FLY_MS = 1200;
const SMALL_SCREEN_PX = 900;

export interface AtlasScene {
  setLayer(layerId: string | null): void;
  setTestOutline(on: boolean): void;
  setOpacity(v: number): void;
  flyTo(lat: number, lon: number, altitude: number): void;
  pick(ndcX: number, ndcY: number): PickResult | null;
  addRegionOutlines(doc: RegionsDoc): void;
  highlightRegion(id: string | null): void;
  dispose(): void;
}

interface Cap {
  pole: LoadedPole;
  base: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  overlay: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  outline: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
}

type Textures = ReturnType<typeof textureCache>;
type Flight = (now: number) => boolean;

function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor('#0b0b0c');
  return renderer;
}

function createCamera(canvas: HTMLCanvasElement): { camera: THREE.PerspectiveCamera; controls: OrbitControls } {
  const camera = new THREE.PerspectiveCamera(35, 1, 0.001, 100);
  camera.position.set(0, 0.6, 3.2);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.minDistance = 1.03;
  controls.maxDistance = 8;
  controls.enablePan = false;
  return { camera, controls };
}

function addLights(scene: THREE.Scene): void {
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(5, 2, 3);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(0, -5, 2);
  scene.add(sun, fill);
}

function withEdgeFade<M extends THREE.Material>(material: M): M {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float edgeFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = edgeFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vFade;');
  };
  return material;
}

function textureCache(): { get(url: string): THREE.Texture; dispose(): void } {
  const loader = new THREE.TextureLoader();
  const cache = new Map<string, THREE.Texture>();
  return {
    get(url) {
      const hit = cache.get(url);
      if (hit) return hit;
      const tex = loader.load(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      cache.set(url, tex);
      return tex;
    },
    dispose: () => cache.forEach((t) => t.dispose()),
  };
}

function createGlobe(globe: LoadedGlobe, exaggeration: number, texture: THREE.Texture): THREE.Mesh {
  const geometry = buildGlobeGeometry({
    latLimitDeg: GLOBE_LAT_LIMIT,
    lonSegments: 720,
    latSegments: 360,
    heightAt: equirectHeightAt(globe.heights),
    exaggeration,
  });
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 }));
}

const overlayMaterial = (offset: number, opacity: number): THREE.MeshBasicMaterial =>
  withEdgeFade(
    new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: offset,
      polygonOffsetUnits: offset,
      opacity,
    }),
  );

function createCap(pole: LoadedPole, exaggeration: number, textures: Textures): Cap {
  const geometry = buildCapGeometry(pole.meta, pole.heights, exaggeration, CAP_OVERLAP_DEG);
  const baseMaterial = new THREE.MeshStandardMaterial({
    map: textures.get(pole.url(pole.meta.base.file)),
    color: 0xb9b7b0,
    roughness: 1,
    metalness: 0,
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const base = new THREE.Mesh(geometry, withEdgeFade(baseMaterial));
  const overlay = new THREE.Mesh(geometry, overlayMaterial(-2, 0.85));
  const outline = new THREE.Mesh(geometry, overlayMaterial(-3, 1));
  const testLayer = pole.meta.layers.find((l) => l.id === 'test');
  outline.material.map = testLayer ? textures.get(pole.url(testLayer.texture)) : null;
  [base, overlay, outline].forEach((m, i) => (m.renderOrder = i + 1));
  overlay.visible = false;
  outline.visible = false;
  return { pole, base, overlay, outline };
}

function createFlight(camera: THREE.PerspectiveCamera, lat: number, lon: number, altitude: number): Flight | null {
  const end = new THREE.Vector3(...latLonToVec3(lat, lon, 1 + altitude));
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    camera.position.copy(end);
    return null;
  }
  const startDir = camera.position.clone().normalize();
  const startLen = camera.position.length();
  const turn = new THREE.Quaternion().setFromUnitVectors(startDir, end.clone().normalize());
  const t0 = performance.now();
  return (now) => {
    const k = Math.min(1, (now - t0) / FLY_MS);
    const eased = k * k * (3 - 2 * k);
    const dist = THREE.MathUtils.lerp(startLen, end.length(), eased);
    camera.position.copy(startDir).applyQuaternion(new THREE.Quaternion().slerp(turn, eased)).multiplyScalar(dist);
    return k < 1;
  };
}

function createPicker(camera: THREE.PerspectiveCamera, globe: LoadedGlobe, caps: Cap[], scale: number) {
  const raycaster = new THREE.Raycaster();
  const globeHeight = (lat: number, lon: number): number | null =>
    globe.heights.bilinear((lon + 180) / 360, (90 - lat) / 180, true);
  const capFor = (lat: number): Cap | undefined => caps.find((c) => c.pole.meta.crs.lat0 < 0 === lat < 0);
  const surfaceHeight = (lat: number, lon: number): number => {
    const cap = capFor(lat);
    return (cap ? lookupValues(cap.pole, lat, lon).elevationM : null) ?? globeHeight(lat, lon) ?? 0;
  };
  const pick = (ndcX: number, ndcY: number): PickResult | null => {
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const { origin: o, direction: d } = raycaster.ray;
    const hit = raySurface([o.x, o.y, o.z], [d.x, d.y, d.z], surfaceHeight, scale);
    if (!hit) return null;
    const cap = capFor(hit.lat);
    const onCap = cap ? lookupValues(cap.pole, hit.lat, hit.lon) : null;
    if (!cap || !onCap?.uv) {
      return { lat: hit.lat, lon: hit.lon, elevationM: globeHeight(hit.lat, hit.lon), pole: null, values: {} };
    }
    const elevationM = onCap.elevationM ?? globeHeight(hit.lat, hit.lon);
    return { lat: hit.lat, lon: hit.lon, elevationM, pole: cap.pole.meta.pole, values: onCap.values };
  };
  return { pick, surfaceHeight };
}

function watchSize(canvas: HTMLCanvasElement, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
  const target = canvas.parentElement ?? canvas;
  const resize = (): void => {
    renderer.setSize(target.clientWidth, target.clientHeight, false);
    camera.aspect = target.clientWidth / Math.max(1, target.clientHeight);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(target);
  resize();
  return observer;
}

export function createAtlasScene(
  canvas: HTMLCanvasElement,
  globe: LoadedGlobe,
  poles: LoadedPole[],
  opts: { exaggeration: number },
): AtlasScene {
  const renderer = createRenderer(canvas);
  const { camera, controls } = createCamera(canvas);
  const scene = new THREE.Scene();
  const textures = textureCache();
  const scale = heightScale(opts.exaggeration);
  addLights(scene);

  const globeTexture = textures.get(
    globe.url(innerWidth < SMALL_SCREEN_PX ? globe.meta.color.lo : globe.meta.color.hi),
  );
  globeTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const globeMesh = createGlobe(globe, opts.exaggeration, globeTexture);
  const caps = poles.map((p) => createCap(p, opts.exaggeration, textures));
  scene.add(globeMesh, ...caps.flatMap((c) => [c.base, c.overlay, c.outline]));

  const { pick, surfaceHeight } = createPicker(camera, globe, caps, scale);
  const observer = watchSize(canvas, renderer, camera);
  let regions: RegionsLayer | null = null;
  let flight: Flight | null = null;

  renderer.setAnimationLoop((now) => {
    if (flight && !flight(now)) flight = null;
    controls.enabled = flight === null;
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    setLayer(layerId) {
      for (const cap of caps) {
        const layer = cap.pole.meta.layers.find((l) => l.id === layerId);
        cap.overlay.visible = layer !== undefined;
        cap.overlay.material.map = layer ? textures.get(cap.pole.url(layer.texture)) : null;
        cap.overlay.material.needsUpdate = true;
      }
    },
    setTestOutline: (on) => caps.forEach((c) => (c.outline.visible = on && c.outline.material.map !== null)),
    setOpacity: (v) => caps.forEach((c) => (c.overlay.material.opacity = v)),
    flyTo: (lat, lon, altitude) => (flight = createFlight(camera, lat, lon, altitude)),
    pick,
    addRegionOutlines(doc) {
      regions?.dispose();
      regions = createRegionsLayer(doc, surfaceHeight, scale);
      scene.add(regions.group);
    },
    highlightRegion: (id) => regions?.highlight(id),
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      regions?.dispose();
      globeMesh.geometry.dispose();
      (globeMesh.material as THREE.Material).dispose();
      caps.forEach((c) => {
        c.base.geometry.dispose();
        [c.base, c.overlay, c.outline].forEach((m) => m.material.dispose());
      });
      textures.dispose();
      renderer.dispose();
    },
  };
}
