import './ui/styles.css';
import { loadRegions } from './data/load';
import type { Pole } from './geo/polarStereo';
import { createMoonScene } from './scene/moonScene';
import { mountInfoPanel } from './ui/infoPanel';
import { mountTopBar } from './ui/topBar';

const BASE = import.meta.env.BASE_URL;

function el<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`index.html is missing ${selector}`);
  return node;
}

async function start(): Promise<void> {
  const status = el<HTMLElement>('#status');
  const setStatus = (message: string | null): void => {
    status.hidden = message === null;
    status.textContent = message ?? '';
  };
  const openPole = (pole: Pole): void => void (location.hash = `#/${pole}`);
  const scene = createMoonScene(el<HTMLCanvasElement>('#moon'), {
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    onStatus: setStatus,
    onPole: openPole,
  });
  scene.setRunning(true);
  void scene.setRender('topo').catch(() => undefined);
  for (const b of document.querySelectorAll<HTMLButtonElement>('#pole-links button')) {
    b.addEventListener('click', () => openPole(b.dataset['pole'] === 'north' ? 'north' : 'south'));
  }
  const regions = await loadRegions(BASE);
  const infoBtn = (): HTMLButtonElement | null => document.querySelector('.info-btn');
  const bar = mountTopBar(el('#top-bar'), {
    initial: 'topo',
    onRender: (id) => void scene.setRender(id).catch(() => undefined),
    onInfo: () => (panel.isOpen() ? panel.close() : (panel.open(), bar.setInfoOpen(true))),
  });
  const panel = mountInfoPanel(el('#info'), regions, () => {
    bar.setInfoOpen(false);
    infoBtn()?.focus();
  });
}

start().catch((err: unknown) => {
  const status = document.querySelector('#status');
  if (status)
    status.textContent = `Could not start the atlas (${err instanceof Error ? err.message : String(err)}). Try reloading.`;
  throw err;
});
