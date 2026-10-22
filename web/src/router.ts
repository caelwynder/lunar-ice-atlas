import type { Pole } from './geo/polarStereo';

export type Route = { view: 'moon' } | { view: 'map'; pole: Pole };

const MAP_ROUTE = /^#\/(north|south)\/?$/;

export function parseRoute(hash: string): Route {
  const match = MAP_ROUTE.exec(hash);
  return match ? { view: 'map', pole: match[1] as Pole } : { view: 'moon' };
}

export const routeHash = (route: Route): string => (route.view === 'map' ? `#/${route.pole}` : '#/');

export function onRoute(apply: (route: Route) => void): () => void {
  const handler = (): void => apply(parseRoute(location.hash));
  window.addEventListener('hashchange', handler);
  handler();
  return () => window.removeEventListener('hashchange', handler);
}
