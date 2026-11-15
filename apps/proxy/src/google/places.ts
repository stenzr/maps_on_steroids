import type { FuelPrice, Place, PriceLevel } from '@roadtrip/core';
import { googlePost, parseDurationS, type FetchFn } from './client';

export const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
export const NEARBY_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchNearby';

/** Fields every list needs. */
const BASE_FIELDS = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.primaryType',
  'places.types',
  'places.rating',
  'places.userRatingCount',
  'places.currentOpeningHours.openNow',
  'places.formattedAddress',
];

/** Extra (pricier) fields only where a tab actually uses them. */
export const CATEGORY_FIELDS = {
  petrol: ['places.fuelOptions', 'places.restroom'],
  restroom: ['places.restroom'],
  restaurant: ['places.restroom', 'places.servesVegetarianFood', 'places.priceLevel'],
} as const;

export type SearchCategory = keyof typeof CATEGORY_FIELDS;

/**
 * Text query + type per category. For restrooms we search public toilets here; the app adds
 * petrol pumps and restaurants that report `restroom: true` from the other two searches.
 */
export const CATEGORY_QUERY: Record<SearchCategory, { textQuery: string; includedType: string }> = {
  petrol: { textQuery: 'petrol pump', includedType: 'gas_station' },
  restroom: { textQuery: 'public toilet', includedType: 'public_bathroom' },
  restaurant: { textQuery: 'restaurant', includedType: 'restaurant' },
};

export function alongRouteFieldMask(category: SearchCategory): string {
  return [...BASE_FIELDS, ...CATEGORY_FIELDS[category], 'routingSummaries', 'nextPageToken'].join(',');
}

export const NEARBY_FUEL_FIELD_MASK = [...BASE_FIELDS, 'places.fuelOptions'].join(',');
export const DESTINATION_FIELD_MASK = ['places.id', 'places.displayName', 'places.formattedAddress', 'places.location'].join(',');

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  currentOpeningHours?: { openNow?: boolean };
  formattedAddress?: string;
  restroom?: boolean;
  servesVegetarianFood?: boolean;
  priceLevel?: string;
  fuelOptions?: { fuelPrices?: { type?: string; price?: { currencyCode?: string; units?: string; nanos?: number }; updateTime?: string }[] };
}

interface GoogleRoutingSummary {
  legs?: { duration?: string; distanceMeters?: number }[];
}

export interface GoogleSearchResponse {
  places?: GooglePlace[];
  routingSummaries?: GoogleRoutingSummary[];
  nextPageToken?: string;
}

const PRICE_LEVELS: Record<string, PriceLevel> = {
  PRICE_LEVEL_FREE: 'FREE',
  PRICE_LEVEL_INEXPENSIVE: 'INEXPENSIVE',
  PRICE_LEVEL_MODERATE: 'MODERATE',
  PRICE_LEVEL_EXPENSIVE: 'EXPENSIVE',
  PRICE_LEVEL_VERY_EXPENSIVE: 'VERY_EXPENSIVE',
};

function fuelPrices(p: GooglePlace): FuelPrice[] {
  return (p.fuelOptions?.fuelPrices ?? [])
    .filter((f) => f.type && f.price)
    .map((f) => ({
      type: f.type!,
      price: Number(f.price!.units ?? 0) + (f.price!.nanos ?? 0) / 1e9,
      currency: f.price!.currencyCode ?? 'INR',
      updatedAt: f.updateTime ?? null,
    }));
}

const leg = (l: { duration?: string; distanceMeters?: number } | undefined) =>
  l ? { durationS: parseDurationS(l.duration), distanceM: l.distanceMeters ?? 0 } : null;

