import type { AlongRouteItem } from '../route/alongRoute';
import { PRICE_LEVEL_ORDER, restroomEvidence, type PriceLevel, type RestroomEvidence } from '../places/types';

export interface RestaurantFilters {
  openNow: boolean;
  minRating: number | null;
  vegetarianOnly: boolean;
  /** Highest price level to include. */
  maxPriceLevel: PriceLevel | null;
  withinKm: number | null;
  maxDetourMin: number | null;
}

export const DEFAULT_RESTAURANT_FILTERS: RestaurantFilters = {
  openNow: true,
  minRating: null,
  vegetarianOnly: false,
  maxPriceLevel: null,
  withinKm: null,
  maxDetourMin: 15,
};

export function filterRestaurants(items: readonly AlongRouteItem[], f: RestaurantFilters): AlongRouteItem[] {
  const maxIdx = f.maxPriceLevel ? PRICE_LEVEL_ORDER.indexOf(f.maxPriceLevel) : null;
  return items.filter(({ place, aheadKm, detourMin }) => {
    if (f.openNow && place.openNow === false) return false;
    if (f.minRating !== null && (place.rating ?? 0) < f.minRating) return false;
    // Only exclude places Google says aren't vegetarian-friendly, or don't report it.
    if (f.vegetarianOnly && place.servesVegetarianFood !== true) return false;
    if (maxIdx !== null && place.priceLevel && PRICE_LEVEL_ORDER.indexOf(place.priceLevel) > maxIdx) return false;
    if (f.withinKm !== null && aheadKm > f.withinKm) return false;
    if (f.maxDetourMin !== null && detourMin > f.maxDetourMin) return false;
    return true;
  });
}

export interface RestroomItem extends AlongRouteItem {
  evidence: RestroomEvidence;
}

/** Restroom tab: public toilets plus places where Google reports (or we infer) a restroom, labelled. */
export function restroomItems(items: readonly AlongRouteItem[], includeLikely = true): RestroomItem[] {
  const out: RestroomItem[] = [];
  for (const it of items) {
    const evidence = restroomEvidence(it.place);
    if (!evidence || (evidence === 'likely' && !includeLikely)) continue;
    out.push({ ...it, evidence });
  }
  return out;
}
