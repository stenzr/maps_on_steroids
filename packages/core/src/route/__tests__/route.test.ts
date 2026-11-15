import { destinationPoint } from '../../geo/bearing';
import { PUNE_NASHIK_WAYPOINTS } from '../../sim/fixtures/puneNashik';
import { makePlace } from '../../testing/placeFixture';
import { detourMinutes, placesAlongRoute, progressOnRoute } from '../alongRoute';
import { googleMapsNavigationUrl } from '../deepLink';
import { buildRouteGeometry, projectOntoRoute, routeWindows, sliceRoute } from '../routeGeometry';

const START = { latitude: 18.6, longitude: 73.85 };
// 100 km due north, a point every 1 km
const line = buildRouteGeometry(Array.from({ length: 101 }, (_, i) => destinationPoint(START, 0, i * 1000)));

describe('route geometry', () => {
  it('cumulative length', () => {
    expect(line.lengthM).toBeCloseTo(100_000, -1);
  });

  it('projects a point beside the road', () => {
    const p = destinationPoint(destinationPoint(START, 0, 42_500), 90, 300);
    const r = projectOntoRoute(line, p)!;
    expect(r.alongM).toBeCloseTo(42_500, -1);
    expect(r.offsetM).toBeCloseTo(300, -1);
  });

  it('clamps to the ends', () => {
    expect(projectOntoRoute(line, destinationPoint(START, 180, 5000))!.alongM).toBe(0);
  });

  it('restricts the search with a hint window', () => {
    // A route that goes north 10 km then comes back south along the same road.
    const there = Array.from({ length: 11 }, (_, i) => destinationPoint(START, 0, i * 1000));
    const back = [...there].reverse().slice(1).map((p) => destinationPoint(p, 90, 20));
    const loop = buildRouteGeometry([...there, ...back]);
    const p = destinationPoint(START, 0, 3000);
    expect(projectOntoRoute(loop, p)!.alongM).toBeCloseTo(3000, -1);
    expect(projectOntoRoute(loop, p, { hintAlongM: 17_000, windowM: 2000 })!.alongM).toBeCloseTo(17_000, -2);
  });

  it('windows and slices', () => {
    expect(routeWindows(line, 10_000, 250_000, 40_000)).toEqual([
      [10_000, 50_000],
      [50_000, 90_000],
      [90_000, line.lengthM],
    ]);
    expect(sliceRoute(line, 9_500, 20_500)).toHaveLength(11);
  });
});

describe('placesAlongRoute', () => {
  const progress = { alongM: 20_000, remainingDurationS: 80 * 60 };
  const at = (km: number, offsetM = 100) => destinationPoint(destinationPoint(START, 0, km * 1000), 90, offsetM);

  it('sorts by distance ahead along the route, drops places behind and far off', () => {
    const items = placesAlongRoute(
      line,
      [
        makePlace('far-ahead', at(80)),
        makePlace('near-ahead', at(30)),
        makePlace('behind', at(5)),
        makePlace('off-route', at(50, 8000)),
        makePlace('near-ahead', at(30)), // duplicate
      ],
      progress,
    );
    expect(items.map((i) => i.place.placeId)).toEqual(['near-ahead', 'far-ahead']);
    expect(items[0]!.aheadKm).toBeCloseTo(10, 1);
  });

  it('uses Google legs for detour when available', () => {
    const p = makePlace('x', at(30), {
      legToPlace: { durationS: 15 * 60, distanceM: 10_000 },
      legFromPlace: { durationS: 70 * 60, distanceM: 70_000 },
    });
    expect(detourMinutes(p, 100, progress)).toEqual({ minutes: 5, fromGoogle: true });
  });

  it('estimates detour from the offset otherwise', () => {
    const d = detourMinutes(makePlace('x', at(30)), 700, progress);
    expect(d.fromGoogle).toBe(false);
    expect(d.minutes).toBeCloseTo(2 * 700 / 7 / 60 + 1);
  });

  it('progress on route scales remaining duration', () => {
    const r = progressOnRoute(line, 7200, destinationPoint(START, 0, 25_000));
    expect(r.alongM).toBeCloseTo(25_000, -1);
    expect(r.remainingDurationS).toBeCloseTo(5400, -1);
  });

  it('works on the Pune → Nashik test route', () => {
    const route = buildRouteGeometry(PUNE_NASHIK_WAYPOINTS);
    const chakan = { latitude: 18.7601, longitude: 73.8622 };
    const sangamner = { latitude: 19.57, longitude: 74.21 };
    const items = placesAlongRoute(route, [makePlace('sangamner', sangamner), makePlace('chakan', chakan)], {
      alongM: 0,
      remainingDurationS: 4 * 3600,
    });
    expect(items.map((i) => i.place.placeId)).toEqual(['chakan', 'sangamner']);
  });
});

/** Minimal query parser so core tests don't depend on DOM/Node URL types. */
function parseUrl(url: string): { base: string; get: (k: string) => string | null } {
  const [base, query = ''] = url.split('?');
  const params = new Map(query.split('&').map((kv) => kv.split('=').map(decodeURIComponent) as [string, string]));
  return { base: base!, get: (k) => params.get(k) ?? null };
}

describe('googleMapsNavigationUrl', () => {
  it('builds a navigate URL with waypoint place ids', () => {
    const url = googleMapsNavigationUrl({
      origin: { latitude: 18.5308, longitude: 73.8475 },
      destination: { location: { latitude: 19.999, longitude: 73.79 }, placeId: 'NASHIK' },
      waypoints: [{ location: { latitude: 18.76, longitude: 73.86 }, placeId: 'PUMP1' }],
    });
    const u = parseUrl(url);
    expect(u.base).toBe('https://www.google.com/maps/dir/');
    expect(u.get('api')).toBe('1');
    expect(u.get('dir_action')).toBe('navigate');
    expect(u.get('travelmode')).toBe('driving');
    expect(u.get('destination')).toBe('19.999000,73.790000');
    expect(u.get('destination_place_id')).toBe('NASHIK');
    expect(u.get('waypoints')).toBe('18.760000,73.860000');
    expect(u.get('waypoint_place_ids')).toBe('PUMP1');
  });

  it('omits waypoint_place_ids unless every waypoint has one', () => {
    const u = parseUrl(
      googleMapsNavigationUrl({
        destination: { location: { latitude: 1, longitude: 2 } },
        waypoints: [{ location: { latitude: 3, longitude: 4 }, placeId: 'A' }, { location: { latitude: 5, longitude: 6 } }],
      }),
    );
    expect(u.get('waypoint_place_ids')).toBeNull();
    expect(u.get('origin')).toBeNull();
  });
});
