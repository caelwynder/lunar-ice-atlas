import type { Region, StatKey } from '../data/regionsSchema';
import { MOON_RADIUS_M } from '../geo/constants';
import { type PsParams, psForward } from '../geo/polarStereo';
import type { UiContext } from './layers';
import { el } from './legend';
import { METRICS, type Metric, renderRegionChart, renderRegionTable } from './regionChart';

const FLY_ALTITUDE = 0.12;
const FULL_COVERAGE = 0.99;
// Any south polar-stereographic plane works for point-in-polygon; outlines are densified every 1 km.
const SOUTH_PS: PsParams = { lat0: -90, k0: 1, falseEasting: 0, falseNorthing: 0, radius: MOON_RADIUS_M };

export function sortRegions(regions: readonly Region[], key: StatKey): Region[] {
  return [...regions].sort((a, b) => {
    const va = a.stats[key];
    const vb = b.stats[key];
    if (va === null && vb === null) return a.name.localeCompare(b.name);
    if (va === null) return 1;
    if (vb === null) return -1;
    return vb - va;
  });
}

function containsPs(outline: [number, number][], x: number, y: number): boolean {
  const pts = outline.map(([lon, lat]) => psForward(lat, lon, SOUTH_PS));
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (!a || !b) continue;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The region whose footprint contains (lat, lon), or null. Regions are all near the south pole. */
export function regionAt(regions: readonly Region[], lat: number, lon: number): Region | null {
  if (lat >= 0) return null;
  const { x, y } = psForward(lat, lon, SOUTH_PS);
  return regions.find((r) => containsPs(r.outline, x, y)) ?? null;
}

export function renderRegionCard(region: Region): HTMLElement {
  const card = el('section', 'region-card');
  card.append(el('h3', '', region.name));
  if (region.coverage < FULL_COVERAGE) {
    card.append(el('p', 'note', `Partial model coverage (${Math.round(region.coverage * 100)}%)`));
  }
  const tiles = el('dl', 'stat-tiles');
  for (const m of METRICS) {
    const v = region.stats[m.key];
    tiles.append(
      el('dt', '', m.label),
      el('dd', 'value', v === null ? 'no data' : m.format(v)),
      el('dd', 'note', m.note),
    );
  }
  card.append(tiles);
  return card;
}

interface ExplorerState {
  metric: Metric;
  selected: string | null;
  showTable: boolean;
}

function regionButtons(sorted: Region[], state: ExplorerState, onPick: (r: Region) => void): HTMLButtonElement[] {
  return sorted.map((r) => {
    const b = el('button', r.id === state.selected ? 'region selected' : 'region', r.name);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(r.id === state.selected));
    b.addEventListener('click', () => onPick(r));
    return b;
  });
}

function metricSelect(onChange: (m: Metric) => void): HTMLSelectElement {
  const select = el('select');
  select.setAttribute('aria-label', 'Compare regions by');
  METRICS.forEach((m, i) => select.append(new Option(m.label, String(i))));
  select.addEventListener('change', () => {
    const m = METRICS[Number(select.value)];
    if (m) onChange(m);
  });
  return select;
}

export function mountRegions(container: HTMLElement, ctx: UiContext): void {
  const first = METRICS[0];
  if (!first) return;
  const state: ExplorerState = { metric: first, selected: null, showTable: false };
  const chartSlot = el('div', 'chart-slot');
  const cardSlot = el('div', 'card-slot');
  const list = el('div', 'region-list');
  const tableToggle = el('button', 'link', 'Table');
  tableToggle.type = 'button';

  const pick = (r: Region): void => {
    state.selected = r.id;
    ctx.scene.flyTo(r.centroid[1], r.centroid[0], FLY_ALTITUDE);
    ctx.scene.highlightRegion(r.id);
    cardSlot.replaceChildren(renderRegionCard(r));
    render();
  };
  const render = (): void => {
    const sorted = sortRegions(ctx.regions.regions, state.metric.key);
    const chart = state.showTable ? renderRegionTable(sorted) : renderRegionChart(sorted, state.metric, state.selected);
    chartSlot.replaceChildren(chart);
    list.replaceChildren(...regionButtons(sorted, state, pick));
  };
  tableToggle.addEventListener('click', () => {
    state.showTable = !state.showTable;
    tableToggle.textContent = state.showTable ? 'Chart' : 'Table';
    render();
  });

  const section = el('section', 'regions');
  section.append(
    el('h2', '', 'Artemis candidate landing regions'),
    el(
      'p',
      'lede',
      'Nine regions near the south pole, announced Oct 2024 for Artemis III. After NASA’s Feb 2026 restructuring, the first crewed landing is Artemis IV (early 2028).',
    ),
    metricSelect((m) => {
      state.metric = m;
      render();
    }),
    tableToggle,
    chartSlot,
    list,
    cardSlot,
    el(
      'p',
      'fineprint',
      `Region outlines: USGS grid footprints, DOI ${ctx.regions.doi} (CC0), retrieved ${ctx.regions.retrieved}. Statistics are illustrative and not for landing-site decisions.`,
    ),
  );
  container.append(section);
  render();
}
