// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { renderLegend } from './legend';

it('renders a gradient with min/mid/max ticks for sequential layers', () => {
  const el = renderLegend({
    id: 'pred',
    label: 'Predicted',
    texture: 'pred.webp',
    legend: { kind: 'sequential', stops: ['#184f95', '#cde2fb'], min: 0, max: 1 },
  });
  expect(el.querySelector<HTMLElement>('.legend-bar')?.style.background).toContain('linear-gradient');
  expect([...el.querySelectorAll('.tick')].map((t) => t.textContent)).toEqual(['0', '0.5', '1']);
});

it('labels diverging poles in words and uses a true minus sign', () => {
  const el = renderLegend({
    id: 'err',
    label: 'Model − reference',
    texture: 'err.webp',
    legend: { kind: 'diverging', stops: ['#f4b3b0', '#383835', '#9ec5f4'], min: -0.2, max: 0.2 },
  });
  expect(el.textContent).toContain('model lower');
  expect(el.textContent).toContain('model higher');
  expect(el.querySelector('.tick')?.textContent).toBe('−0.2');
});

it('marks binary layers as hatched', () => {
  const el = renderLegend({
    id: 'psr',
    label: 'Permanently shadowed regions',
    texture: 'psr.webp',
    legend: { kind: 'binary', stops: ['#9ec5f4'] },
  });
  expect(el.textContent).toContain('(hatched)');
  expect(el.querySelector('.swatch-binary')).not.toBeNull();
});
