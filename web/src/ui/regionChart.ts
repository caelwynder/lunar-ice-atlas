import type { Region, StatKey } from '../data/regionsSchema';

export interface Metric {
  key: StatKey;
  label: string;
  note: string;
  format: (v: number) => string;
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;
export const METRICS: readonly Metric[] = [
  { key: 'predMean', label: 'Mean predicted prospectivity', note: 'NI-LFM model output', format: (v) => v.toFixed(2) },
  { key: 'fracPredGt05', label: 'Area with prospectivity > 0.5', note: 'NI-LFM model output', format: pct },
  {
    key: 'fracSlopeLt8',
    label: 'Area with slope < 8°',
    note: 'HLS threshold; 240 m baseline is smoother than lander scale',
    format: pct,
  },
  { key: 'fracSlopeLt5', label: 'Area with slope < 5°', note: 'HLS goal', format: pct },
  { key: 'fracPsr', label: 'Area in permanent shadow', note: 'LOLA-derived PSR mask', format: pct },
  { key: 'tmaxMeanK', label: 'Mean max surface temperature', note: 'Diviner', format: (v) => `${v.toFixed(0)} K` },
];

const NS = 'http://www.w3.org/2000/svg';
const ROW_H = 28;
const LABEL_W = 130;
const BAR_W = 150;
const BAR = '#3987e5';
const BAR_SELECTED = '#cde2fb';

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

function row(region: Region, metric: Metric, i: number, maxV: number, selected: boolean): SVGGElement {
  const v = region.stats[metric.key];
  const text = v === null ? 'no data' : metric.format(v);
  const g = svgEl('g', {
    'data-id': region.id,
    transform: `translate(0 ${i * ROW_H})`,
    tabindex: 0,
    role: 'img',
    'aria-label': `${region.name}: ${text}`,
  });
  const title = svgEl('title', {});
  title.textContent = `${region.name}: ${text}`;
  const name = svgEl('text', { class: 'name', x: 0, y: 18, fill: '#ffffff', 'font-weight': selected ? 700 : 400 });
  name.textContent = region.name;
  g.append(title, name);
  const barW = v === null ? 0 : Math.max(2, (v / maxV) * BAR_W);
  if (v !== null) {
    g.append(
      svgEl('rect', {
        class: 'bar',
        x: LABEL_W,
        y: 6,
        height: ROW_H - 12,
        rx: 4,
        width: barW,
        fill: selected ? BAR_SELECTED : BAR,
      }),
    );
  }
  const label = svgEl('text', { class: 'value', x: LABEL_W + barW + 6, y: 18, fill: '#c3c2b7' });
  label.textContent = text;
  g.append(label);
  return g;
}

export function renderRegionChart(
  regions: readonly Region[],
  metric: Metric,
  selectedId: string | null,
): SVGSVGElement {
  const values = regions.map((r) => r.stats[metric.key]).filter((v): v is number => v !== null);
  const maxV = Math.max(...values, 1e-9);
  const svg = svgEl('svg', {
    viewBox: `0 0 ${LABEL_W + BAR_W + 60} ${regions.length * ROW_H}`,
    width: '100%',
    role: 'group',
    'aria-label': metric.label,
  });
  regions.forEach((r, i) => svg.append(row(r, metric, i, maxV, r.id === selectedId)));
  return svg;
}

export function renderRegionTable(regions: readonly Region[]): HTMLTableElement {
  const table = document.createElement('table');
  const head = table.createTHead().insertRow();
  for (const h of ['Region', ...METRICS.map((m) => m.label)]) {
    const th = document.createElement('th');
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  for (const r of regions) {
    const tr = body.insertRow();
    tr.insertCell().textContent = r.name;
    for (const m of METRICS) {
      const v = r.stats[m.key];
      tr.insertCell().textContent = v === null ? 'no data' : m.format(v);
    }
  }
  return table;
}
