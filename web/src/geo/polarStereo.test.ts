import { describe, expect, it } from 'vitest';
import fixtures from './__fixtures__/ps_points.json';
import { psForward, psInverse, type PsParams } from './polarStereo';

const params = (pole: string): PsParams => ({
  lat0: pole === 'north' ? 90 : -90,
  k0: 0.994,
  falseEasting: 500000,
  falseNorthing: 500000,
  radius: 1737400,
});

describe('polar stereographic', () => {
  it.each(fixtures)('matches pyproj for $pole $lat,$lon', ({ pole, lat, lon, x, y }) => {
    const out = psForward(lat, lon, params(pole));
    expect(out.x).toBeCloseTo(x, 3);
    expect(out.y).toBeCloseTo(y, 3);
  });

  it.each(fixtures.filter((f) => Math.abs(f.lat) < 90))('round-trips $pole $lat,$lon', ({ pole, lat, lon }) => {
    const p = params(pole);
    const { x, y } = psForward(lat, lon, p);
    const back = psInverse(x, y, p);
    expect(back.lat).toBeCloseTo(lat, 9);
    expect(back.lon).toBeCloseTo(lon, 9);
  });
});
