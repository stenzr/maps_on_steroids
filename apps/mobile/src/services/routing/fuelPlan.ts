import { planFuelStops, progressOnRoute, type FuelPlan, type LatLng, type RangeEstimate, type Vehicle } from '@roadtrip/core';
import { itemsAheadOf, type ActiveRoute } from '@/state/routeStore';
import type { AlongRouteItem } from '@roadtrip/core';

export interface FuelPlanResult {
  plan: FuelPlan;
  remainingKm: number;
  stations: AlongRouteItem[];
}

/** Fuel stop plan for the active route given current range. Null without a route or range. */
export function computeFuelPlan(args: {
  route: ActiveRoute | null;
  petrol: { items: AlongRouteItem[]; fromAlongM: number; state?: { status: string } };
  position: LatLng | null;
  range: RangeEstimate | null;
  vehicle: Vehicle | null;
}): FuelPlanResult | null {
  const { route, range, vehicle, position } = args;
  if (!route || !range || range.rangeKm === null || !vehicle) return null;
  const progress = progressOnRoute(route.geometry, route.result.durationS, position);
  const remainingKm = Math.max(0, (route.geometry.lengthM - progress.alongM) / 1000);
  const stations = itemsAheadOf(args.petrol.items, route.geometry, position, args.petrol.fromAlongM);
  const plan = planFuelStops({
    stations,
    rangeKm: range.rangeKm,
    reserveKm: range.reserveQuantity * range.kmPerUnit,
    fullTankRangeKm: vehicle.tankCapacity * range.kmPerUnit,
    remainingKm,
  });
  // Don't claim "no pump reachable" before the petrol search has actually finished.
  const ready = !args.petrol.state || args.petrol.state.status === 'ready';
  return { plan: ready ? plan : { ...plan, warning: null }, remainingKm, stations };
}
