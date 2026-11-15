import type { Place } from '../places/types';
import type { LatLng } from '../types';

/** Test helper: a Place with sensible defaults. */
export function makePlace(id: string, location: LatLng, over: Partial<Place> = {}): Place {
  return {
    placeId: id,
    name: id,
    location,
    primaryType: 'gas_station',
    types: ['gas_station'],
    rating: 4.0,
    userRatingCount: 100,
    openNow: true,
    restroom: null,
    servesVegetarianFood: null,
    priceLevel: null,
    fuelPrices: [],
    address: null,
    legToPlace: null,
    legFromPlace: null,
    ...over,
  };
}
