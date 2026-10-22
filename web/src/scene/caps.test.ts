import { describe, expect, it } from 'vitest';
import { makeCap } from './caps';

const COS12 = Math.cos((12 * Math.PI) / 180);

function yOverR(pole: 'north' | 'south'): number[] {
  const pos = makeCap(pole, 12).hit.geometry.getAttribute('position');
  return Array.from({ length: pos.count }, (_, i) => pos.getY(i) / Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i)));
}

describe('makeCap', () => {
  it('keeps every north cap vertex within 12° of the pole', () => {
    expect(Math.min(...yOverR('north'))).toBeGreaterThanOrEqual(COS12 - 1e-6);
  });

  it('keeps every south cap vertex within 12° of the pole', () => {
    expect(Math.max(...yOverR('south'))).toBeLessThanOrEqual(-COS12 + 1e-6);
  });

  it('tags the hit mesh with its pole for picking', () => {
    expect(makeCap('south', 12).hit.userData['pole']).toBe('south');
  });
});
