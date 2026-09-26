import type { Pole, PsParams } from '../geo/polarStereo';

export class DataError extends Error {}

export type LegendKind = 'sequential' | 'diverging' | 'binary' | 'outline';
export interface Legend {
  kind: LegendKind;
  stops: string[];
  min?: number;
  max?: number;
}
export interface LayerMeta {
  id: string;
  label: string;
  texture: string;
  legend: Legend;
  values?: { file: string; min: number; max: number };
}
export interface PoleMeta {
  version: 1;
  pole: Pole;
  crs: PsParams;
  grid: { x0: number; y0: number; pixelSize: number; width: number; height: number };
  mesh: { file: string; width: number; height: number; stride: number; units: 'm' };
  base: { file: string };
  edgeLatDeg: number;
  layers: LayerMeta[];
}
export interface GlobeMeta {
  version: 1;
  height: { file: string; width: number; height: number; units: 'm' };
  color: { hi: string; lo: string };
}

type Obj = Record<string, unknown>;
const KINDS: readonly LegendKind[] = ['sequential', 'diverging', 'binary', 'outline'];

export const obj = (v: unknown, path: string): Obj => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new DataError(`${path}: expected object`);
  return v as Obj;
};
export const num = (v: unknown, path: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new DataError(`${path}: expected number`);
  return v;
};
export const str = (v: unknown, path: string): string => {
  if (typeof v !== 'string' || v.length === 0) throw new DataError(`${path}: expected string`);
  return v;
};
export const arr = (v: unknown, path: string): unknown[] => {
  if (!Array.isArray(v)) throw new DataError(`${path}: expected array`);
  return v;
};
const optNum = (v: unknown, path: string): number | undefined => (v === undefined ? undefined : num(v, path));

function parseLegend(v: unknown, path: string): Legend {
  const o = obj(v, path);
  const kind = str(o.kind, `${path}.kind`) as LegendKind;
  if (!KINDS.includes(kind)) throw new DataError(`${path}.kind: unknown "${kind}"`);
  const stops = arr(o.stops, `${path}.stops`).map((s, i) => str(s, `${path}.stops[${i}]`));
  return { kind, stops, min: optNum(o.min, `${path}.min`), max: optNum(o.max, `${path}.max`) };
}

function parseLayer(v: unknown, path: string): LayerMeta {
  const o = obj(v, path);
  const layer: LayerMeta = {
    id: str(o.id, `${path}.id`),
    label: str(o.label, `${path}.label`),
    texture: str(o.texture, `${path}.texture`),
    legend: parseLegend(o.legend, `${path}.legend`),
  };
  if (o.values === undefined) return layer;
  const val = obj(o.values, `${path}.values`);
  return {
    ...layer,
    values: {
      file: str(val.file, `${path}.values.file`),
      min: num(val.min, `${path}.values.min`),
      max: num(val.max, `${path}.values.max`),
    },
  };
}

function parseCrs(v: unknown): PsParams {
  const c = obj(v, 'meta.crs');
  return {
    lat0: num(c.lat0, 'meta.crs.lat0'),
    k0: num(c.k0, 'meta.crs.k0'),
    falseEasting: num(c.falseEasting, 'meta.crs.falseEasting'),
    falseNorthing: num(c.falseNorthing, 'meta.crs.falseNorthing'),
    radius: num(c.radius, 'meta.crs.radius'),
  };
}

export function parsePoleMeta(json: unknown): PoleMeta {
  const o = obj(json, 'meta');
  if (o.version !== 1) throw new DataError('meta.version: expected 1');
  const pole = str(o.pole, 'meta.pole');
  if (pole !== 'north' && pole !== 'south') throw new DataError('meta.pole: expected north|south');
  const g = obj(o.grid, 'meta.grid');
  const m = obj(o.mesh, 'meta.mesh');
  return {
    version: 1,
    pole,
    crs: parseCrs(o.crs),
    grid: {
      x0: num(g.x0, 'meta.grid.x0'),
      y0: num(g.y0, 'meta.grid.y0'),
      pixelSize: num(g.pixelSize, 'meta.grid.pixelSize'),
      width: num(g.width, 'meta.grid.width'),
      height: num(g.height, 'meta.grid.height'),
    },
    mesh: {
      file: str(m.file, 'meta.mesh.file'),
      width: num(m.width, 'meta.mesh.width'),
      height: num(m.height, 'meta.mesh.height'),
      stride: num(m.stride, 'meta.mesh.stride'),
      units: 'm',
    },
    base: { file: str(obj(o.base, 'meta.base').file, 'meta.base.file') },
    edgeLatDeg: num(o.edgeLatDeg, 'meta.edgeLatDeg'),
    layers: arr(o.layers, 'meta.layers').map((l, i) => parseLayer(l, `meta.layers[${i}]`)),
  };
}

export function parseGlobeMeta(json: unknown): GlobeMeta {
  const o = obj(json, 'globe');
  if (o.version !== 1) throw new DataError('globe.version: expected 1');
  const h = obj(o.height, 'globe.height');
  const c = obj(o.color, 'globe.color');
  return {
    version: 1,
    height: {
      file: str(h.file, 'globe.height.file'),
      width: num(h.width, 'globe.height.width'),
      height: num(h.height, 'globe.height.height'),
      units: 'm',
    },
    color: { hi: str(c.hi, 'globe.color.hi'), lo: str(c.lo, 'globe.color.lo') },
  };
}
