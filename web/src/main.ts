import './ui/styles.css';
import { createMoonScene } from './scene/moonScene';

function start(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#moon');
  const status = document.querySelector<HTMLElement>('#status');
  if (!canvas || !status) throw new Error('index.html is missing #moon or #status');
  const scene = createMoonScene(canvas, {
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    onStatus: (message) => {
      status.hidden = message === null;
      status.textContent = message ?? '';
    },
    onPole: () => undefined,
  });
  scene.setRunning(true);
  void scene.setRender('topo').catch(() => undefined);
}

start();
