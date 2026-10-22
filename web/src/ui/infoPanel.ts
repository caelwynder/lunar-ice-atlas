import { CAVEATS, CREDITS, RUN_LOG } from '../content/runLog';
import type { Region, RegionsDoc } from '../data/regionsSchema';
import { el, fmt, pct } from './dom';

export interface InfoPanel {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

const BAR_PX = 80;

function stat(value: string, label: string): HTMLElement {
  return el('div', { class: 'stat' }, el('b', {}, value), el('span', {}, label));
}

function section(title: string, ...body: (Node | string)[]): HTMLElement {
  return el('section', {}, el('h3', {}, title), ...body);
}

function table(cls: string, head: string[], rows: (string | Node)[][]): HTMLTableElement {
  const thead = el('thead', {}, el('tr', {}, ...head.map((h) => el('th', { scope: 'col' }, h))));
  const body = rows.map(([first, ...rest]) =>
    el('tr', {}, el('th', { scope: 'row' }, first ?? ''), ...rest.map((c) => el('td', {}, c))),
  );
  return el('table', { class: cls }, thead, el('tbody', {}, ...body));
}

function runLog(): HTMLElement {
  const r = RUN_LOG;
  return section(
    'Run log',
    el(
      'p',
      {},
      "I ran NASA-IBM's fine-tuned ",
      el('b', {}, 'Ice-Prospectivity'),
      ' model (NI-LFM, ViT-B backbone, released Sept 2026) locally on a laptop CPU, with no GPU, over every polar patch in the SomBench dataset.',
    ),
    el(
      'div',
      { class: 'stats' },
      stat(String(r.patches), `patches · ${r.perPole} per pole`),
      stat(`${r.minutes} min`, `≈${r.secPerPatch} s / patch · ${r.machine}`),
      stat(r.testRmse.toFixed(4), `test RMSE · card ${r.cardRmse}`),
      stat(r.testR2.toFixed(3), `test R² · card ${r.cardR2}`),
    ),
    el(
      'p',
      { class: 'muted' },
      `Test split = ${r.testPatches} held-out patches. MAE ${r.testMae} (card ${r.cardMae}). Peak memory ${r.peakGb} GB.`,
    ),
  );
}

function accuracy(): HTMLElement {
  const r = RUN_LOG;
  return section(
    'Accuracy by pole',
    table(
      'pole-table',
      ['Area', 'Patches', 'RMSE'],
      [
        ['North pole', String(r.perPole), r.poleRmse.north.toFixed(4)],
        ['South pole', String(r.perPole), r.poleRmse.south.toFixed(4)],
        [`Test split (${r.testPatches} held out)`, String(r.testPatches), r.testRmse.toFixed(4)],
      ],
    ),
  );
}

function regionRow(r: Region): (string | Node)[] {
  const v = r.stats.predMean;
  const bar = el('span', { class: 'bar', style: `width:${Math.round((v ?? 0) * BAR_PX)}px` });
  return [r.name, el('span', {}, bar, fmt(v)), pct(r.stats.fracSlopeLt8)];
}

function regionsSection(doc: RegionsDoc): HTMLElement {
  const sorted = [...doc.regions].sort((a, b) => (b.stats.predMean ?? -1) - (a.stats.predMean ?? -1));
  return section(
    'Artemis candidate regions',
    table('region-table', ['Region', 'Prospectivity', 'Flat'], sorted.map(regionRow)),
  );
}

function credits(): HTMLElement {
  const caveat = `Model outputs are "${CAVEATS[0]}" and "${CAVEATS[1]}" (NASA-IBM model cards).`;
  return section('Credits', el('p', { class: 'muted' }, caveat), el('p', { class: 'muted' }, CREDITS));
}

export function mountInfoPanel(aside: HTMLElement, regions: RegionsDoc, onClose: () => void): InfoPanel {
  const close = el('button', { type: 'button', class: 'close', 'aria-label': 'Close information panel' }, '×');
  const header = el(
    'header',
    {},
    el(
      'div',
      {},
      el('div', { class: 'k' }, 'About this project'),
      el('h2', { id: 'info-title' }, 'Run log & findings'),
    ),
    close,
  );
  aside.setAttribute('aria-labelledby', 'info-title');
  aside.replaceChildren(
    header,
    el('div', { class: 'scroll' }, runLog(), accuracy(), regionsSection(regions), credits()),
  );
  let isOpen = false;
  const onKey = (e: KeyboardEvent): void => void (e.key === 'Escape' && panel.close());
  const setOpen = (open: boolean): void => {
    isOpen = open;
    aside.inert = !open;
    aside.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('info-open', open);
  };
  const panel: InfoPanel = {
    open() {
      setOpen(true);
      document.addEventListener('keydown', onKey);
      close.focus();
    },
    close() {
      if (!isOpen) return;
      setOpen(false);
      document.removeEventListener('keydown', onKey);
      onClose();
    },
    isOpen: () => isOpen,
  };
  close.addEventListener('click', () => panel.close());
  setOpen(false);
  return panel;
}
