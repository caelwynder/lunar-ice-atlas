// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseMapsMeta } from '../data/mapsSchema';
import { parseRegions } from '../data/regionsSchema';
import type { Pole } from '../geo/polarStereo';
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

const mount = (pole: Pole, onBack = vi.fn()) =>
  mountPoleMap(root, { base: '/', pole, meta: META[pole], regions: REGIONS, onBack });
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
    expect(src()).toBe('/data/maps/south/b-dark.webp');
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
    expect(src()).toBe('/data/maps/south/d-dark.webp');
    expect(root.querySelector('.legend')?.textContent).toContain(`≥ ${META.south.hotspot.toFixed(2)}`);
    pick('Moon grey');
    expect(src()).toBe('/data/maps/south/d-moon.webp');
    pick('Glow');
    expect(root.querySelector('.legend .ramp')).not.toBeNull();
  });

  it('remembers the chosen style and theme across visits', () => {
    const first = mount('south');
    pick('Hotspots');
    pick('Moon grey');
    first.dispose();
    expect(root.childElementCount).toBe(0);
    mount('north');
    expect(src()).toBe('/data/maps/north/d-moon.webp');
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

describe('mountPoleMap (north)', () => {
  it('shows pole statistics instead of regions', () => {
    mount('north');
    expect(root.querySelectorAll('.badge')).toHaveLength(0);
    expect(root.querySelector('h1')?.textContent).toBe('Predicted ice prospectivity');
    expect(root.textContent).toContain(`${Math.round(META.north.stats.fracGe04 * 100)}%`);
    expect(src()).toBe('/data/maps/north/b-dark.webp');
  });
});
