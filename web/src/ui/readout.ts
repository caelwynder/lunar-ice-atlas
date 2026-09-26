import type { PickResult } from '../scene/picking';

const LABELS: Record<string, string> = { pred: 'Predicted', ref: 'Reference', err: 'Model − reference' };
const MINUS = '−';

/** Round first, then take the sign, so -0.001 shows as 0.00 rather than −0.00 (or 0.00°W). */
const rounded = (v: number, digits: number): number => Number(v.toFixed(digits)) || 0;

const coord = (v: number, pos: string, neg: string): string => {
  const r = rounded(v, 2);
  return `${Math.abs(r).toFixed(2)}°${r >= 0 ? pos : neg}`;
};
const signed = (s: string): string => s.replace('-', MINUS);
const value = (v: number | null): string => (v === null ? '—' : signed(rounded(v, 2).toFixed(2)));

export function formatReadout(p: PickResult): string[] {
  const lines = [`${coord(p.lat, 'N', 'S')}, ${coord(p.lon, 'E', 'W')}`];
  if (p.elevationM !== null) lines.push(`Elevation ${signed(rounded(p.elevationM, 0).toLocaleString('en-US'))} m`);
  return [...lines, ...Object.entries(p.values).map(([id, v]) => `${LABELS[id] ?? id} ${value(v)}`)];
}
