import type { FetchFn } from '../google/client';
import { alongRouteFieldMask, normalizePlace } from '../google/places';
import { buildServer } from '../server';

const SECRET = 'test-secret-0123456789abcdef';
const config = { googleApiKey: 'server-key', sharedSecret: SECRET, port: 0, rateLimitPerMinute: 1000 };
const headers = { 'x-app-secret': SECRET };

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function mockFetch(responder: (call: Call) => { status?: number; json: unknown }): { fetchFn: FetchFn; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    const call = { url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> };
    calls.push(call);
    const r = responder(call);
    const status = r.status ?? 200;
    return { ok: status < 400, status, json: async () => r.json };
  };
  return { fetchFn, calls };
}

const ROUTE_JSON = {
  routes: [
    {
      distanceMeters: 210_000,
      duration: '14400s',
      polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC' },
      legs: [{ distanceMeters: 210_000, duration: '14400s' }],
      viewport: { low: { latitude: 18.5, longitude: 73.7 }, high: { latitude: 20, longitude: 74.3 } },
    },
  ],
};

describe('POST /v1/route', () => {
  it('calls computeRoutes with key + field mask and normalises durations; caches identical requests', async () => {
    const { fetchFn, calls } = mockFetch(() => ({ json: ROUTE_JSON }));
    const app = await buildServer(config, { fetchFn });
    const payload = {
      origin: { latitude: 18.5308, longitude: 73.8475 },
      destination: { latitude: 19.999, longitude: 73.79 },
      intermediates: [{ placeId: 'PUMP' }],
    };
    const res = await app.inject({ method: 'POST', url: '/v1/route', headers, payload });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.route).toMatchObject({ distanceMeters: 210_000, durationS: 14_400, encodedPolyline: '_p~iF~ps|U_ulLnnqC' });
    expect(body.cached).toBe(false);

    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(c.headers['X-Goog-Api-Key']).toBe('server-key');
    expect(c.headers['X-Goog-FieldMask']).toContain('routes.polyline.encodedPolyline');
    expect(c.body.travelMode).toBe('DRIVE');
    expect(c.body.intermediates).toEqual([{ placeId: 'PUMP' }]);
    expect(c.body.origin).toEqual({ location: { latLng: { latitude: 18.5308, longitude: 73.8475 } } });

    const again = await app.inject({ method: 'POST', url: '/v1/route', headers, payload });
    expect(again.json().cached).toBe(true);
    expect(calls).toHaveLength(1);
    await app.close();
  });

  it('validates input', async () => {
    const { fetchFn } = mockFetch(() => ({ json: ROUTE_JSON }));
    const app = await buildServer(config, { fetchFn });
    const res = await app.inject({ method: 'POST', url: '/v1/route', headers, payload: { origin: { latitude: 200, longitude: 0 } } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_REQUEST');
    await app.close();
  });

  it('maps Google errors to clear messages', async () => {
    const { fetchFn } = mockFetch(() => ({ status: 403, json: { error: { message: 'API key not valid' } } }));
    const app = await buildServer(config, { fetchFn });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/route',
      headers,
      payload: { origin: { latitude: 18.5, longitude: 73.8 }, destination: { latitude: 19.9, longitude: 73.7 } },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toEqual({ code: 'UPSTREAM_AUTH', message: expect.stringMatching(/rejected the server API key/) });
    await app.close();
  });

  it('reports a missing server key', async () => {
    const { fetchFn } = mockFetch(() => ({ json: ROUTE_JSON }));
    const app = await buildServer({ ...config, googleApiKey: '' }, { fetchFn });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/route',
      headers,
      payload: { origin: { latitude: 18.5, longitude: 73.8 }, destination: { latitude: 19.9, longitude: 73.7 } },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('NOT_CONFIGURED');
    await app.close();
  });
});

describe('POST /v1/along-route', () => {
  it('sends a search-along-route Text Search with routing origin and per-category field mask', async () => {
    const { fetchFn, calls } = mockFetch(() => ({
      json: {
        places: [
          {
            id: 'P1',
            displayName: { text: 'HP Petrol Pump Chakan' },
            location: { latitude: 18.76, longitude: 73.86 },
            primaryType: 'gas_station',
            types: ['gas_station', 'point_of_interest'],
            rating: 4.1,
            userRatingCount: 220,
            currentOpeningHours: { openNow: true },
            restroom: true,
            fuelOptions: { fuelPrices: [{ type: 'REGULAR_UNLEADED', price: { currencyCode: 'INR', units: '104', nanos: 210000000 }, updateTime: '2026-11-14T00:00:00Z' }] },
          },
          { displayName: { text: 'no id — dropped' } },
        ],
        routingSummaries: [{ legs: [{ duration: '1500s', distanceMeters: 25_000 }, { duration: '12000s', distanceMeters: 185_000 }] }, {}],
        nextPageToken: 'NEXT',
      },
    }));
    const app = await buildServer(config, { fetchFn });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/along-route',
      headers,
      payload: { category: 'petrol', encodedPolyline: 'abc', origin: { latitude: 18.53, longitude: 73.84 }, openNow: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.nextPageToken).toBe('NEXT');
    expect(body.places).toHaveLength(1);
    expect(body.places[0]).toMatchObject({
      placeId: 'P1',
      name: 'HP Petrol Pump Chakan',
      openNow: true,
      restroom: true,
      fuelPrices: [{ type: 'REGULAR_UNLEADED', price: 104.21, currency: 'INR' }],
      legToPlace: { durationS: 1500, distanceM: 25_000 },
      legFromPlace: { durationS: 12_000, distanceM: 185_000 },
    });

    const c = calls[0]!;
    expect(c.url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(c.body).toMatchObject({
      textQuery: 'petrol pump',
      includedType: 'gas_station',
      strictTypeFiltering: true,
      openNow: true,
      searchAlongRouteParameters: { polyline: { encodedPolyline: 'abc' } },
      routingParameters: { origin: { latitude: 18.53, longitude: 73.84 }, travelMode: 'DRIVE' },
    });
    expect(c.headers['X-Goog-FieldMask']).toBe(alongRouteFieldMask('petrol'));
    await app.close();
  });

  it('restroom search uses the public_bathroom type and doesn\'t request fuel fields', () => {
    const mask = alongRouteFieldMask('restroom');
    expect(mask).toContain('places.restroom');
    expect(mask).not.toContain('fuelOptions');
    expect(mask).toContain('routingSummaries');
    expect(alongRouteFieldMask('restaurant')).toContain('places.servesVegetarianFood');
  });
});

describe('POST /v1/nearby-fuel and /v1/destinations', () => {
  it('nearby search ranks by distance with a circle restriction', async () => {
    const { fetchFn, calls } = mockFetch(() => ({ json: { places: [] } }));
    const app = await buildServer(config, { fetchFn });
    const res = await app.inject({ method: 'POST', url: '/v1/nearby-fuel', headers, payload: { latitude: 18.6, longitude: 73.8, radiusM: 100 } });
    expect(res.statusCode).toBe(200);
    expect(calls[0]!.url).toBe('https://places.googleapis.com/v1/places:searchNearby');
    expect(calls[0]!.body).toMatchObject({
      includedTypes: ['gas_station'],
      rankPreference: 'DISTANCE',
      locationRestriction: { circle: { center: { latitude: 18.6, longitude: 73.8 }, radius: 100 } },
    });
    await app.close();
  });

  it('destination search returns compact results', async () => {
    const { fetchFn } = mockFetch(() => ({
      json: { places: [{ id: 'N', displayName: { text: 'Nashik' }, formattedAddress: 'Nashik, Maharashtra', location: { latitude: 19.99, longitude: 73.79 } }] },
    }));
    const app = await buildServer(config, { fetchFn });
    const res = await app.inject({ method: 'POST', url: '/v1/destinations', headers, payload: { query: 'Nashik' } });
    expect(res.json().results).toEqual([
      { placeId: 'N', name: 'Nashik', address: 'Nashik, Maharashtra', location: { latitude: 19.99, longitude: 73.79 } },
    ]);
    await app.close();
  });
});

describe('normalizePlace', () => {
  it('maps price level enums and missing fields to null', () => {
    const p = normalizePlace({ id: 'x', location: { latitude: 1, longitude: 2 }, priceLevel: 'PRICE_LEVEL_MODERATE' })!;
    expect(p.priceLevel).toBe('MODERATE');
    expect(p.openNow).toBeNull();
    expect(p.restroom).toBeNull();
    expect(p.legToPlace).toBeNull();
  });
});