/** Google Place (New) + optional routing summary → our Place. Drops entries without id/location. */
export function normalizePlace(p: GooglePlace, summary?: GoogleRoutingSummary): Place | null {
  if (!p.id || p.location?.latitude === undefined || p.location.longitude === undefined) return null;
  return {
    placeId: p.id,
    name: p.displayName?.text ?? 'Unnamed place',
    location: { latitude: p.location.latitude, longitude: p.location.longitude },
    primaryType: p.primaryType ?? null,
    types: p.types ?? [],
    rating: p.rating ?? null,
    userRatingCount: p.userRatingCount ?? null,
    openNow: p.currentOpeningHours?.openNow ?? null,
    restroom: p.restroom ?? null,
    servesVegetarianFood: p.servesVegetarianFood ?? null,
    priceLevel: p.priceLevel ? (PRICE_LEVELS[p.priceLevel] ?? null) : null,
    fuelPrices: fuelPrices(p),
    address: p.formattedAddress ?? null,
    legToPlace: leg(summary?.legs?.[0]),
    legFromPlace: leg(summary?.legs?.[1]),
  };
}

export function normalizeSearch(res: GoogleSearchResponse): { places: Place[]; nextPageToken: string | null } {
  const places: Place[] = [];
  (res.places ?? []).forEach((p, i) => {
    const n = normalizePlace(p, res.routingSummaries?.[i]);
    if (n) places.push(n);
  });
  return { places, nextPageToken: res.nextPageToken ?? null };
}

export interface AlongRouteRequest {
  category: SearchCategory;
  encodedPolyline: string;
  origin: { latitude: number; longitude: number } | null;
  openNow: boolean;
  pageToken: string | null;
  travelMode: 'DRIVE' | 'TWO_WHEELER';
}

/** Places Text Search restricted to a route (searchAlongRouteParameters). */
export async function searchAlongRoute(fetchFn: FetchFn, apiKey: string, req: AlongRouteRequest) {
  const q = CATEGORY_QUERY[req.category];
  const body: Record<string, unknown> = {
    textQuery: q.textQuery,
    includedType: q.includedType,
    strictTypeFiltering: true,
    pageSize: 20,
    languageCode: 'en',
    regionCode: 'IN',
    searchAlongRouteParameters: { polyline: { encodedPolyline: req.encodedPolyline } },
  };
  if (req.openNow) body.openNow = true;
  if (req.pageToken) body.pageToken = req.pageToken;
  // routingSummaries need routingParameters.origin (or the polyline); the origin makes
  // legs[0] = current position → place.
  if (req.origin) body.routingParameters = { origin: req.origin, travelMode: req.travelMode };
  const res = await googlePost<GoogleSearchResponse>(fetchFn, apiKey, TEXT_SEARCH_URL, alongRouteFieldMask(req.category), body);
  return normalizeSearch(res);
}

export async function searchNearbyFuel(
  fetchFn: FetchFn,
  apiKey: string,
  req: { latitude: number; longitude: number; radiusM: number; maxResults: number },
) {
  const body = {
    includedTypes: ['gas_station'],
    maxResultCount: req.maxResults,
    rankPreference: 'DISTANCE',
    languageCode: 'en',
    regionCode: 'IN',
    locationRestriction: { circle: { center: { latitude: req.latitude, longitude: req.longitude }, radius: req.radiusM } },
  };
  const res = await googlePost<GoogleSearchResponse>(fetchFn, apiKey, NEARBY_SEARCH_URL, NEARBY_FUEL_FIELD_MASK, body);
  return normalizeSearch(res);
}

/** Destination search bar: one Text Search on submit (not per keystroke), biased to the user. */
export async function searchDestination(
  fetchFn: FetchFn,
  apiKey: string,
  req: { query: string; near: { latitude: number; longitude: number } | null },
) {
  const body: Record<string, unknown> = { textQuery: req.query, pageSize: 8, languageCode: 'en', regionCode: 'IN' };
  if (req.near) body.locationBias = { circle: { center: req.near, radius: 50_000 } };
  const res = await googlePost<GoogleSearchResponse>(fetchFn, apiKey, TEXT_SEARCH_URL, DESTINATION_FIELD_MASK, body);
  return normalizeSearch(res).places.map((p) => ({ placeId: p.placeId, name: p.name, address: p.address, location: p.location }));
}
