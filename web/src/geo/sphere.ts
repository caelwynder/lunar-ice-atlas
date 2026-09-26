import { DEG } from './constants';

export function latLonToVec3(latDeg: number, lonDeg: number, r: number): [number, number, number] {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  return [r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), -r * Math.cos(lat) * Math.sin(lon)];
}

export function vec3ToLatLon(x: number, y: number, z: number): { lat: number; lon: number; r: number } {
  const r = Math.hypot(x, y, z);
  return { lat: Math.asin(y / r) / DEG, lon: Math.atan2(-z, x) / DEG, r };
}
