import { describe, expect, it } from 'vitest';
import { makeStars } from './stars';

const seeded = (seed: number) => (): number => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

describe('makeStars', () => {
  const { points } = makeStars(500, seeded(7));
  const attr = (name: string): Float32Array => points.geometry.getAttribute(name).array as Float32Array;

  it('places every star on a shell between radius 40 and 60', () => {
    const pos = attr('position');
    expect(pos.length).toBe(1500);
    for (let i = 0; i < 500; i++) {
      const r = Math.hypot(pos[i * 3] ?? 0, pos[i * 3 + 1] ?? 0, pos[i * 3 + 2] ?? 0);
      expect(r).toBeGreaterThanOrEqual(40 - 1e-4);
      expect(r).toBeLessThanOrEqual(60 + 1e-4);
    }
  });

  it('keeps brightness in [0.6, 1] and twinkle speed in [0.3, 1.2]', () => {
    expect(Math.min(...attr('aBright'))).toBeGreaterThanOrEqual(0.6);
    expect(Math.max(...attr('aBright'))).toBeLessThanOrEqual(1);
    expect(Math.min(...attr('aSpeed'))).toBeGreaterThanOrEqual(0.3);
    expect(Math.max(...attr('aSpeed'))).toBeLessThanOrEqual(1.2);
  });
});
