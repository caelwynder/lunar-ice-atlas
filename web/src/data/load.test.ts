import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadGlobe, loadPole, loadRegions } from './load';
import { DataError } from './schema';

const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));

async function serveFromDisk(url: string): Promise<Response> {
  try {
    return new Response(await readFile(PUBLIC + url.replace(/^\//, '')));
  } catch {
    return new Response(null, { status: 404 });
  }
}

beforeEach(() => vi.stubGlobal('fetch', vi.fn(serveFromDisk)));
afterEach(() => vi.unstubAllGlobals());

it('loads the real south pole export with a value grid per valued layer', async () => {
  const south = await loadPole('/', 'south');
  expect(south.meta.pole).toBe('south');
  expect(Object.keys(south.values).sort()).toEqual(['err', 'pred', 'ref']);
  expect(south.heights.width).toBe(south.meta.mesh.width);
  const pred = south.values.pred?.sample(0.5, 0.5);
  expect(pred).not.toBeNull();
  expect(pred).toBeGreaterThanOrEqual(0);
  expect(pred).toBeLessThanOrEqual(1);
  expect(south.url('pred.webp')).toBe('/data/south/pred.webp');
});

it('loads the real globe with heights in metres', async () => {
  const globe = await loadGlobe('/');
  expect([globe.heights.width, globe.heights.height]).toEqual([1440, 720]);
  const h = globe.heights.sample(0.5, 0.5);
  expect(Math.abs(h ?? Infinity)).toBeLessThan(11_000);
});

it('loads all nine real regions', async () => {
  const doc = await loadRegions('/');
  expect(doc.doi).toBe('10.5066/P1MEQ6UK');
  expect(doc.regions).toHaveLength(9);
});

it('reports missing files as DataError with the url', async () => {
  await expect(loadPole('/nowhere/', 'north')).rejects.toThrow(DataError);
  await expect(loadPole('/nowhere/', 'north')).rejects.toThrow(/nowhere\/data\/north\/meta\.json: HTTP 404/);
});
