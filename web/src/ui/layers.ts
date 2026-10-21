import type { LayerMeta } from '../data/schema';
import type { LoadedPole } from '../data/load';
import type { RegionsDoc } from '../data/regionsSchema';
import type { AtlasScene } from '../scene/scene';
import { renderAbout } from './about';
import { el, renderLegend } from './legend';
import { formatReadout } from './readout';
import { mountRegions, regionAt } from './regions';

export interface UiContext {
  scene: AtlasScene;
  poles: LoadedPole[];
  regions: RegionsDoc;
  exaggeration: number;
}

const TEST_RMSE = '0.0277'; // docs/benchmarks.md, 25 held-out test patches
const PICKABLE_LAYERS = ['pred', 'ref', 'err', 'psr'];
const DEFAULT_LAYER = 'pred';
const DEFAULT_OPACITY = 0.85;
const POLE_LAT = 89.9;
const POLE_ALTITUDE = 0.9;

function layerOption(id: string, label: string, legend: HTMLElement | null, checked: boolean): HTMLLabelElement {
  const wrap = el('label', 'layer-option');
  const input = el('input');
  input.type = 'radio';
  input.name = 'layer';
  input.value = id;
  input.checked = checked;
  wrap.append(input, el('span', 'layer-name', label));
  if (legend) wrap.append(legend);
  return wrap;
}

function layerFieldset(layers: LayerMeta[], scene: AtlasScene): HTMLFieldSetElement {
  const fieldset = el('fieldset', 'layers');
  fieldset.append(el('legend', '', 'Layer'));
  for (const layer of layers) {
    fieldset.append(layerOption(layer.id, layer.label, renderLegend(layer), layer.id === DEFAULT_LAYER));
  }
  fieldset.append(layerOption('', 'None', null, false));
  fieldset.addEventListener('change', (e) => {
    const value = (e.target as HTMLInputElement).value;
    scene.setLayer(value === '' ? null : value);
  });
  return fieldset;
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', '', text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function controls(scene: AtlasScene, about: HTMLDialogElement): HTMLElement {
  const testLabel = el('label', 'check');
  const test = el('input');
  test.type = 'checkbox';
  test.addEventListener('change', () => scene.setTestOutline(test.checked));
  testLabel.append(test, ' Show held-out test patches');

  const opacity = el('input');
  Object.assign(opacity, { type: 'range', min: '0', max: '1', step: '0.05', value: String(DEFAULT_OPACITY) });
  opacity.setAttribute('aria-label', 'Overlay opacity');
  opacity.addEventListener('input', () => scene.setOpacity(Number(opacity.value)));
  const opacityLabel = el('label', 'range', 'Overlay opacity');
  opacityLabel.append(opacity);

  const buttons = el('div', 'buttons');
  buttons.append(
    button('North pole', () => scene.flyTo(POLE_LAT, 0, POLE_ALTITUDE)),
    button('South pole', () => scene.flyTo(-POLE_LAT, 0, POLE_ALTITUDE)),
    button('About', () => about.showModal()),
  );
  const box = el('div', 'controls');
  box.append(testLabel, opacityLabel, buttons);
  return box;
}

function wireReadout(canvas: HTMLCanvasElement, readout: HTMLElement, scene: AtlasScene, regions: RegionsDoc): void {
  const show = (ndcX: number, ndcY: number): void => {
    const hit = scene.pick(ndcX, ndcY);
    const inRegion = hit ? regionAt(regions.regions, hit.lat, hit.lon) : null;
    const lines = hit ? formatReadout(hit) : [];
    readout.textContent = (inRegion ? [inRegion.name, ...lines] : lines).join(' · ');
  };
  let pending: PointerEvent | null = null;
  const flush = (): void => {
    if (pending === null) return;
    const rect = canvas.getBoundingClientRect();
    show(((pending.clientX - rect.left) / rect.width) * 2 - 1, -((pending.clientY - rect.top) / rect.height) * 2 + 1);
    pending = null;
  };
  canvas.addEventListener('pointermove', (e) => {
    if (pending === null) requestAnimationFrame(flush);
    pending = e;
  });
  canvas.addEventListener('pointerleave', () => (readout.textContent = ''));
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'i') show(0, 0);
  });
}

export function mountUi(ctx: UiContext): void {
  const panel = document.querySelector<HTMLElement>('#panel');
  const readout = document.querySelector<HTMLElement>('#readout');
  const about = document.querySelector<HTMLDialogElement>('#about');
  const canvas = document.querySelector<HTMLCanvasElement>('#moon');
  if (!panel || !readout || !about || !canvas) throw new Error('index.html is missing a UI container');

  const layers = (ctx.poles[0]?.meta.layers ?? []).filter((l) => PICKABLE_LAYERS.includes(l.id));
  renderAbout(about, TEST_RMSE);
  panel.replaceChildren(
    el('h1', '', 'Lunar Ice Atlas'),
    el('p', 'pitch', 'Where might water ice hide at the Moon’s poles? A NASA/IBM foundation model’s answer, in 3D.'),
    layerFieldset(layers, ctx.scene),
    controls(ctx.scene, about),
    el('p', 'hint', 'Drag to rotate · scroll to zoom · focus the Moon and press “i” to read the centre point'),
  );
  mountRegions(panel, ctx);
  wireReadout(canvas, readout, ctx.scene, ctx.regions);
  ctx.scene.setLayer(DEFAULT_LAYER);
  ctx.scene.setOpacity(DEFAULT_OPACITY);
}
