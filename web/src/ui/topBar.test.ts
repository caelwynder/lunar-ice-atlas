// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountTopBar } from './topBar';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  root = document.getElementById('root') as HTMLElement;
});

const pressed = (): string[] =>
  [...root.querySelectorAll('[aria-pressed="true"]')].map((b) => b.getAttribute('aria-label') ?? '');

describe('mountTopBar', () => {
  it('renders the three render buttons with the initial one pressed', () => {
    mountTopBar(root, { initial: 'topo', onRender: vi.fn(), onInfo: vi.fn() });
    const labels = [...root.querySelectorAll('.render-toggle button')].map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual(['Colour render', 'Grid render', 'Topography render']);
    expect(pressed()).toEqual(['Topography render']);
  });

  it('presses only the clicked render and reports it', () => {
    const onRender = vi.fn();
    mountTopBar(root, { initial: 'topo', onRender, onInfo: vi.fn() });
    root.querySelector<HTMLButtonElement>('[aria-label="Grid render"]')?.click();
    expect(pressed()).toEqual(['Grid render']);
    expect(onRender).toHaveBeenCalledWith('grid');
  });

  it('toggles aria-expanded on the info button', () => {
    const onInfo = vi.fn();
    const bar = mountTopBar(root, { initial: 'topo', onRender: vi.fn(), onInfo });
    const info = root.querySelector<HTMLButtonElement>('[aria-label="Project information"]');
    info?.click();
    expect(onInfo).toHaveBeenCalledOnce();
    bar.setInfoOpen(true);
    expect(info?.getAttribute('aria-expanded')).toBe('true');
    bar.setInfoOpen(false);
    expect(info?.getAttribute('aria-expanded')).toBe('false');
  });
});
