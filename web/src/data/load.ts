import type { Pole } from '../geo/polarStereo';
import { ValueGrid, decodeI16, decodeU8 } from './grid';
import { parseRegions, type RegionsDoc } from './regionsSchema';
import { DataError, parseGlobeMeta, parsePoleMeta, type GlobeMeta, type PoleMeta } from './schema';

export interface LoadedPole {
  meta: PoleMeta;
  heights: ValueGrid;
  values: Record<string, ValueGrid>;
  url(file: string): string;
}
export interface LoadedGlobe {
  meta: GlobeMeta;
  heights: ValueGrid;
  url(file: string): string;
}

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new DataError(`${url}: HTTP ${res.status}`);
  return res;
}
const getJson = async (url: string): Promise<unknown> => (await fetchOk(url)).json();
const getBytes = async (url: string): Promise<ArrayBuffer> => (await fetchOk(url)).arrayBuffer();

// .i16.bin files are written little-endian by the pipeline; every supported browser is little-endian.
export async function loadPole(base: string, pole: Pole): Promise<LoadedPole> {
  const url = (file: string): string => `${base}data/${pole}/${file}`;
  const meta = parsePoleMeta(await getJson(url('meta.json')));
  const { width, height, file } = meta.mesh;
  const heights = new ValueGrid(width, height, new Int16Array(await getBytes(url(file))), decodeI16);
  const valued = meta.layers.flatMap((l) => (l.values ? [{ id: l.id, v: l.values }] : []));
  const grids = await Promise.all(
    valued.map(async ({ id, v }) => {
      const data = new Uint8Array(await getBytes(url(v.file)));
      return [id, new ValueGrid(width, height, data, decodeU8(v.min, v.max))] as const;
    }),
  );
  return { meta, heights, values: Object.fromEntries(grids), url };
}

export async function loadGlobe(base: string): Promise<LoadedGlobe> {
  const url = (file: string): string => `${base}data/globe/${file}`;
  const meta = parseGlobeMeta(await getJson(url('meta.json')));
  const data = new Int16Array(await getBytes(url(meta.height.file)));
  return { meta, heights: new ValueGrid(meta.height.width, meta.height.height, data, decodeI16), url };
}

export const loadRegions = async (base: string): Promise<RegionsDoc> =>
  parseRegions(await getJson(`${base}data/regions.json`));
