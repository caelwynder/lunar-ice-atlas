import { expect, it } from 'vitest';
import { formatReadout } from './readout';

it('formats coordinates, elevation and layer values', () => {
  const lines = formatReadout({
    lat: -89.66,
    lon: 129.2,
    elevationM: -2210,
    pole: 'south',
    values: { pred: 0.8123, ref: null },
  });
  expect(lines).toEqual(['89.66°S, 129.20°E', 'Elevation −2,210 m', 'Predicted 0.81', 'Reference —']);
});

it('omits elevation when unknown', () => {
  expect(formatReadout({ lat: 10, lon: -20, elevationM: null, pole: null, values: {} })).toEqual(['10.00°N, 20.00°W']);
});

it('never shows a negative zero after rounding', () => {
  const lines = formatReadout({ lat: -89.9, lon: 0, elevationM: -0.4, pole: 'south', values: { err: -0.0016 } });
  expect(lines).toEqual(['89.90°S, 0.00°E', 'Elevation 0 m', 'Model − reference 0.00']);
});
