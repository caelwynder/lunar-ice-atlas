import { describe, expect, it } from 'vitest';
import { scaleFor } from './mapPane';

describe('scaleFor', () => {
  it('picks the longest round distance that fits in under 30% of the pane', () => {
    expect(scaleFor(480, 1)).toEqual({ km: 100, frac: 100 / 480 });
    expect(scaleFor(480, 4).km).toBe(20);
    expect(scaleFor(480, 8).km).toBe(10);
  });

  it('falls back to 1 km on extreme zoom', () => {
    expect(scaleFor(10, 8).km).toBe(1);
  });
});
