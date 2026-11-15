import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TtlCache } from '../cache';
import type { FetchFn } from '../google/client';
import { searchAlongRoute, searchDestination, searchNearbyFuel } from '../google/places';
import { computeRoute, type RouteResult } from '../google/routes';

const LatLng = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
const Waypoint = z.union([
  z.object({ placeId: z.string().min(1).max(300) }),
  LatLng,
]);
const TravelMode = z.enum(['DRIVE', 'TWO_WHEELER']).default('DRIVE');

const RouteBody = z.object({
  origin: Waypoint,
  destination: Waypoint,
  intermediates: z.array(Waypoint).max(10).default([]),
  travelMode: TravelMode,
});

const AlongRouteBody = z.object({
  category: z.enum(['petrol', 'restroom', 'restaurant']),
  encodedPolyline: z.string().min(2).max(200_000),
  origin: LatLng.nullable().default(null),
  openNow: z.boolean().default(false),
  pageToken: z.string().max(2000).nullable().default(null),
  travelMode: TravelMode,
});

const NearbyBody = LatLng.extend({
  radiusM: z.number().positive().max(50_000).default(5000),
  maxResults: z.number().int().min(1).max(20).default(20),
});

const DestinationBody = z.object({ query: z.string().trim().min(2).max(200), near: LatLng.nullable().default(null) });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    throw Object.assign(new Error(msg), { statusCode: 400, code: 'INVALID_REQUEST' });
  }
  return r.data;
}

export function registerApiRoutes(app: FastifyInstance, deps: { fetchFn: FetchFn; apiKey: string }): void {
  const { fetchFn, apiKey } = deps;
  const routeCache = new TtlCache<RouteResult | null>(10 * 60_000, 200);

  app.post('/v1/route', async (req) => {
    const body = parse(RouteBody, req.body);
    const key = JSON.stringify(body);
    const cached = routeCache.get(key);
    if (cached !== undefined) return { route: cached, cached: true };
    const route = await computeRoute(fetchFn, apiKey, {
      origin: body.origin,
      destination: body.destination,
      intermediates: body.intermediates,
      travelMode: body.travelMode,
    });
    routeCache.set(key, route);
    return { route, cached: false };
  });

  app.post('/v1/along-route', async (req) => {
    const body = parse(AlongRouteBody, req.body);
    return searchAlongRoute(fetchFn, apiKey, body);
  });

  app.post('/v1/nearby-fuel', async (req) => {
    const body = parse(NearbyBody, req.body);
    return searchNearbyFuel(fetchFn, apiKey, body);
  });

  app.post('/v1/destinations', async (req) => {
    const body = parse(DestinationBody, req.body);
    return { results: await searchDestination(fetchFn, apiKey, body) };
  });
}
