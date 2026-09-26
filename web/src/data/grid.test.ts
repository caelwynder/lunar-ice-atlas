import { expect, it } from 'vitest';
import { ValueGrid, decodeU8 } from './grid';

const g = new ValueGrid(2, 2, Uint8Array.from([0, 254, 255, 127]), decodeU8(0, 1));

it('samples nearest with v=0 at the top row', () => {
  expect(g.sample(0.1, 0.1)).toBe(0);
  expect(g.sample(0.9, 0.1)).toBe(1);
  expect(g.sample(0.1, 0.9)).toBeNull();
  expect(g.sample(0.9, 0.9)).toBeCloseTo(0.5, 2);
});

it('returns null outside [0,1] and rejects wrong sizes', () => {
  expect(g.sample(-0.01, 0.5)).toBeNull();
  expect(() => new ValueGrid(3, 3, new Uint8Array(4), decodeU8(0, 1))).toThrow(/grid size/);
});

it('bilinear falls back to nearest next to nodata', () => {
  expect(g.bilinear(0.25, 0.75)).toBeNull();
  const full = new ValueGrid(2, 1, Uint8Array.from([0, 254]), decodeU8(0, 1));
  expect(full.bilinear(0.5, 0.5)).toBeCloseTo(0.5, 6);
});

it('bilinear can wrap horizontally so both edges blend the first and last columns', () => {
  const ring = new ValueGrid(2, 1, Uint8Array.from([0, 254]), decodeU8(0, 10));
  expect(ring.bilinear(0, 0.5, true)).toBeCloseTo(5, 6);
  expect(ring.bilinear(1, 0.5, true)).toBeCloseTo(5, 6);
  expect(ring.bilinear(0.25, 0.5, true)).toBeCloseTo(0, 6);
});
