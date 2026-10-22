import { describe, expect, it } from 'vitest';
import { type Route, parseRoute, routeHash } from './router';

describe('parseRoute', () => {
  it.each(['', '#', '#/', '#/mars', '#south', '#/south/extra'])('treats %j as the Moon view', (hash) => {
    expect(parseRoute(hash)).toEqual({ view: 'moon' });
  });

  it.each(['south', 'north'] as const)('opens the %s pole map', (pole) => {
    expect(parseRoute(`#/${pole}`)).toEqual({ view: 'map', pole });
  });

  it('ignores a trailing slash', () => {
    expect(parseRoute('#/north/')).toEqual({ view: 'map', pole: 'north' });
  });
});

describe('routeHash', () => {
  it.each<Route>([{ view: 'moon' }, { view: 'map', pole: 'south' }, { view: 'map', pole: 'north' }])(
    'round-trips %j',
    (route) => {
      expect(parseRoute(routeHash(route))).toEqual(route);
    },
  );
});
