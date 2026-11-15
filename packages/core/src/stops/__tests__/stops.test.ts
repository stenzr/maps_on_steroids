import { destinationPoint } from '../../geo/bearing';
import type { AlongRouteItem } from '../../route/alongRoute';
import { makePlace } from '../../testing/placeFixture';
import { planBreaks } from '../breakPlanner';
import { evaluateFuelAlerts, initialFuelAlertState } from '../fuelAlerts';
import { planFuelStops, scoreStation } from '../fuelStopPlanner';
import { rankNearbyStations } from '../nearbyFuel';
import { DEFAULT_RESTAURANT_FILTERS, filterRestaurants, restroomItems } from '../placeFilters';
import type { Place } from '../../places/types';

const O = { latitude: 18.6, longitude: 73.85 };
const item = (id: string, aheadKm: number, over: Partial<Place> = {}, detourMin = 2): AlongRouteItem => ({
  place: makePlace(id, O, over),
  aheadKm,
  detourMin,
  detourFromGoogle: true,
  offsetM: 100,
});

describe('planFuelStops', () => {
  const base = { reserveKm: 30, fullTankRangeKm: 600, remainingKm: 500 };

  it('no stop needed when range minus reserve covers the trip', () => {
    expect(planFuelStops({ ...base, stations: [item('a', 50)], rangeKm: 600 }).noStopNeeded).toBe(true);
  });

  it('prefers a station at 60–85% of range', () => {
    const plan = planFuelStops({
      ...base,
      rangeKm: 200,
      stations: [item('early', 30), item('sweet', 150), item('late', 135, { openNow: false })],
    });
    expect(plan.stops[0]!.item.place.placeId).toBe('sweet');
    expect(plan.stops[0]!.arrivalRangeKm).toBe(50);
  });

  it('never picks a station that would mean arriving below reserve', () => {
    const plan = planFuelStops({ ...base, rangeKm: 200, stations: [item('a', 50), item('beyond-reserve', 180)] });
    expect(plan.stops[0]!.item.place.placeId).toBe('a');
    for (const s of plan.stops) expect(s.arrivalRangeKm).toBeGreaterThanOrEqual(base.reserveKm);
  });

  it('skips closed stations and trades off detour and rating', () => {
    const plan = planFuelStops({
      ...base,
      rangeKm: 200,
      stations: [
        item('closed', 140, { openNow: false }),
        item('big-detour', 140, {}, 25),
        item('good', 130, { rating: 4.6, userRatingCount: 300 }),
      ],
    });
    expect(plan.stops[0]!.item.place.placeId).toBe('good');
  });

  it('plans multiple stops on a long route', () => {
    const stations = Array.from({ length: 20 }, (_, i) => item(`s${i}`, 50 + i * 50));
    const plan = planFuelStops({ reserveKm: 50, fullTankRangeKm: 400, remainingKm: 1000, rangeKm: 300, stations });
    expect(plan.stops.length).toBeGreaterThanOrEqual(2);
    let pos = 0;
    let range = 300;
    for (const s of plan.stops) {
      expect(s.item.aheadKm - pos).toBeLessThanOrEqual(range - 50);
      pos = s.item.aheadKm;
      range = 400;
    }
    expect(1000 - pos).toBeLessThanOrEqual(400 - 50);
  });

  it('warns when nothing is reachable', () => {
    const plan = planFuelStops({ ...base, rangeKm: 100, stations: [item('far', 90)] });
    expect(plan.warning).toBe('none-reachable');
    expect(plan.stops).toEqual([]);
  });

  it('scoreStation penalises closed hours', () => {
    expect(scoreStation(item('a', 140), 200)).toBeGreaterThan(scoreStation(item('b', 140, { openNow: false }), 200));
  });
});

describe('rankNearbyStations', () => {
  it('prefers stations ahead over closer ones behind', () => {
    const ahead = makePlace('ahead', destinationPoint(O, 0, 3000));
    const behind = makePlace('behind', destinationPoint(O, 180, 2000));
    const closed = makePlace('closed', destinationPoint(O, 0, 500), { openNow: false });
    const r = rankNearbyStations([behind, ahead, closed], O, 0);
    expect(r.map((s) => s.place.placeId)).toEqual(['ahead', 'behind']);
    expect(r[1]!.ahead).toBe(false);
  });

  it('pure distance without a heading', () => {
    const a = makePlace('a', destinationPoint(O, 0, 3000));
    const b = makePlace('b', destinationPoint(O, 180, 2000));
    expect(rankNearbyStations([a, b], O, null).map((s) => s.place.placeId)).toEqual(['b', 'a']);
  });
});

