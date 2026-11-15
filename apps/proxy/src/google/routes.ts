import { googlePost, parseDurationS, type FetchFn } from './client';

export const COMPUTE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
export const ROUTE_FIELD_MASK = [
  'routes.distanceMeters',
  'routes.duration',
  'routes.polyline.encodedPolyline',
  'routes.viewport',
  'routes.legs.distanceMeters',
  'routes.legs.duration',
].join(',');

export interface Waypoint {
  latitude?: number;
  longitude?: number;
  placeId?: string;
}

export interface RouteRequest {
  origin: Waypoint;
  destination: Waypoint;
  intermediates: Waypoint[];
  travelMode: 'DRIVE' | 'TWO_WHEELER';
}

export interface RouteResult {
  distanceMeters: number;
  durationS: number;
  encodedPolyline: string;
  legs: { distanceMeters: number; durationS: number }[];
  viewport: { low: { latitude: number; longitude: number }; high: { latitude: number; longitude: number } } | null;
}

const toGoogleWaypoint = (w: Waypoint) =>
  w.placeId ? { placeId: w.placeId } : { location: { latLng: { latitude: w.latitude, longitude: w.longitude } } };

interface GoogleRoutesResponse {
  routes?: {
    distanceMeters?: number;
    duration?: string;
    polyline?: { encodedPolyline?: string };
    viewport?: RouteResult['viewport'];
    legs?: { distanceMeters?: number; duration?: string }[];
  }[];
}

export async function computeRoute(fetchFn: FetchFn, apiKey: string, req: RouteRequest): Promise<RouteResult | null> {
  const body = {
    origin: toGoogleWaypoint(req.origin),
    destination: toGoogleWaypoint(req.destination),
    intermediates: req.intermediates.map(toGoogleWaypoint),
    travelMode: req.travelMode,
    routingPreference: 'TRAFFIC_AWARE',
    computeAlternativeRoutes: false,
    languageCode: 'en-IN',
    regionCode: 'IN',
    units: 'METRIC',
  };
  const res = await googlePost<GoogleRoutesResponse>(fetchFn, apiKey, COMPUTE_ROUTES_URL, ROUTE_FIELD_MASK, body);
  const r = res.routes?.[0];
  if (!r?.polyline?.encodedPolyline) return null;
  return {
    distanceMeters: r.distanceMeters ?? 0,
    durationS: parseDurationS(r.duration),
    encodedPolyline: r.polyline.encodedPolyline,
    legs: (r.legs ?? []).map((l) => ({ distanceMeters: l.distanceMeters ?? 0, durationS: parseDurationS(l.duration) })),
    viewport: r.viewport ?? null,
  };
}
