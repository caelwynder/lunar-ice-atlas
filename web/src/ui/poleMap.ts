import { CAVEATS, RUN_LOG } from '../content/runLog';
import type { MapStyle, MapTheme, MapsMeta, MapsRegion } from '../data/mapsSchema';
import type { Region, RegionsDoc } from '../data/regionsSchema';
import type { Pole } from '../geo/polarStereo';
import { el, fmt, pct, svg } from './dom';
import { ICONS } from './icons';

export interface PoleMapOptions {
  base: string;
  pole: Pole;
  meta: MapsMeta;
  regions: RegionsDoc;
  onBack(): void;
}

const STYLE_LABEL: Record<MapStyle, string> = { a: 'Glow', b: 'Bands', d: 'Hotspots' };
const THEME_LABEL: Record<MapTheme, string> = { dark: 'Dark', moon: 'Moon grey' };
const THEME_BANDS: Record<MapTheme, readonly [string, string, string]> = {
  dark: ['#256abf', '#6da7ec', '#cde2fb'],
  moon: ['#3987e5', '#256abf', '#184f95'],
};
const PREF = { style: 'atlas.mapStyle', theme: 'atlas.mapTheme' } as const;
const SCALE_KM = 100;
const BAR_PX = 90;
const SVG_NS = 'http://www.w3.org/2000/svg';

interface Ranked {
  map: MapsRegion;
  region: Region | undefined;
}

function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback; // storage can be blocked (private mode); the default is fine
  }
}

function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage can be blocked (private mode); the choice just won't persist
  }
}

function rank(meta: MapsMeta, doc: RegionsDoc): Ranked[] {
  const byId = new Map(doc.regions.map((r) => [r.id, r]));
  const score = (r: Ranked): number => r.region?.stats.predMean ?? -1;
  return meta.regions.map((map) => ({ map, region: byId.get(map.id) })).sort((a, b) => score(b) - score(a));
}

const at = (meta: MapsMeta, [x, y]: [number, number]): string =>
  `left:${(x / meta.size) * 100}%;top:${(y / meta.size) * 100}%`;

function overlay(meta: MapsMeta, ranked: Ranked[]): { svgEl: SVGSVGElement; polygons: SVGPolygonElement[] } {
  const svgEl = document.createElementNS(SVG_NS, 'svg');
  svgEl.setAttribute('class', 'regions');
  svgEl.setAttribute('viewBox', `0 0 ${meta.size} ${meta.size}`);
  svgEl.setAttribute('aria-hidden', 'true');
  const polygons = ranked.map(({ map }) => {
    const poly = document.createElementNS(SVG_NS, 'polygon');
    poly.setAttribute('points', map.px.map(([x, y]) => `${x},${y}`).join(' '));
    svgEl.append(poly);
    return poly;
  });
  return { svgEl, polygons };
}

function mapPane(meta: MapsMeta, ranked: Ranked[]) {
  const img = el('img', { class: 'basemap', width: String(meta.size), height: String(meta.size), decoding: 'async' });
  const { svgEl, polygons } = overlay(meta, ranked);
  const badges = ranked.map(({ map }, i) =>
    el(
      'button',
      { type: 'button', class: 'badge', style: at(meta, map.centroidPx), 'aria-label': `${i + 1}. ${map.name}` },
      String(i + 1),
    ),
  );
  const poleName = meta.pole === 'south' ? 'South Pole' : 'North Pole';
  const poleTag = el('div', { class: 'pole-tag', style: at(meta, meta.polePx) }, el('i', {}), poleName);
  const scaleWidth = `${(SCALE_KM / meta.kmPerPx / meta.size) * 100}%`;
  const scale = el(
    'div',
    { class: 'scale' },
    el('div', { class: 'scale-bar', style: `width:${scaleWidth}` }),
    el('span', {}, `${SCALE_KM} km`),
  );
  const pane = el('div', { class: 'map-pane' }, img, svgEl, ...badges, poleTag, scale);
  return { pane, img, polygons, badges };
}

function radios<T extends string>(
  name: string,
  legend: string,
  values: readonly T[],
  labels: Record<T, string>,
  current: T,
  onPick: (v: T) => void,
): HTMLFieldSetElement {
  const set = el('fieldset', { class: 'pill segmented' }, el('legend', { class: 'visually-hidden' }, legend));
  for (const v of values) {
    const input = el('input', { type: 'radio', name, value: v });
    input.checked = v === current;
    input.addEventListener('change', () => input.checked && onPick(v));
    set.append(el('label', {}, input, el('span', {}, labels[v])));
  }
  return set;
}

function legendFor(style: MapStyle, theme: MapTheme, meta: MapsMeta): HTMLElement[] {
  const c = THEME_BANDS[theme];
  const swatch = (color: string, label: string): HTMLElement =>
    el(
      'div',
      { class: 'swatch-item' },
      el('span', { class: 'swatch', style: `background:${color}` }),
      el('span', { class: 'swatch-label' }, label),
    );
  if (style === 'a') {
    const ramp = el('div', { class: 'ramp', style: `background:linear-gradient(90deg,transparent,${c.join(',')})` });
    return [
      ramp,
      el('div', { class: 'ticks' }, el('span', {}, '0.2'), el('span', {}, '0.6'), el('span', {}, '1')),
      el('p', { class: 'muted' }, 'Stronger blue = higher predicted prospectivity.'),
    ];
  }
  if (style === 'd') {
    return [
      el('div', { class: 'swatches' }, swatch(c[2], `≥ ${meta.hotspot.toFixed(2)}`)),
      el('p', { class: 'muted' }, 'Top 15% of predicted prospectivity; everything else is topography only.'),
    ];
  }
  const labels = ['0.4 – 0.6', '0.6 – 0.8', '0.8 – 1'];
  return [
    el('div', { class: 'swatches' }, ...labels.map((l, i) => swatch(c[i] ?? c[0], l))),
    el('p', { class: 'muted' }, 'Below 0.4: topography only.'),
  ];
}

