import {
  dwellKey,
  evaluateFuelAlerts,
  initialDwellState,
  initialFuelAlertState,
  matchStation,
  updateDwell,
  type FuelAlertState,
  type LocationFix,
  type Place,
} from '@roadtrip/core';
import { markPromptSent, newId, upsertTrip, wasPromptSent, type TripRow } from '@/db/repositories';
import { api } from '@/services/api/proxyClient';
import { CHANNELS, notify } from '@/services/notifications/notifications';
import { runReminders } from '@/services/reminders/reminderService';
import { computeFuelPlan } from '@/services/routing/fuelPlan';
import { useGarage } from '@/state/garageStore';
import { useRoute } from '@/state/routeStore';
import { useSettings } from '@/state/settingsStore';
import { useTracking } from '@/state/trackingStore';

/** Persist GPS distance in chunks this big (or after this long). */
const FLUSH_KM = 0.5;
const FLUSH_MS = 60_000;
/** A trip ends after this long parked. */
const TRIP_END_IDLE_MS = 20 * 60_000;

interface ProcessorState {
  flushedMeters: number;
  lastFlushAt: number;
  trip: TripRow | null;
  dwell: ReturnType<typeof initialDwellState>;
  /** Petrol station matched at the current dwell, if any. */
  dwellStation: { place: Place; startedAt: number } | null;
  alerts: FuelAlertState;
  /** Simulated fixes (test mode) never touch the database. */
  simulated: boolean;
}

const st: ProcessorState = {
  flushedMeters: 0,
  lastFlushAt: 0,
  trip: null,
  dwell: initialDwellState(),
  dwellStation: null,
  alerts: initialFuelAlertState(),
  simulated: false,
};

/** Call when the location source changes (e.g. test mode toggled) so state doesn't leak across. */
export function resetProcessor(simulated: boolean): void {
  // Leaving test mode: drop the simulated distance from the in-memory range estimate.
  if (st.simulated && !simulated) void useGarage.getState().reload();
  st.flushedMeters = 0;
  st.lastFlushAt = 0;
  st.trip = null;
  st.dwell = initialDwellState();
  st.dwellStation = null;
  st.simulated = simulated;
}

function buildFuelLogUrl(params: Record<string, string>): string {
  const q = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `/fuel/edit?${q}`;
}

async function handleDwell(fix: LocationFix): Promise<void> {
  const r = updateDwell(st.dwell, fix);
  st.dwell = r.state;
  const ev = r.event;
  if (!ev) return;
  const settings = useSettings.getState();

  if (ev.kind === 'dwell-confirmed') {
    if (st.trip) st.trip = { ...st.trip, stops: st.trip.stops + 1 };
    if (!settings.refuelPromptEnabled) return;
    // Recently logged by hand? Then no need to look it up.
    const lastLog = useGarage.getState().logs.at(-1);
    if (lastLog && fix.timestamp - lastLog.createdAt < 15 * 60_000) return;
    try {
      const nearby = await api.nearbyFuel({ latitude: ev.center.latitude, longitude: ev.center.longitude, radiusM: 150, maxResults: 5 });
      const station = matchStation(ev.center, nearby);
      st.dwellStation = station ? { place: station, startedAt: ev.startedAt } : null;
    } catch {
      st.dwellStation = null; // offline: skip the prompt rather than guess
    }
    return;
  }

  // dwell-ended: we drove away.
  const match = st.dwellStation;
  st.dwellStation = null;
  if (!match || match.startedAt !== ev.startedAt || !settings.refuelPromptEnabled) return;
  const key = dwellKey(match.place.placeId, ev.startedAt);
  if (await wasPromptSent(key).catch(() => false)) return;
  await notify(
    CHANNELS.refuel,
    `Did you refuel at ${match.place.name}?${st.simulated ? ' (test)' : ''}`,
    'Tap to log it — date, time and station are filled in.',
    {
      url: buildFuelLogUrl({
        stationName: match.place.name,
        stationPlaceId: match.place.placeId,
        filledAt: String(ev.endedAt),
        quick: '1',
      }),
    },
  );
  await markPromptSent(key, 'refuel').catch(() => undefined);
}

