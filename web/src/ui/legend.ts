import type { LayerMeta } from '../data/schema';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const tick = (v: number): HTMLElement => el('span', 'tick', String(+v.toFixed(2)).replace('-', '−'));

export function renderLegend(layer: LayerMeta): HTMLElement {
  const root = el('div', 'legend');
  const { kind, stops, min = 0, max = 1 } = layer.legend;
  if (kind === 'binary' || kind === 'outline') {
    const swatch = el('span', `swatch swatch-${kind}`);
    swatch.style.setProperty('--c', stops[0] ?? '#ffffff');
    root.append(swatch, el('span', 'legend-label', kind === 'binary' ? '(hatched)' : layer.label));
    return root;
  }
  const bar = el('div', 'legend-bar');
  bar.style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
  const ticks = el('div', 'ticks');
  ticks.append(tick(min), tick((min + max) / 2), tick(max));
  root.append(bar, ticks);
  if (kind === 'diverging') {
    const poles = el('div', 'poles');
    poles.append(el('span', '', 'model lower'), el('span', '', 'model higher'));
    root.append(poles);
  }
  return root;
}
