import { expect, it } from 'vitest';
import { DataError, parseGlobeMeta, parsePoleMeta } from './schema';

const valid = {
  version: 1,
  pole: 'south',
  crs: { lat0: -90, k0: 0.994, falseEasting: 500000, falseNorthing: 500000, radius: 1737400 },
  grid: { x0: 197863.76, y0: 802136.24, pixelSize: 238.56, width: 2560, height: 2560 },
  mesh: { file: 'height.i16.bin', width: 640, height: 640, stride: 4, units: 'm' },
  base: { file: 'hillshade.jpg' },
  edgeLatDeg: 80,
  layers: [
    {
      id: 'pred',
      label: 'x',
      texture: 'pred.webp',
      values: { file: 'pred.u8.bin', min: 0, max: 1 },
      legend: { kind: 'sequential', stops: ['#184f95', '#cde2fb'], min: 0, max: 1 },
    },
    { id: 'psr', label: 'PSR', texture: 'psr.webp', legend: { kind: 'binary', stops: ['#9ec5f4'] } },
  ],
};

it('accepts the v1 contract', () => {
  const meta = parsePoleMeta(valid);
  expect(meta.layers.map((l) => l.id)).toEqual(['pred', 'psr']);
  expect(meta.layers[1]?.values).toBeUndefined();
});

it('rejects wrong version and missing fields with a clear path', () => {
  expect(() => parsePoleMeta({ ...valid, version: 2 })).toThrow(DataError);
  expect(() => parsePoleMeta({ ...valid, mesh: undefined })).toThrow(/meta\.mesh/);
  expect(() =>
    parsePoleMeta({ ...valid, layers: [{ ...valid.layers[0], legend: { kind: 'rainbow', stops: [] } }] }),
  ).toThrow(/legend\.kind/);
});

it('parses globe meta', () => {
  const g = parseGlobeMeta({
    version: 1,
    height: { file: 'h.bin', width: 1440, height: 720, units: 'm' },
    color: { hi: 'a.jpg', lo: 'b.jpg' },
  });
  expect(g.height.width).toBe(1440);
});
