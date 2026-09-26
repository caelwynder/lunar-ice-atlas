import { expect, it } from 'vitest';
import { latLonToVec3, vec3ToLatLon } from './sphere';

it('puts +90 lat on +y and lon 90E on -z', () => {
  const [x, y, z] = latLonToVec3(90, 0, 1);
  expect(x).toBeCloseTo(0, 12);
  expect(y).toBeCloseTo(1, 12);
  expect(z).toBeCloseTo(0, 12);
  expect(latLonToVec3(0, 90, 1)[2]).toBeCloseTo(-1, 12);
});

it('round-trips', () => {
  const [x, y, z] = latLonToVec3(-84.2, 60.7, 2.5);
  const back = vec3ToLatLon(x, y, z);
  expect(back.lat).toBeCloseTo(-84.2, 10);
  expect(back.lon).toBeCloseTo(60.7, 10);
  expect(back.r).toBeCloseTo(2.5, 12);
});
