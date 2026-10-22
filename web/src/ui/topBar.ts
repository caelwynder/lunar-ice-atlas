import { RENDER_IDS, RENDER_LABEL, type RenderId } from '../scene/moonScene';
import { el, svg } from './dom';
import { ICONS } from './icons';

export interface TopBarOptions {
  initial: RenderId;
  onRender(id: RenderId): void;
  onInfo(): void;
}

export function mountTopBar(
  root: HTMLElement,
  opts: TopBarOptions,
): { setRender(id: RenderId): void; setInfoOpen(open: boolean): void } {
  const group = el('div', { class: 'render-toggle pill', role: 'group', 'aria-label': 'Moon render' });
  const press = (id: RenderId): void =>
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(RENDER_IDS[i] === id)));
  const buttons = RENDER_IDS.map((id) => {
    const label = RENDER_LABEL[id];
    const b = el('button', { type: 'button', 'aria-label': `${label} render`, 'data-tip': label }, svg(ICONS[id]));
    b.setAttribute('aria-pressed', String(id === opts.initial));
    b.addEventListener('click', () => {
      press(id);
      opts.onRender(id);
    });
    return b;
  });
  group.append(...buttons);
  const info = el(
    'button',
    { type: 'button', class: 'info-btn', 'aria-label': 'Project information', 'aria-controls': 'info' },
    svg(ICONS.info),
  );
  info.setAttribute('aria-expanded', 'false');
  info.addEventListener('click', () => opts.onInfo());
  root.replaceChildren(group, info);
  return { setRender: press, setInfoOpen: (open) => info.setAttribute('aria-expanded', String(open)) };
}
