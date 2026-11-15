import type { LatLng, Place } from '@roadtrip/core';
import { env } from '@/config/env';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export type TravelMode = 'DRIVE' | 'TWO_WHEELER';
export type Waypoint = LatLng | { placeId: string };

export interface RouteResult {
  distanceMeters: number;
  durationS: number;
  encodedPolyline: string;
  legs: { distanceMeters: number; durationS: number }[];
}

export interface DestinationResult {
  placeId: string;
  name: string;
  address: string | null;
  location: LatLng;
}

export type AlongRouteCategory = 'petrol' | 'restroom' | 'restaurant';

async function post<T>(path: string, body: unknown, timeoutMs = 15_000): Promise<T> {
  if (!env.proxyUrl) throw new ApiError('Proxy URL is not set (EXPO_PUBLIC_PROXY_URL).', 'NOT_CONFIGURED');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${env.proxyUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Secret': env.proxySecret },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    throw new ApiError(aborted ? 'The server took too long to respond.' : 'No internet connection, or the server is unreachable.', aborted ? 'TIMEOUT' : 'OFFLINE');
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json().catch(() => null)) as ({ error?: { code?: string; message?: string } } & T) | null;
  if (!res.ok) {
    const code = json?.error?.code ?? `HTTP_${res.status}`;
    const message =
      code === 'UNAUTHORIZED'
        ? 'The app secret does not match the proxy (EXPO_PUBLIC_PROXY_SECRET).'
        : code === 'RATE_LIMITED'
          ? 'Too many requests — try again in a minute.'
          : (json?.error?.message ?? `Server error (${res.status}).`);
    throw new ApiError(message, code);
  }
  if (json === null) throw new ApiError('Unexpected response from the server.', 'BAD_RESPONSE');
  return json;
}

export const api = {
  route: (args: { origin: Waypoint; destination: Waypoint; intermediates: Waypoint[]; travelMode: TravelMode }) =>
    post<{ route: RouteResult | null }>('/v1/route', args).then((r) => r.route),

  alongRoute: (args: {
    category: AlongRouteCategory;
    encodedPolyline: string;
    origin: LatLng | null;
    openNow?: boolean;
    pageToken?: string | null;
    travelMode: TravelMode;
  }) => post<{ places: Place[]; nextPageToken: string | null }>('/v1/along-route', args),

  nearbyFuel: (args: { latitude: number; longitude: number; radiusM: number; maxResults?: number }) =>
    post<{ places: Place[] }>('/v1/nearby-fuel', args).then((r) => r.places),

  destinations: (query: string, near: LatLng | null) =>
    post<{ results: DestinationResult[] }>('/v1/destinations', { query, near }).then((r) => r.results),
};

export const errorMessage = (e: unknown): string =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong.';
