// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseMapsMeta } from '../data/mapsSchema';
import { parseRegions } from '../data/regionsSchema';
import type { Pole } from '../geo/polarStereo';
import type { TerrainView } from '../scene/poleTerrain';
import type { TerrainLoader } from './mapPane';
import { mountPoleMap } from './poleMap';

const json = (path: string): unknown => JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8'));
const REGIONS = parseRegions(json('public/data/regions.json'));
const META = {
  south: parseMapsMeta(json('public/data/maps/south/meta.json')),
  north: parseMapsMeta(json('public/data/maps/north/meta.json')),
};

let root: HTMLElement;
beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<main id="map-view"></main>';
  root = document.getElementById('map-view') as HTMLElement;
});

const fakeTerrain = (): TerrainView => ({
  setTexture: vi.fn(() => Promise.resolve()),
  setActive: vi.fn(),
  project: () => ({ x: 0.5, y: 0.5 }),
  onFrame: vi.fn(),
  setRunning: vi.fn(),
  resetView: vi.fn(),
  dispose: vi.fn(),
});
const mount = (pole: Pole, onBack = vi.fn(), loadTerrain?: TerrainLoader) =>
  mountPoleMap(root, { base: '/', pole, meta: META[pole], regions: REGIONS, onBack, loadTerrain });
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const checked = (name: string): string =>
  root.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.closest('label')?.textContent ?? '';
const src = (): string => root.querySelector<HTMLImageElement>('.basemap')?.getAttribute('src') ?? '';
const pick = (label: string): void => {
  const input = [...root.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
    (i) => i.closest('label')?.textContent?.trim() === label,
  );
  input?.click();
};

