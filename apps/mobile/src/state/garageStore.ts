import { create } from 'zustand';
import {
  estimatedOdometer,
  estimateRange,
  type DistanceTick,
  type FuelCorrection,
  type RangeEstimate,
  type Vehicle,
} from '@roadtrip/core';
import {
  addCorrection,
  addDistanceTick,
  listCorrections,
  listDistanceTicks,
  listFuelLogs,
  listVehicles,
  type StoredFuelLog,
} from '@/db/repositories';

const TICK_HISTORY_MS = 120 * 86_400_000;

interface GarageStore {
  loaded: boolean;
  vehicles: Vehicle[];
  active: Vehicle | null;
  logs: StoredFuelLog[];
  corrections: FuelCorrection[];
  ticks: DistanceTick[];
  range: RangeEstimate | null;
  estOdometer: number | null;
  error: string | null;
  /** Reload everything for the active vehicle from SQLite. */
  reload: () => Promise<void>;
  /** Recompute range from what's in memory (cheap; call after new GPS distance). */
  recompute: () => void;
  recordDistance: (km: number, at: number, tripId: string | null) => Promise<void>;
  correctFuel: (fraction: number) => Promise<void>;
}

export const useGarage = create<GarageStore>((set, get) => ({
  loaded: false,
  vehicles: [],
  active: null,
  logs: [],
  corrections: [],
  ticks: [],
  range: null,
  estOdometer: null,
  error: null,

  reload: async () => {
    try {
      const vehicles = await listVehicles();
      const active = vehicles.find((v) => v.isActive) ?? vehicles[0] ?? null;
      if (!active) {
        set({ loaded: true, vehicles, active: null, logs: [], corrections: [], ticks: [], range: null, estOdometer: null, error: null });
        return;
      }
      const [logs, corrections, ticks] = await Promise.all([
        listFuelLogs(active.id),
        listCorrections(active.id),
        listDistanceTicks(active.id, Date.now() - TICK_HISTORY_MS),
      ]);
      set({ loaded: true, vehicles, active, logs, corrections, ticks, error: null });
      get().recompute();
    } catch (e) {
      set({ loaded: true, error: e instanceof Error ? e.message : 'Could not load your vehicles' });
    }
  },

  recompute: () => {
    const { active, logs, corrections, ticks } = get();
    if (!active) return set({ range: null, estOdometer: null });
    const now = Date.now();
    set({
      range: estimateRange({ vehicle: active, logs, corrections, ticks, now }),
      estOdometer: estimatedOdometer(logs, ticks, now),
    });
  },

  recordDistance: async (km, at, tripId) => {
    const { active } = get();
    if (!active || km <= 0) return;
    set((s) => ({ ticks: [...s.ticks, { at, km }] }));
    get().recompute();
    await addDistanceTick(active.id, tripId, at, km);
  },

  correctFuel: async (fraction) => {
    const { active } = get();
    if (!active) return;
    await addCorrection(active.id, fraction);
    await get().reload();
  },
}));
