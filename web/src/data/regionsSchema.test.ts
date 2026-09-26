import { expect, it } from 'vitest';
import { parseRegions } from './regionsSchema';

const stats = {
  predMean: 0.5,
  predP90: null,
  fracPredGt05: 0.2,
  refMean: 0.4,
  slopeMeanDeg: 9,
  fracSlopeLt5: 0.1,
  fracSlopeLt8: 0.4,
  fracPsr: 0.05,
  psrDistMean: 1200,
  tmaxMeanK: 210,
};

it('accepts nulls in stats and requires outline points', () => {
  const doc = parseRegions({
    source: 's',
    doi: 'd',
    retrieved: '2026-09-24',
    regions: [
      {
        id: 'haworth',
        name: 'Haworth',
        outline: [
          [1, -87],
          [2, -87],
          [2, -88],
        ],
        centroid: [1.5, -87.5],
        coverage: 1,
        stats,
      },
    ],
  });
  expect(doc.regions[0]?.stats.predP90).toBeNull();
  expect(() => parseRegions({ source: 's', doi: 'd', retrieved: 'x' })).toThrow(/regions/);
});
