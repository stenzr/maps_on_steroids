import type { LatLng } from '../types';

export type PriceLevel = 'FREE' | 'INEXPENSIVE' | 'MODERATE' | 'EXPENSIVE' | 'VERY_EXPENSIVE';
export const PRICE_LEVEL_ORDER: readonly PriceLevel[] = ['FREE', 'INEXPENSIVE', 'MODERATE', 'EXPENSIVE', 'VERY_EXPENSIVE'];

export interface FuelPrice {
  /** Google FuelType enum, e.g. REGULAR_UNLEADED, DIESEL, PREMIUM, LPG, METHANE. */
  type: string;
  /** Price per litre outside the US (per kg for METHANE/CNG in practice). */
  price: number;
  currency: string;
  updatedAt: string | null;
}

/**
 * A place as the proxy returns it (normalised from Places API (New)). Session-only:
 * apart from `placeId`, Google content must not be stored long-term.
 */
export interface Place {
  placeId: string;
  name: string;
  location: LatLng;
  primaryType: string | null;
  types: string[];
  rating: number | null;
  userRatingCount: number | null;
  openNow: boolean | null;
  /** Google's `restroom` attribute; null = not reported. */
  restroom: boolean | null;
  servesVegetarianFood: boolean | null;
  priceLevel: PriceLevel | null;
  fuelPrices: FuelPrice[];
  address: string | null;
  /** From routingSummaries when searched along a route: drive from current position → place. */
  legToPlace: { durationS: number; distanceM: number } | null;
  /** place → destination, when Google returns a second leg. */
  legFromPlace: { durationS: number; distanceM: number } | null;
}

export type PlaceCategory = 'petrol' | 'restroom' | 'restaurant';

export const GAS_STATION_TYPES = ['gas_station'];
export const PUBLIC_RESTROOM_TYPES = ['public_bathroom', 'rest_stop', 'truck_stop'];
export const FOOD_TYPES = ['restaurant', 'cafe', 'food_court', 'meal_takeaway', 'fast_food_restaurant', 'vegetarian_restaurant'];

export const hasType = (p: Place, types: readonly string[]): boolean =>
  (p.primaryType !== null && types.includes(p.primaryType)) || p.types.some((t) => types.includes(t));

export const isGasStation = (p: Place): boolean => hasType(p, GAS_STATION_TYPES);
export const isFoodPlace = (p: Place): boolean => hasType(p, FOOD_TYPES);

/**
 * How we know a place has a restroom:
 * - 'public': a public toilet / rest stop / truck stop (by place type).
 * - 'reported': Google reports `restroom: true` for a petrol pump, restaurant or café.
 * - 'likely': a petrol pump with no restroom data. Most Indian highway pumps have one, but it's a guess.
 */
export type RestroomEvidence = 'public' | 'reported' | 'likely';

export function restroomEvidence(p: Place): RestroomEvidence | null {
  if (hasType(p, PUBLIC_RESTROOM_TYPES)) return 'public';
  if (p.restroom === true) return 'reported';
  if (p.restroom === null && isGasStation(p)) return 'likely';
  return null;
}

export const RESTROOM_LABEL: Record<RestroomEvidence, string> = {
  public: 'Public restroom',
  reported: 'Restroom (Google)',
  likely: 'Petrol pump · restroom likely',
};
