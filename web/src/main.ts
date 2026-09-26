import './ui/styles.css';
import { loadGlobe, loadPole, loadRegions } from './data/load';
import { createAtlasScene } from './scene/scene';
import { mountUi } from './ui/layers';

const BASE = import.meta.env.BASE_URL;
const EXAGGERATION = 6;

async function start(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#moon');
  const status = document.querySelector<HTMLElement>('#status');
  if (!canvas || !status) throw new Error('index.html is missing #moon or #status');
  try {
    status.textContent = 'Loading lunar data…';
    const [globe, north, south, regions] = await Promise.all([
      loadGlobe(BASE),
      loadPole(BASE, 'north'),
      loadPole(BASE, 'south'),
      loadRegions(BASE),
    ]);
    const scene = createAtlasScene(canvas, globe, [north, south], { exaggeration: EXAGGERATION });
    scene.addRegionOutlines(regions);
    mountUi({ scene, poles: [north, south], regions, exaggeration: EXAGGERATION });
    status.hidden = true;
  } catch (err) {
    status.textContent = `Could not load the atlas data (${err instanceof Error ? err.message : String(err)}). Try reloading.`;
    status.setAttribute('role', 'alert');
    throw err;
  }
}

void start();