function regionTable(ranked: Ranked[]): { table: HTMLTableElement; rows: HTMLTableRowElement[] } {
  const head = el(
    'thead',
    {},
    el('tr', {}, ...['Region', 'Prospectivity', 'Flat'].map((h) => el('th', { scope: 'col' }, h))),
  );
  const rows = ranked.map(({ map, region }, i) => {
    const v = region?.stats.predMean ?? null;
    const bar = el('span', { class: 'bar', style: `width:${Math.round((v ?? 0) * BAR_PX)}px` });
    return el(
      'tr',
      {},
      el('th', { scope: 'row' }, el('span', { class: 'num' }, String(i + 1)), map.name),
      el('td', {}, bar, fmt(v)),
      el('td', {}, pct(region?.stats.fracSlopeLt8 ?? null)),
    );
  });
  return { table: el('table', { class: 'region-list' }, head, el('tbody', {}, ...rows)), rows };
}

function northStats(meta: MapsMeta): HTMLElement {
  const s = meta.stats;
  const card = (v: string, label: string): HTMLElement =>
    el('div', { class: 'stat' }, el('b', {}, v), el('span', {}, label));
  return el(
    'section',
    { class: 'side-section' },
    el('h3', {}, 'North pole at a glance'),
    el(
      'div',
      { class: 'stats' },
      card(s.mean.toFixed(2), 'mean prospectivity'),
      card(pct(s.fracGe04), 'of the cap ≥ 0.4'),
      card(pct(s.fracGe06), 'of the cap ≥ 0.6'),
      card(pct(s.fracGe08), 'of the cap ≥ 0.8'),
      card(s.rmse.toFixed(4), `RMSE vs reference · ${RUN_LOG.perPole} patches`),
      card(pct(s.coverage), 'of the cap covered by the model'),
    ),
  );
}

const COPY: Record<Pole, { k: string; title: string; lede: string }> = {
  south: {
    k: 'South pole · Artemis',
    title: 'Candidate landing regions',
    lede: "Nine candidate regions announced in Oct 2024 for Artemis III (the first crewed landing is now Artemis IV, early 2028), over my model's predicted ice prospectivity.",
  },
  north: {
    k: 'North pole',
    title: 'Predicted ice prospectivity',
    lede: "No Artemis landing regions are planned here. This map shows my model's predictions across the whole cap above 80°N.",
  },
};
const NOTE =
  `Model outputs are "${CAVEATS[0]}" and "${CAVEATS[1]}" (NASA-IBM model cards). ` +
  '"Flat" = share of a region under the 8° landing-slope limit (240 m baseline). Predictions smoothed to ~5 km. Elevation: NASA LOLA, contours every 500 m.';

function linkHover(groups: Element[][]): void {
  const setActive = (i: number | null): void => {
    for (const g of groups) g.forEach((node, j) => node.classList.toggle('is-active', j === i));
  };
  for (const g of groups) {
    g.forEach((node, i) => {
      node.addEventListener('mouseenter', () => setActive(i));
      node.addEventListener('mouseleave', () => setActive(null));
      node.addEventListener('focusin', () => setActive(i));
      node.addEventListener('focusout', () => setActive(null));
    });
  }
}

export function mountPoleMap(root: HTMLElement, opts: PoleMapOptions): { dispose(): void } {
  const { meta, pole } = opts;
  let style = readPref<MapStyle>(PREF.style, meta.styles, 'b');
  let theme = readPref<MapTheme>(PREF.theme, meta.themes, 'dark');
  const ranked = rank(meta, opts.regions);
  const { pane, img, polygons, badges } = mapPane(meta, ranked);
  const legend = el('div', { class: 'legend' });
  const update = (): void => {
    img.src = `${opts.base}data/maps/${pole}/${style}-${theme}.webp`;
    img.alt = `${COPY[pole].k} map: ${STYLE_LABEL[style].toLowerCase()} view of predicted ice prospectivity over topography`;
    pane.dataset['theme'] = theme;
    legend.replaceChildren(...legendFor(style, theme, meta));
    writePref(PREF.style, style);
    writePref(PREF.theme, theme);
  };
  const back = el('button', { type: 'button', class: 'back' }, svg(ICONS.back), 'Back to Moon');
  back.addEventListener('click', () => opts.onBack());
  const controls = el(
    'div',
    { class: 'map-controls' },
    radios('map-style', 'Map style', meta.styles, STYLE_LABEL, style, (v) => ((style = v), update())),
    radios('map-theme', 'Map theme', meta.themes, THEME_LABEL, theme, (v) => ((theme = v), update())),
  );
  const copy = COPY[pole];
  const side = el(
    'div',
    { class: 'side' },
    back,
    el(
      'header',
      {},
      el('div', { class: 'label' }, copy.k),
      el('h1', {}, copy.title),
      el('p', { class: 'lede' }, copy.lede),
    ),
    controls,
    el('section', { class: 'side-section' }, el('h3', {}, 'Predicted ice prospectivity'), legend),
  );
  if (pole === 'south') {
    const { table, rows } = regionTable(ranked);
    side.append(el('section', { class: 'side-section' }, table));
    linkHover([polygons, badges, rows]);
  } else {
    side.append(northStats(meta));
  }
  side.append(el('p', { class: 'note' }, NOTE));
  root.replaceChildren(el('div', { class: 'pole-map' }, pane, side));
  update();
  return { dispose: () => root.replaceChildren() };
}
