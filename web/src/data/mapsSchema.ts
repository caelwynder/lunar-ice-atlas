import type { Pole } from '../geo/polarStereo';
import { fetchOk, getJson } from './load';
import { DataError, arr, num, obj, str } from './schema';

export type MapStyle = 'a' | 'b' | 'd';
export type MapTheme = 'dark' | 'moon';
export type Px = [number, number];

export interface MapsRegion {
  id: string;
  name: string;
  px: Px[];
  centroidPx: Px;
}
export interface MapsStats {
  mean: number;
  fracGe04: number;
  fracGe06: number;
  fracGe08: number;
  coverage: number;
  rmse: number;
}
export interface MapsHeight {
  file: string;
  size: number;
  min: number;
  max: number;
}
export interface MapsMeta {
  pole: Pole;
  size: number;
  hdSize: number;
  kmPerPx: number;
  polePx: Px;
  levels: number[];
  hotspot: number;
  styles: MapStyle[];
  themes: MapTheme[];
  stats: MapsStats;
  height: MapsHeight;
  regions: MapsRegion[];
}

const STYLES: readonly MapStyle[] = ['a', 'b', 'd'];
const THEMES: readonly MapTheme[] = ['dark', 'moon'];

function px(v: unknown, path: string): Px {
  const a = arr(v, path);
  if (a.length !== 2) throw new DataError(`${path}: expected [x, y]`);
  return [num(a[0], `${path}[0]`), num(a[1], `${path}[1]`)];
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], path: string): T {
  const s = str(v, path);
  if (!allowed.includes(s as T)) throw new DataError(`${path}: unknown "${s}"`);
  return s as T;
}

function parseRegion(v: unknown, path: string): MapsRegion {
  const o = obj(v, path);
  return {
    id: str(o['id'], `${path}.id`),
    name: str(o['name'], `${path}.name`),
    px: arr(o['px'], `${path}.px`).map((p, i) => px(p, `${path}.px[${i}]`)),
    centroidPx: px(o['centroidPx'], `${path}.centroidPx`),
  };
}

function parseStats(v: unknown): MapsStats {
  const o = obj(v, 'stats');
  const keys = ['mean', 'fracGe04', 'fracGe06', 'fracGe08', 'coverage', 'rmse'] as const;
  return Object.fromEntries(keys.map((k) => [k, num(o[k], `stats.${k}`)])) as unknown as MapsStats;
}

function parseHeight(v: unknown): MapsHeight {
  const o = obj(v, 'height');
  return {
    file: str(o['file'], 'height.file'),
    size: num(o['size'], 'height.size'),
    min: num(o['min'], 'height.min'),
    max: num(o['max'], 'height.max'),
  };
}

export function parseMapsMeta(json: unknown): MapsMeta {
  const o = obj(json, 'maps meta.json');
  return {
    pole: oneOf(o['pole'], ['north', 'south'] as const, 'pole'),
    size: num(o['size'], 'size'),
    hdSize: num(o['hdSize'], 'hdSize'),
    kmPerPx: num(o['kmPerPx'], 'kmPerPx'),
    polePx: px(o['polePx'], 'polePx'),
    levels: arr(o['levels'], 'levels').map((l, i) => num(l, `levels[${i}]`)),
    hotspot: num(o['hotspot'], 'hotspot'),
    styles: arr(o['styles'], 'styles').map((s, i) => oneOf(s, STYLES, `styles[${i}]`)),
    themes: arr(o['themes'], 'themes').map((t, i) => oneOf(t, THEMES, `themes[${i}]`)),
    stats: parseStats(o['stats']),
    height: parseHeight(o['height']),
    regions: arr(o['regions'], 'regions').map((r, i) => parseRegion(r, `regions[${i}]`)),
  };
}

export const loadMapsMeta = async (base: string, pole: Pole): Promise<MapsMeta> =>
  parseMapsMeta(await getJson(`${base}data/maps/${pole}/meta.json`));

export function parseHeights(buf: ArrayBuffer, size: number): Int16Array {
  if (buf.byteLength !== size * size * 2) throw new DataError(`heights: ${buf.byteLength} bytes, expected ${size}²×2`);
  const view = new DataView(buf);
  return Int16Array.from({ length: size * size }, (_, i) => view.getInt16(i * 2, true));
}

export const loadHeights = async (base: string, meta: MapsMeta): Promise<Int16Array> =>
  parseHeights(
    await (await fetchOk(`${base}data/maps/${meta.pole}/${meta.height.file}`)).arrayBuffer(),
    meta.height.size,
  );
