import type { LoadedPole } from '../data/load';
import type { Pole } from '../geo/polarStereo';
import { psForward } from '../geo/polarStereo';
import { vec3ToLatLon } from '../geo/sphere';

export interface PickValues {
  uv: [number, number] | null;
  values: Record<string, number | null>;
  elevationM: number | null;
}
export interface PickResult {
  lat: number;
  lon: number;
  elevationM: number | null;
  pole: Pole | null;
  values: Record<string, number | null>;
}

const EMPTY: PickValues = { uv: null, values: {}, elevationM: null };

export function lookupValues(pole: LoadedPole, lat: number, lon: number): PickValues {
  const { meta } = pole;
  const sameHemisphere = meta.crs.lat0 < 0 ? lat < 0 : lat > 0;
  if (!sameHemisphere || Math.abs(lat) < meta.edgeLatDeg) return EMPTY;
  const { x, y } = psForward(lat, lon, meta.crs);
  const span = meta.grid.width * meta.grid.pixelSize;
  const u = (x - meta.grid.x0) / span;
  const v = (meta.grid.y0 - y) / span; // top-down, matching ValueGrid rows
  if (u < 0 || u > 1 || v < 0 || v > 1) return EMPTY;
  const values = Object.fromEntries(Object.entries(pole.values).map(([id, g]) => [id, g.sample(u, v)]));
  return { uv: [u, v], values, elevationM: pole.heights.sample(u, v) };
}

type Vec3 = [number, number, number];
const REFINE_STEPS = 6;

function raySphere(o: Vec3, d: Vec3, r: number): number | null {
  const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
  const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

/** Nearest hit of a ray (unit direction) on the height-displaced sphere, by refining the sphere radius. */
export function raySurface(
  origin: Vec3,
  dir: Vec3,
  heightAt: (lat: number, lon: number) => number,
  scale: number,
): { lat: number; lon: number; r: number } | null {
  let r = 1;
  let hit: { lat: number; lon: number; r: number } | null = null;
  for (let i = 0; i < REFINE_STEPS; i++) {
    const t = raySphere(origin, dir, r);
    if (t === null) return hit;
    const p: Vec3 = [origin[0] + t * dir[0], origin[1] + t * dir[1], origin[2] + t * dir[2]];
    const { lat, lon } = vec3ToLatLon(...p);
    hit = { lat, lon, r };
    r = 1 + heightAt(lat, lon) * scale;
  }
  return hit === null ? null : { ...hit, r };
}