describe('mountPoleMap (south)', () => {
  it('draws nine numbered badges and outlines over the bands basemap', () => {
    mount('south');
    expect(root.querySelectorAll('.badge')).toHaveLength(9);
    expect(root.querySelectorAll('svg.regions polygon')).toHaveLength(9);
    expect(src()).toBe('/data/maps/south/b-moon.webp');
  });

  it('ranks regions by predicted prospectivity', () => {
    mount('south');
    const first = root.querySelector('.region-list tbody tr th');
    expect(first?.textContent).toContain('Slater Plain');
  });

  it('switches style and theme, with a legend that matches the style', () => {
    mount('south');
    expect([...root.querySelectorAll('.legend .swatch-label')].map((s) => s.textContent)).toEqual([
      '0.4 – 0.6',
      '0.6 – 0.8',
      '0.8 – 1',
    ]);
    pick('Hotspots');
    expect(src()).toBe('/data/maps/south/d-moon.webp');
    expect(root.querySelector('.legend')?.textContent).toContain(`≥ ${META.south.hotspot.toFixed(2)}`);
    pick('Dark');
    expect(src()).toBe('/data/maps/south/d-dark.webp');
    pick('Glow');
    expect(root.querySelector('.legend .ramp')).not.toBeNull();
  });

  it('labels the band legend from the meta levels', () => {
    mountPoleMap(root, {
      base: '/',
      pole: 'south',
      meta: { ...META.south, levels: [0.3, 0.5, 0.7] },
      regions: REGIONS,
      onBack: vi.fn(),
    });
    expect([...root.querySelectorAll('.legend .swatch-label')].map((s) => s.textContent)).toEqual([
      '0.3 – 0.5',
      '0.5 – 0.7',
      '0.7 – 1',
    ]);
    expect(root.querySelector('.legend .muted')?.textContent).toContain('Below 0.3');
  });

  it('says so when the basemap fails to load', () => {
    mount('south');
    const msg = root.querySelector<HTMLElement>('.map-error');
    expect(msg?.hidden).toBe(true);
    root.querySelector('.basemap')?.dispatchEvent(new Event('error'));
    expect(msg?.hidden).toBe(false);
    expect(msg?.textContent).toContain('Could not load');
    root.querySelector('.basemap')?.dispatchEvent(new Event('load'));
    expect(msg?.hidden).toBe(true);
  });

  it('remembers the chosen style and theme across visits', () => {
    const first = mount('south');
    pick('Hotspots');
    pick('Dark');
    first.dispose();
    expect(root.childElementCount).toBe(0);
    mount('north');
    expect(src()).toBe('/data/maps/north/d-dark.webp');
  });

  it('highlights the matching outline when a list row is hovered', () => {
    mount('south');
    const rows = root.querySelectorAll('.region-list tbody tr');
    rows[1]?.dispatchEvent(new MouseEvent('mouseenter'));
    const outlines = root.querySelectorAll('svg.regions polygon');
    expect(outlines[1]?.classList.contains('is-active')).toBe(true);
    expect(outlines[0]?.classList.contains('is-active')).toBe(false);
  });

  it('calls onBack from the back button', () => {
    const onBack = vi.fn();
    mount('south', onBack);
    root.querySelector<HTMLButtonElement>('.back')?.click();
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('mountPoleMap caveats', () => {
  it.each(['south', 'north'] as const)('quotes both model-card caveats on the %s map', (pole) => {
    mount(pole);
    const note = root.querySelector('.note')?.textContent ?? '';
    expect(note).toContain('a knowledge-driven model, not measured ice');
    expect(note).toContain('operational decision-making regarding lunar landing sites');
  });
});

describe('mountPoleMap (north)', () => {
  it('shows pole statistics instead of regions', () => {
    mount('north');
    expect(root.querySelectorAll('.badge')).toHaveLength(0);
    expect(root.querySelector('h1')?.textContent).toBe('Predicted ice prospectivity');
    expect(root.textContent).toContain(`${Math.round(META.north.stats.fracGe04 * 100)}%`);
    expect(src()).toBe('/data/maps/north/b-moon.webp');
  });

  it('describes cap shares as a share of the area the model covers', () => {
    mount('north');
    expect(root.textContent).toContain('of covered area ≥ 0.4');
    expect(root.textContent).not.toContain('of the cap ≥');
  });
});

describe('mountPoleMap zoom and 3D', () => {
  it('zooms in from the buttons and shortens the scale bar', () => {
    mount('south');
    expect(root.querySelector('.scale span')?.textContent).toBe('100 km');
    root.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')?.click();
    expect(root.querySelector<HTMLElement>('.map-stage')?.style.transform).toContain('scale(1.6)');
    expect(root.querySelector('.scale span')?.textContent).toBe('50 km');
    root.querySelector<HTMLButtonElement>('[aria-label="Reset view"]')?.click();
    expect(root.querySelector<HTMLElement>('.map-stage')?.style.transform).toContain('scale(1)');
  });

  it('opens on the 3D terrain with the chosen style and toggles to the topographic map', async () => {
    const view = fakeTerrain();
    const loader = vi.fn<TerrainLoader>(() => Promise.resolve(view));
    mount('south', vi.fn(), loader);
    expect(checked('map-view')).toBe('3D terrain');
    await flush();
    expect(loader).toHaveBeenCalledOnce();
    expect(loader.mock.calls[0]?.[1].outlines).toHaveLength(9);
    expect(view.setTexture).toHaveBeenCalledWith('/data/maps/south/b-moon.webp');
    expect(view.setRunning).toHaveBeenLastCalledWith(true);
    expect(root.querySelector<HTMLElement>('.map-stage')?.hidden).toBe(true);
    expect(root.querySelector<HTMLCanvasElement>('canvas.terrain')?.hidden).toBe(false);
    pick('Dark');
    await flush();
    expect(view.setTexture).toHaveBeenLastCalledWith('/data/maps/south/b-dark.webp');
    pick('Topographic');
    await flush();
    expect(root.querySelector<HTMLElement>('.map-stage')?.hidden).toBe(false);
    expect(view.setRunning).toHaveBeenLastCalledWith(false);
    pick('3D terrain');
    await flush();
    expect(loader).toHaveBeenCalledOnce();
    expect(root.querySelector<HTMLCanvasElement>('canvas.terrain')?.hidden).toBe(false);
  });

  it('highlights the 3D outline when a list row is hovered', async () => {
    const view = fakeTerrain();
    mount('south', vi.fn(), () => Promise.resolve(view));
    await flush();
    root.querySelectorAll('.region-list tbody tr')[2]?.dispatchEvent(new MouseEvent('mouseenter'));
    await flush();
    expect(view.setActive).toHaveBeenLastCalledWith(2);
    expect(root.querySelectorAll('.tbadge')[2]?.classList.contains('is-active')).toBe(true);
  });

  it('falls back to the topographic map when 3D cannot load', async () => {
    mount('north', vi.fn(), () => Promise.reject(new Error('no webgl')));
    await flush();
    await flush();
    expect(checked('map-view')).toBe('Topographic');
    expect(root.querySelector('.map-status')?.textContent).toContain('could not load');
    expect(root.querySelector<HTMLElement>('.map-stage')?.hidden).toBe(false);
  });

  it('stops the 3D view when the map is closed', async () => {
    const view = fakeTerrain();
    const map = mount('south', vi.fn(), () => Promise.resolve(view));
    await flush();
    map.dispose();
    await flush();
    expect(view.dispose).toHaveBeenCalledOnce();
  });
});