async function flushDistance(fix: LocationFix): Promise<void> {
  const total = useTracking.getState().tracking.distance.totalMeters;
  const pending = total - st.flushedMeters;
  const due = pending >= FLUSH_KM * 1000 || (pending > 0 && fix.timestamp - st.lastFlushAt >= FLUSH_MS);
  if (!due) return;
  st.flushedMeters = total;
  st.lastFlushAt = fix.timestamp;
  const km = pending / 1000;
  const garage = useGarage.getState();

  // A long gap since the last distance (e.g. parked overnight with sparse idle fixes) starts a new trip.
  if (st.trip && fix.timestamp - st.trip.endedAt > TRIP_END_IDLE_MS) {
    if (!st.simulated) await upsertTrip(st.trip).catch(() => undefined);
    st.trip = null;
  }
  if (!st.trip) {
    st.trip = { id: newId(), vehicleId: garage.active?.id ?? null, startedAt: fix.timestamp, endedAt: fix.timestamp, distanceKm: 0, stops: 0 };
  }
  st.trip = { ...st.trip, endedAt: fix.timestamp, distanceKm: st.trip.distanceKm + km };

  if (st.simulated) {
    // Test mode: show the effect on range for this session only.
    useGarage.setState((s) => ({ ticks: [...s.ticks, { at: fix.timestamp, km }] }));
    garage.recompute();
  } else {
    await garage.recordDistance(km, fix.timestamp, st.trip.id).catch((e: unknown) => console.warn('Saving distance failed', e));
    await upsertTrip(st.trip).catch(() => undefined);
  }
  await checkFuelAlerts();
}

async function checkFuelAlerts(): Promise<void> {
  if (!useSettings.getState().fuelAlertsEnabled) return;
  const { range, active } = useGarage.getState();
  const routeState = useRoute.getState();
  const position = useTracking.getState().tracking.position;
  const planned = computeFuelPlan({ route: routeState.route, petrol: routeState.results.petrol, position, range, vehicle: active });
  const next = planned?.plan.stops[0];
  const r = evaluateFuelAlerts(st.alerts, {
    rangeKm: range?.rangeKm ?? null,
    quantity: range?.fuel.quantity ?? null,
    atReserve: range?.atReserve ?? false,
    nextStop: next ? { id: next.item.place.placeId, name: next.item.place.name, distanceKm: next.item.aheadKm } : null,
  });
  st.alerts = r.state;
  for (const a of r.alerts) {
    if (a.kind === 'approaching-stop') {
      await notify(
        CHANNELS.fuel,
        `Refuel soon: ${a.stopName} in ${Math.round(a.distanceKm)} km`,
        `About ${Math.round(a.rangeKm)} km of range left.`,
        { url: '/' },
      );
    } else {
      await notify(CHANNELS.fuel, 'Fuel at reserve', `About ${Math.round(a.rangeKm)} km of range left. Find a petrol pump.`, { url: '/' });
    }
  }
}

async function maybeEndTrip(fix: LocationFix): Promise<void> {
  const since = useTracking.getState().tracking.stationarySince;
  if (!st.trip || since === null || fix.timestamp - since < TRIP_END_IDLE_MS) return;
  const finished = st.trip;
  st.trip = null;
  if (!st.simulated) {
    await upsertTrip(finished).catch(() => undefined);
    await runReminders().catch(() => undefined);
  }
}

let queue: Promise<void> = Promise.resolve();
let initialised = false;

/**
 * When Android restarts the JS runtime just to deliver background locations, the UI never
 * mounted, so load settings and the active vehicle here first.
 */
async function ensureInitialised(): Promise<void> {
  if (initialised) return;
  initialised = true;
  if (!useSettings.getState().hydrated) await useSettings.getState().hydrate();
  if (!useGarage.getState().loaded) await useGarage.getState().reload();
}

/**
 * The single entry point for every location fix (foreground GPS, background task, simulator).
 * Fixes are processed strictly in order.
 */
export function processFix(fix: LocationFix): Promise<void> {
  const windowM = useSettings.getState().headingWindowM;
  useTracking.getState().pushFix(fix, windowM);
  queue = queue
    .then(async () => {
      await ensureInitialised();
      await flushDistance(fix);
      await handleDwell(fix);
      await maybeEndTrip(fix);
    })
    .catch((e: unknown) => console.warn('Location processing failed', e));
  return queue;
}
