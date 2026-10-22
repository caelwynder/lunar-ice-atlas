import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMapsMeta } from './mapsSchema';
import { DataError } from './schema';

const real = (pole: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(process.cwd(), `public/data/maps/${pole}/meta.json`), 'utf8')) as Record<
    string,
    unknown
  >;

describe('parseMapsMeta', () => {
  it('parses the real south meta with nine projected regions', () => {
    const meta = parseMapsMeta(real('south'));
    expect(meta.pole).toBe('south');
    expect(meta.size).toBe(1600);
    expect(meta.regions).toHaveLength(9);
    expect(meta.styles).toEqual(['a', 'b', 'd']);
    expect(meta.themes).toEqual(['dark', 'moon']);
  });

  it('parses the real north meta with no regions', () => {
    const meta = parseMapsMeta(real('north'));
    expect(meta.regions).toEqual([]);
    expect(meta.stats.fracGe04).toBeGreaterThan(0);
  });

  it('rejects a meta without a size', () => {
    const bad = { ...real('north') };
    delete bad['size'];
    expect(() => parseMapsMeta(bad)).toThrow(DataError);
  });

  it('rejects a region whose px is not an array', () => {
    const south = real('south');
    const regions = (south['regions'] as Record<string, unknown>[]).map((r) => ({ ...r, px: 'nope' }));
    expect(() => parseMapsMeta({ ...south, regions })).toThrow(/regions\[0\]\.px/);
  });

  it('rejects an unknown pole', () => {
    expect(() => parseMapsMeta({ ...real('north'), pole: 'east' })).toThrow(DataError);
  });
});
