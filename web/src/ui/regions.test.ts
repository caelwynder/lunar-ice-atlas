import { expect, it } from 'vitest';
import { region } from './__testutils__';
import { regionAt, sortRegions } from './regions';

it('sorts descending with nulls last and does not mutate input', () => {
  const input = [region('a', 0.2), region('b', null), region('c', 0.9)];
  expect(sortRegions(input, 'predMean').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  expect(input.map((r) => r.id)).toEqual(['a', 'b', 'c']);
});

it('finds the region under a south-polar point, and nothing outside or in the north', () => {
  const square = region('sq', 0.5, [
    [-10, -86],
    [10, -86],
    [10, -87],
    [-10, -87],
  ]);
  const regions = [region('other', 0.1), square];
  expect(regionAt(regions, -86.5, 0)?.id).toBe('sq');
  expect(regionAt(regions, -85, 0)).toBeNull();
  expect(regionAt(regions, 86.5, 0)).toBeNull();
});
