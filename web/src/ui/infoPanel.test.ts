// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRegions } from '../data/regionsSchema';
import { mountInfoPanel } from './infoPanel';

const REGIONS = parseRegions(JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/regions.json'), 'utf8')));

let aside: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<aside id="info"></aside>';
  aside = document.getElementById('info') as HTMLElement;
});

describe('mountInfoPanel', () => {
  it('lists the sections in the Figma order', () => {
    mountInfoPanel(aside, REGIONS, vi.fn());
    const headings = [...aside.querySelectorAll('h3')].map((h) => h.textContent);
    expect(headings).toEqual(['Run log', 'Accuracy by pole', 'Artemis candidate regions', 'Credits']);
  });

  it('shows the run numbers and keeps the model-card caveat', () => {
    mountInfoPanel(aside, REGIONS, vi.fn());
    const text = aside.textContent ?? '';
    for (const value of ['0.0277', '0.0298', '0.0236', '162']) expect(text).toContain(value);
    expect(text).toContain('not measured ice');
  });

  it('ranks the nine regions by predicted prospectivity', () => {
    mountInfoPanel(aside, REGIONS, vi.fn());
    const rows = [...aside.querySelectorAll('.region-table tbody tr')];
    expect(rows).toHaveLength(9);
    expect(rows[0]?.querySelector('th')?.textContent).toBe('Slater Plain');
  });

  it('is inert while closed and closes on Escape', () => {
    const onClose = vi.fn();
    const panel = mountInfoPanel(aside, REGIONS, onClose);
    expect(aside.inert).toBe(true);
    panel.open();
    expect(panel.isOpen()).toBe(true);
    expect(aside.inert).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(panel.isOpen()).toBe(false);
    expect(aside.inert).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes from its own close button', () => {
    const panel = mountInfoPanel(aside, REGIONS, vi.fn());
    panel.open();
    aside.querySelector<HTMLButtonElement>('[aria-label="Close information panel"]')?.click();
    expect(panel.isOpen()).toBe(false);
  });
});
