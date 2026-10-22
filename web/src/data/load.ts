import { parseRegions, type RegionsDoc } from './regionsSchema';
import { DataError } from './schema';

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new DataError(`${url}: HTTP ${res.status}`);
  return res;
}

export const getJson = async (url: string): Promise<unknown> => (await fetchOk(url)).json();

export const loadRegions = async (base: string): Promise<RegionsDoc> =>
  parseRegions(await getJson(`${base}data/regions.json`));
