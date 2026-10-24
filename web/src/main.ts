import './ui/styles.css';
import { loadRegions } from './data/load';
import { type MapsMeta, loadMapsMeta } from './data/mapsSchema';
import type { RegionsDoc } from './data/regionsSchema';
import type { Pole } from './geo/polarStereo';
import { type Route, onRoute, routeHash } from './router';
import { type MoonScene, type RenderId, createMoonScene } from './scene/moonScene';
import { type Footer, mountFooter } from './ui/footer';
import { type InfoPanel, mountInfoPanel } from './ui/infoPanel';
import { mountPoleMap } from './ui/poleMap';
import { createStatus } from './ui/status';
import { mountTopBar } from './ui/topBar';

const BASE = import.meta.env.BASE_URL;

interface AtlasData {
  regions: RegionsDoc;
  maps: Record<Pole, MapsMeta>;
}

function el<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`index.html is missing ${selector}`);
  return node;
}

async function loadData(): Promise<AtlasData> {
  const [regions, north, south] = await Promise.all([
    loadRegions(BASE),
    loadMapsMeta(BASE, 'north'),
    loadMapsMeta(BASE, 'south'),
  ]);
  return { regions, maps: { north, south } };
}

const status = createStatus(el<HTMLElement>('#status'));

const go = (route: Route): void => void (location.hash = routeHash(route));

function mountLanding(scene: MoonScene, data: AtlasData): InfoPanel {
  let shown: RenderId = 'topo';
  let last: RenderId = 'topo';
  const bar = mountTopBar(el('#top-bar'), {
    initial: 'topo',
    onRender: (id) => {
      last = id;
      scene
        .setRender(id)
        .then(() => void (last === id && (shown = id)))
        .catch(() => last === id && bar.setRender(shown));
    },
    onInfo: () => {
      if (panel.isOpen()) return panel.close();
      panel.open();
      bar.setInfoOpen(true);
    },
  });
  const panel = mountInfoPanel(el('#info'), data.regions, () => {
    bar.setInfoOpen(false);
    document.querySelector<HTMLButtonElement>('.info-btn')?.focus();
  });
  return panel;
}

function router(scene: MoonScene, data: AtlasData, panel: InfoPanel): (route: Route) => void {
  const stage = el<HTMLElement>('#stage');
  const view = el<HTMLElement>('#map-view');
  let unmount: (() => void) | null = null;
  let prev: Route | null = null;
  let back = (): void => go({ view: 'moon' });
  const footer: Footer = mountFooter(el('#site-footer'), { onMoon: () => back() });
  return (route) => {
    unmount?.();
    unmount = null;
    const from = prev;
    prev = route;
    const onMap = route.view === 'map';
    stage.hidden = onMap;
    stage.inert = onMap;
    view.hidden = !onMap;
    scene.setRunning(!onMap);
    footer.setView(route.view);
    if (route.view === 'moon') {
      scene.resize();
      if (from?.view === 'map') document.querySelector<HTMLElement>(`#site-footer [data-pole="${from.pole}"]`)?.focus();
      return;
    }
    if (panel.isOpen()) panel.close();
    const opts = { base: BASE, pole: route.pole, meta: data.maps[route.pole], regions: data.regions };
    back = () => (from?.view === 'moon' ? history.back() : location.replace(routeHash({ view: 'moon' })));
    unmount = mountPoleMap(view, { ...opts, onBack: back }).dispose;
    view.scrollTop = 0;
    view.querySelector<HTMLButtonElement>('.back')?.focus();
  };
}

async function start(): Promise<void> {
  const scene = createMoonScene(el<HTMLCanvasElement>('#moon'), {
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    onStatus: status.show,
    onPole: (pole) => go({ view: 'map', pole }),
  });
  scene.setRunning(true);
  void scene.setRender('topo').catch(() => undefined);
  const data = await loadData();
  const panel = mountLanding(scene, data);
  onRoute(router(scene, data, panel));
}

start().catch((err: unknown) => {
  status.fail(`Could not start the atlas (${err instanceof Error ? err.message : String(err)}). Try reloading.`);
  throw err;
});
