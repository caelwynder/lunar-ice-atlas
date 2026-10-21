import type { Region } from '../data/regionsSchema';

export const region = (id: string, predMean: number | null, outline?: [number, number][]): Region => ({
  id,
  name: id,
  outline: outline ?? [
    [0, -89],
    [1, -89],
    [1, -88],
  ],
  centroid: [0.5, -88.5],
  coverage: 1,
  stats: {
    predMean,
    predP90: null,
    fracPredGt05: null,
    refMean: null,
    slopeMeanDeg: null,
    fracSlopeLt5: null,
    fracSlopeLt8: null,
    fracPsr: null,
    psrDistMean: null,
    tmaxMeanK: null,
  },
});
