// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { region } from './__testutils__';
import { METRICS, type Metric, renderRegionChart, renderRegionTable } from './regionChart';

const regions = [region('a', 0.9), region('b', 0.5), region('c', null)];
const firstMetric = (): Metric => {
  const m = METRICS[0];
  if (!m) throw new Error('no metrics');
  return m;
};

it('draws one bar per non-null region and marks the selection twice', () => {
  const svg = renderRegionChart(regions, firstMetric(), 'b');
  expect(svg.querySelectorAll('rect.bar')).toHaveLength(2);
  expect(svg.querySelector('[data-id="c"]')?.textContent).toContain('no data');
  expect(svg.querySelector('[data-id="b"] text.name')?.getAttribute('font-weight')).toBe('700');
  expect(svg.querySelector('[data-id="b"] rect.bar')?.getAttribute('fill')).toBe('#cde2fb');
  expect(svg.querySelector('[data-id="a"]')?.getAttribute('aria-label')).toBe('a: 0.90');
});

it('table view carries the same values', () => {
  const table = renderRegionTable(regions);
  expect(table.querySelectorAll('tbody tr')).toHaveLength(3);
  expect(table.textContent).toContain('0.90');
});
