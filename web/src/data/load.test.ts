import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadRegions } from './load';
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

it('loads all nine real regions', async () => {
  const doc = await loadRegions('/');
  expect(doc.doi).toBe('10.5066/P1MEQ6UK');
  expect(doc.regions).toHaveLength(9);
});

it('reports missing files as DataError with the url', async () => {
  await expect(loadRegions('/nowhere/')).rejects.toThrow(DataError);
  await expect(loadRegions('/nowhere/')).rejects.toThrow(/nowhere\/data\/regions\.json: HTTP 404/);
});
