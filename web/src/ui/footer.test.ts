// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REPO_URL, mountFooter } from './footer';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<footer id="root"></footer>';
  root = document.getElementById('root') as HTMLElement;
});

const visible = (selector: string): boolean => !(root.querySelector<HTMLElement>(selector)?.hidden ?? true);

describe('mountFooter', () => {
  it('links the pole keys to the pole maps and Source to GitHub', () => {
    mountFooter(root, { onMoon: vi.fn() });
    expect(root.querySelector('[data-pole="north"]')?.getAttribute('href')).toBe('#/north');
    expect(root.querySelector('[data-pole="south"]')?.getAttribute('href')).toBe('#/south');
    const source = root.querySelector<HTMLAnchorElement>('.footer-source');
    expect(source?.href).toBe(REPO_URL);
    expect(source?.getAttribute('aria-label')).toBe('View the source on GitHub');
  });

  it('shows the pole links on the Moon and the Moon key on a map', () => {
    const footer = mountFooter(root, { onMoon: vi.fn() });
    expect(visible('.footer-poles')).toBe(true);
    expect(visible('.footer-moon')).toBe(false);
    footer.setView('map');
    expect(visible('.footer-poles')).toBe(false);
    expect(visible('.footer-moon')).toBe(true);
  });

  it('calls onMoon from the Moon key', () => {
    const onMoon = vi.fn();
    mountFooter(root, { onMoon }).setView('map');
    root.querySelector<HTMLButtonElement>('.footer-moon')?.click();
    expect(onMoon).toHaveBeenCalledOnce();
  });

  it('draws each character of a label as its own key', () => {
    mountFooter(root, { onMoon: vi.fn() });
    const keys = [...root.querySelectorAll('[data-pole="north"] .key')].map((k) => k.textContent);
    expect(keys).toEqual(['<', 'N', '-', 'P', 'O', 'L', 'E', '>']);
  });
});