describe('evaluateFuelAlerts', () => {
  const stop = { id: 'p1', name: 'HP Chakan', distanceKm: 80 };

  it('alerts once when range < 2× distance to next pump, once at reserve, re-arms after refuel', () => {
    let s = initialFuelAlertState();
    let r = evaluateFuelAlerts(s, { rangeKm: 200, quantity: 20, atReserve: false, nextStop: stop });
    expect(r.alerts).toEqual([]);
    s = r.state;
    r = evaluateFuelAlerts(s, { rangeKm: 150, quantity: 15, atReserve: false, nextStop: stop });
    expect(r.alerts.map((a) => a.kind)).toEqual(['approaching-stop']);
    s = r.state;
    r = evaluateFuelAlerts(s, { rangeKm: 140, quantity: 14, atReserve: false, nextStop: stop });
    expect(r.alerts).toEqual([]);
    s = r.state;
    r = evaluateFuelAlerts(s, { rangeKm: 60, quantity: 5, atReserve: true, nextStop: stop });
    expect(r.alerts.map((a) => a.kind)).toEqual(['reserve']);
    s = r.state;
    r = evaluateFuelAlerts(s, { rangeKm: 55, quantity: 4.5, atReserve: true, nextStop: stop });
    expect(r.alerts).toEqual([]);
    s = r.state;
    // refuel
    r = evaluateFuelAlerts(s, { rangeKm: 600, quantity: 37, atReserve: false, nextStop: null });
    expect(r.state.warnedReserve).toBe(false);
    expect(r.state.warnedForStopId).toBeNull();
  });
});

describe('restaurant filters and restrooms', () => {
  const items = [
    item('veg', 10, { primaryType: 'restaurant', types: ['restaurant'], servesVegetarianFood: true, rating: 4.4, priceLevel: 'INEXPENSIVE' }),
    item('closed', 12, { primaryType: 'restaurant', types: ['restaurant'], openNow: false }),
    item('pricey', 20, { primaryType: 'restaurant', types: ['restaurant'], priceLevel: 'EXPENSIVE', rating: 4.7 }),
    item('far', 120, { primaryType: 'restaurant', types: ['restaurant'] }),
    item('detour', 30, { primaryType: 'cafe', types: ['cafe'] }, 25),
  ];

  it('default: open now, ≤ 15 min detour', () => {
    expect(filterRestaurants(items, DEFAULT_RESTAURANT_FILTERS).map((i) => i.place.placeId)).toEqual(['veg', 'pricey', 'far']);
  });

  it('veg, rating, price and distance', () => {
    const f = { ...DEFAULT_RESTAURANT_FILTERS, vegetarianOnly: true };
    expect(filterRestaurants(items, f).map((i) => i.place.placeId)).toEqual(['veg']);
    const g = { ...DEFAULT_RESTAURANT_FILTERS, minRating: 4.5 };
    expect(filterRestaurants(items, g).map((i) => i.place.placeId)).toEqual(['pricey']);
    const h = { ...DEFAULT_RESTAURANT_FILTERS, maxPriceLevel: 'MODERATE' as const, withinKm: 100 };
    expect(filterRestaurants(items, h).map((i) => i.place.placeId)).toEqual(['veg']);
  });

  it('labels restroom evidence', () => {
    const r = restroomItems([
      item('toilet', 5, { primaryType: 'public_bathroom', types: ['public_bathroom'] }),
      item('dhaba', 6, { primaryType: 'restaurant', types: ['restaurant'], restroom: true }),
      item('pump', 7),
      item('pump-no', 8, { restroom: false }),
      item('cafe-unknown', 9, { primaryType: 'cafe', types: ['cafe'] }),
    ]);
    expect(r.map((i) => [i.place.placeId, i.evidence])).toEqual([
      ['toilet', 'public'],
      ['dhaba', 'reported'],
      ['pump', 'likely'],
    ]);
    expect(restroomItems([item('pump', 7)], false)).toEqual([]);
  });
});

describe('planBreaks', () => {
  it('suggests a food + restroom stop near every 2 h of driving', () => {
    const food = (id: string, km: number, over: Partial<Place> = {}) =>
      item(id, km, { primaryType: 'restaurant', types: ['restaurant'], restroom: true, ...over });
    const breaks = planBreaks({
      candidates: [food('h1', 115), food('h1-better', 125, { rating: 4.6 }), food('no-restroom', 120, { restroom: false }), food('h2', 240)],
      remainingKm: 300,
      remainingDurationS: 5 * 3600, // 60 km/h → targets at 120 km and 240 km
      everyHours: 2,
    });
    expect(breaks.map((b) => b.targetKm)).toEqual([120, 240]);
    expect(breaks[0]!.item!.place.placeId).toBe('h1-better');
    expect(breaks[1]!.item!.place.placeId).toBe('h2');
  });

  it('returns null items when nothing fits', () => {
    const breaks = planBreaks({ candidates: [], remainingKm: 300, remainingDurationS: 5 * 3600, everyHours: 2 });
    expect(breaks).toHaveLength(2);
    expect(breaks.every((b) => b.item === null)).toBe(true);
  });
});
