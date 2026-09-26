import { DEG } from './constants';

export type Pole = 'north' | 'south';

export interface PsParams {
  lat0: number;
  k0: number;
  falseEasting: number;
  falseNorthing: number;
  radius: number;
}

const isSouth = (p: PsParams): boolean => p.lat0 < 0;

export function psForward(latDeg: number, lonDeg: number, p: PsParams): { x: number; y: number } {
  const rho = 2 * p.radius * p.k0 * Math.tan(Math.PI / 4 - (Math.abs(latDeg) * DEG) / 2);
  const lon = lonDeg * DEG;
  const x = p.falseEasting + rho * Math.sin(lon);
  const y = isSouth(p) ? p.falseNorthing + rho * Math.cos(lon) : p.falseNorthing - rho * Math.cos(lon);
  return { x, y };
}

export function psInverse(x: number, y: number, p: PsParams): { lat: number; lon: number } {
  const south = isSouth(p);
  const dx = x - p.falseEasting;
  const dy = y - p.falseNorthing;
  const c = 2 * Math.atan(Math.hypot(dx, dy) / (2 * p.radius * p.k0));
  const latAbs = 90 - c / DEG;
  const lon = Math.atan2(dx, south ? dy : -dy) / DEG;
  return { lat: south ? -latAbs : latAbs, lon };
}
