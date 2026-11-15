export interface FuelAlertState {
  /** Station placeId we've already warned about ("range < 2× distance to next pump"). */
  warnedForStopId: string | null;
  warnedReserve: boolean;
  /** Fuel quantity last time we checked; a rise means a refuel and resets the alerts. */
  lastQuantity: number | null;
}

export const initialFuelAlertState = (): FuelAlertState => ({ warnedForStopId: null, warnedReserve: false, lastQuantity: null });

export type FuelAlert =
  | { kind: 'approaching-stop'; stopId: string; stopName: string; distanceKm: number; rangeKm: number }
  | { kind: 'reserve'; rangeKm: number };

export interface FuelAlertInput {
  rangeKm: number | null;
  quantity: number | null;
  atReserve: boolean;
  nextStop: { id: string; name: string; distanceKm: number } | null;
}

/**
 * Notify once when range < 2× the distance to the next suggested pump, and once more at
 * reserve. Both re-arm after a refuel.
 */
export function evaluateFuelAlerts(state: FuelAlertState, input: FuelAlertInput): { state: FuelAlertState; alerts: FuelAlert[] } {
  let s = { ...state };
  if (input.quantity !== null && s.lastQuantity !== null && input.quantity > s.lastQuantity + 0.5) {
    s = { warnedForStopId: null, warnedReserve: false, lastQuantity: input.quantity };
  }
  s.lastQuantity = input.quantity;
  const alerts: FuelAlert[] = [];
  if (input.rangeKm === null) return { state: s, alerts };

  const stop = input.nextStop;
  if (stop && s.warnedForStopId !== stop.id && input.rangeKm < 2 * stop.distanceKm) {
    alerts.push({ kind: 'approaching-stop', stopId: stop.id, stopName: stop.name, distanceKm: stop.distanceKm, rangeKm: input.rangeKm });
    s.warnedForStopId = stop.id;
  }
  if (input.atReserve && !s.warnedReserve) {
    alerts.push({ kind: 'reserve', rangeKm: input.rangeKm });
    s.warnedReserve = true;
  }
  return { state: s, alerts };
}
