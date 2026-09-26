import { DataError, arr, num, obj, str } from './schema';

export const STAT_KEYS = [
  'predMean',
  'predP90',
  'fracPredGt05',
  'refMean',
  'slopeMeanDeg',
  'fracSlopeLt5',
  'fracSlopeLt8',
  'fracPsr',
  'psrDistMean',
  'tmaxMeanK',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type RegionStats = Record<StatKey, number | null>;
export interface Region {
  id: string;
  name: string;
  outline: [number, number][];
  centroid: [number, number];
  coverage: number;
  stats: RegionStats;
}
export interface RegionsDoc {
  source: string;
  doi: string;
  retrieved: string;
  regions: Region[];
}

const pair = (v: unknown, path: string): [number, number] => {
  const a = arr(v, path);
  if (a.length < 2) throw new DataError(`${path}: expected [lon, lat]`);
  return [num(a[0], `${path}[0]`), num(a[1], `${path}[1]`)];
};

function parseStats(v: unknown, path: string): RegionStats {
  const o = obj(v, path);
  const entries = STAT_KEYS.map((k) => [k, o[k] === null ? null : num(o[k], `${path}.${k}`)] as const);
  return Object.fromEntries(entries) as RegionStats;
}

function parseRegion(v: unknown, path: string): Region {
  const o = obj(v, path);
  const outline = arr(o.outline, `${path}.outline`).map((p, i) => pair(p, `${path}.outline[${i}]`));
  if (outline.length < 3) throw new DataError(`${path}.outline: expected ≥3 points`);
  return {
    id: str(o.id, `${path}.id`),
    name: str(o.name, `${path}.name`),
    outline,
    centroid: pair(o.centroid, `${path}.centroid`),
    coverage: num(o.coverage, `${path}.coverage`),
    stats: parseStats(o.stats, `${path}.stats`),
  };
}

export function parseRegions(json: unknown): RegionsDoc {
  const o = obj(json, 'regions.json');
  return {
    source: str(o.source, 'source'),
    doi: str(o.doi, 'doi'),
    retrieved: str(o.retrieved, 'retrieved'),
    regions: arr(o.regions, 'regions').map((r, i) => parseRegion(r, `regions[${i}]`)),
  };
}
