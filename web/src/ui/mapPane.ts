import { type MapStyle, type MapTheme, type MapsMeta, type MapsRegion, type Px, loadHeights } from '../data/mapsSchema';
import type { TerrainOptions, TerrainView } from '../scene/poleTerrain';
import { el } from './dom';
import { type View, attachPanZoom } from './panZoom';

export type MapMode = '2d' | '3d';
export type TerrainLoader = (
  canvas: HTMLCanvasElement,
  opts: Omit<TerrainOptions, 'heights'> & { base: string },
) => Promise<TerrainView>;

export interface MapPaneOptions {
  base: string;
  meta: MapsMeta;
  regions: MapsRegion[];
  onHover(index: number | null): void;
  loadTerrain?: TerrainLoader;
}
export interface MapPane {
  pane: HTMLElement;
  img: HTMLImageElement;
  polygons: SVGPolygonElement[];
  badges: HTMLElement[];
  setImage(style: MapStyle, theme: MapTheme, alt: string): void;
  setMode(mode: MapMode): Promise<boolean>;
  setActive(index: number | null): void;
  dispose(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const SCALE_STEPS_KM = [200, 100, 50, 20, 10, 5, 2, 1];
const SCALE_MAX_FRAC = 0.3;
const HD_THRESHOLD = 1.15;
const ZOOM_STEP = 1.6;
const HINT: Record<MapMode, string> = {
  '2d': 'Scroll or pinch to zoom · drag to move',
  '3d': 'Drag to orbit · right-drag to move · scroll to zoom · relief exaggerated 4×',
};

export function scaleFor(extentKm: number, zoom: number): { km: number; frac: number } {
  const visibleKm = extentKm / zoom;
  const km = SCALE_STEPS_KM.find((k) => k / visibleKm <= SCALE_MAX_FRAC) ?? 1;
  return { km, frac: km / visibleKm };
}

const defaultLoadTerrain: TerrainLoader = async (canvas, { base, ...opts }) => {
  const [{ createPoleTerrain }, heights] = await Promise.all([
    import('../scene/poleTerrain'),
    loadHeights(base, opts.meta),
  ]);
  return createPoleTerrain(canvas, { ...opts, heights });
};

const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const at = (meta: MapsMeta, [x, y]: Px): string => `left:${(x / meta.size) * 100}%;top:${(y / meta.size) * 100}%`;

const poleName = (meta: MapsMeta): string => (meta.pole === 'south' ? 'South Pole' : 'North Pole');

function overlay(meta: MapsMeta, regions: MapsRegion[]): { svgEl: SVGSVGElement; polygons: SVGPolygonElement[] } {
  const svgEl = document.createElementNS(SVG_NS, 'svg');
  svgEl.setAttribute('class', 'regions');
  svgEl.setAttribute('viewBox', `0 0 ${meta.size} ${meta.size}`);
  svgEl.setAttribute('aria-hidden', 'true');
  const polygons = regions.map((r) => {
    const poly = document.createElementNS(SVG_NS, 'polygon');
    poly.setAttribute('points', r.px.map(([x, y]) => `${x},${y}`).join(' '));
    svgEl.append(poly);
    return poly;
  });
  return { svgEl, polygons };
}

function stage2d(meta: MapsMeta, regions: MapsRegion[]) {
  const img = el('img', { class: 'basemap', width: String(meta.size), height: String(meta.size), decoding: 'async' });
  const { svgEl, polygons } = overlay(meta, regions);
  const badges = regions.map((r, i) =>
    el(
      'button',
      { type: 'button', class: 'badge', style: at(meta, r.centroidPx), 'aria-label': `${i + 1}. ${r.name}` },
      String(i + 1),
    ),
  );
  const poleTag = el('div', { class: 'pole-tag', style: at(meta, meta.polePx) }, el('i', {}), poleName(meta));
  const stage = el('div', { class: 'map-stage' }, img, svgEl, ...badges, poleTag);
  return { stage, img, polygons, badges };
}

function zoomButtons(onIn: () => void, onOut: () => void, onReset: () => void) {
  const button = (label: string, text: string, fn: () => void): HTMLButtonElement => {
    const b = el('button', { type: 'button', 'aria-label': label, title: label }, text);
    b.addEventListener('click', fn);
    return b;
  };
  const zoomIn = button('Zoom in', '+', onIn);
  const zoomOut = button('Zoom out', '−', onOut);
  const box = el('div', { class: 'zoom-controls' }, zoomIn, zoomOut, button('Reset view', '⟲', onReset));
  return { box, zoomOnly: [zoomIn, zoomOut] };
}

function terrainLabels(regions: MapsRegion[], onHover: (i: number | null) => void): HTMLElement[] {
  return regions.map((_, i) => {
    const b = el('span', { class: 'tbadge' }, String(i + 1));
    b.addEventListener('mouseenter', () => onHover(i));
    b.addEventListener('mouseleave', () => onHover(null));
    return b;
  });
}

export function createMapPane(opts: MapPaneOptions): MapPane {
  const { meta, regions, base } = opts;
  const loadTerrain = opts.loadTerrain ?? defaultLoadTerrain;
  const extentKm = meta.size * meta.kmPerPx;
  const { stage, img, polygons, badges } = stage2d(meta, regions);
  const scaleBar = el('div', { class: 'scale-bar' });
  const scaleLabel = el('span', {});
  const scale = el('div', { class: 'scale' }, scaleBar, scaleLabel);
  const error = el('p', { class: 'map-error', role: 'alert' }, 'Could not load this map. Try reloading.');
  error.hidden = true;
  const status = el('p', { class: 'map-status', role: 'status' });
  status.hidden = true;
  const canvas = el('canvas', { class: 'terrain', 'aria-label': `3D terrain of the ${poleName(meta)}` });
  canvas.hidden = true;
  const labels = el('div', { class: 'terrain-labels', 'aria-hidden': 'true' });
  labels.hidden = true;
  const hint = el('p', { class: 'map-hint' }, HINT['2d']);
  const pane = el(
    'div',
    {
      class: 'map-pane',
      tabindex: '0',
      role: 'group',
      'aria-label': 'Map. Use + and − to zoom, arrow keys to move, 0 to reset.',
    },
    stage,
    canvas,
    labels,
    scale,
    hint,
    error,
    status,
  );
  img.addEventListener('error', () => (error.hidden = false));
  img.addEventListener('load', () => (error.hidden = true));

  const hdReady = new Set<string>();
  const tBadges = terrainLabels(regions, opts.onHover);
  labels.append(...tBadges);
  let file = '';
  let mode: MapMode = '2d';
  let wanted: MapMode = '2d';
  let terrain: Promise<TerrainView> | null = null;
  const url = (hd: boolean): string => `${base}data/maps/${meta.pole}/${file}${hd ? '@2x' : ''}.webp`;
  const wantsHd = (zoom: number): boolean =>
    zoom * pane.clientWidth * (window.devicePixelRatio || 1) > meta.size * HD_THRESHOLD;
  const setSrc = (src: string): void => {
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
  };

  function showImage(zoom: number): void {
    const lo = url(false);
    const hi = url(true);
    if (!wantsHd(zoom)) return setSrc(lo);
    if (hdReady.has(hi)) return setSrc(hi);
    if (img.getAttribute('src') !== hi) setSrc(lo);
    const pre = new Image();
    pre.addEventListener('load', () => {
      hdReady.add(hi);
      if (url(true) === hi && wantsHd(pz.view().zoom)) setSrc(hi);
    });
    pre.src = hi;
  }

  function applyView(v: View): void {
    stage.style.transform = `translate(${v.x * 100}%, ${v.y * 100}%) scale(${v.zoom})`;
    pane.style.setProperty('--zoom', String(v.zoom));
    pane.classList.toggle('is-zoomed', v.zoom > 1);
    const s = scaleFor(extentKm, v.zoom);
    scaleBar.style.width = `${s.frac * 100}%`;
    scaleLabel.textContent = `${s.km} km`;
    if (file) showImage(v.zoom);
  }
  const pz = attachPanZoom(pane, (v) => {
    if (mode === '2d') applyView(v);
  });
  const controls = zoomButtons(
    () => pz.zoomBy(ZOOM_STEP),
    () => pz.zoomBy(1 / ZOOM_STEP),
    () => (mode === '2d' ? pz.reset() : void terrain?.then((t) => t.resetView())),
  );
  pane.append(controls.box);
  applyView(pz.view());

  function placeLabels(t: TerrainView): void {
    regions.forEach((r, i) => {
      const badge = tBadges[i];
      const p = t.project(r.centroidPx);
      if (!badge) return;
      badge.hidden = !p;
      if (p) badge.style.cssText = `left:${p.x * 100}%;top:${p.y * 100}%`;
    });
  }

  async function startTerrain(): Promise<TerrainView> {
    const outlines = regions.map((r) => r.px);
    const t = await loadTerrain(canvas, { base, meta, outlines, reducedMotion: prefersReducedMotion() });
    t.onFrame(() => placeLabels(t));
    return t;
  }

  function show(next: MapMode): void {
    mode = next;
    const is3d = next === '3d';
    stage.hidden = is3d;
    scale.hidden = is3d;
    canvas.hidden = !is3d;
    labels.hidden = !is3d;
    pane.classList.toggle('is-3d', is3d);
    pz.setEnabled(!is3d);
    hint.textContent = HINT[next];
    for (const b of controls.zoomOnly) b.hidden = is3d;
  }

  async function setMode(next: MapMode): Promise<boolean> {
    wanted = next;
    if (next === '2d') {
      show('2d');
      status.hidden = true;
      applyView(pz.view());
      void terrain?.then((t) => t.setRunning(false)).catch(() => undefined);
      return true;
    }
    status.textContent = 'Loading 3D terrain…';
    status.hidden = false;
    try {
      terrain ??= startTerrain();
      const t = await terrain;
      await t.setTexture(url(false));
      if (wanted !== '3d') return true;
      show('3d');
      t.setRunning(true);
      status.hidden = true;
      return true;
    } catch {
      terrain = null;
      if (wanted === '3d') show('2d');
      status.textContent = 'The 3D view could not load on this device.';
      return false;
    }
  }

  return {
    pane,
    img,
    polygons,
    badges,
    setImage(style, theme, alt) {
      file = `${style}-${theme}`;
      img.alt = alt;
      pane.dataset['theme'] = theme;
      showImage(pz.view().zoom);
      if (mode === '3d') void terrain?.then((t) => t.setTexture(url(false))).catch(() => undefined);
    },
    setMode,
    setActive(index) {
      tBadges.forEach((b, i) => b.classList.toggle('is-active', i === index));
      void terrain?.then((t) => t.setActive(index)).catch(() => undefined);
    },
    dispose() {
      pz.dispose();
      void terrain?.then((t) => t.dispose()).catch(() => undefined);
    },
  };
}
