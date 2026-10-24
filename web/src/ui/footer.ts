import type { Pole } from '../geo/polarStereo';
import { el } from './dom';

export const REPO_URL = 'https://github.com/caelwynder/lunar-ice-atlas';
const POLE_KEYS: Record<Pole, string> = { north: '<N-POLE>', south: '<S-POLE>' };
const POLE_LABEL: Record<Pole, string> = { north: 'Open North Pole map', south: 'Open South Pole map' };

export interface FooterOptions {
  onMoon(): void;
}

export interface Footer {
  setView(view: 'moon' | 'map'): void;
}

const keys = (text: string): HTMLElement[] =>
  [...text].map((c) => el('span', { class: 'key', 'aria-hidden': 'true' }, c === ' ' ? '' : c));

export function mountFooter(root: HTMLElement, opts: FooterOptions): Footer {
  const poleLink = (pole: Pole): HTMLAnchorElement =>
    el(
      'a',
      { class: 'keys', href: `#/${pole}`, 'data-pole': pole, 'aria-label': POLE_LABEL[pole] },
      ...keys(POLE_KEYS[pole]),
    );
  const poles = el('nav', { class: 'footer-poles', 'aria-label': 'Pole maps' }, poleLink('north'), poleLink('south'));
  const moon = el(
    'button',
    { type: 'button', class: 'keys footer-moon', 'aria-label': 'Back to Moon' },
    ...keys('< MOON'),
  );
  moon.addEventListener('click', () => opts.onMoon());
  const source = el(
    'a',
    {
      class: 'keys footer-source',
      href: REPO_URL,
      target: '_blank',
      rel: 'noopener',
      'aria-label': 'View the source on GitHub',
    },
    ...keys('SOURCE >'),
  );
  const setView = (view: 'moon' | 'map'): void => {
    poles.hidden = view === 'map';
    moon.hidden = view === 'moon';
  };
  root.replaceChildren(el('div', { class: 'footer-start' }, poles, moon), source);
  setView('moon');
  return { setView };
}
