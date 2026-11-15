import { create } from 'zustand';
import { DEFAULT_HEADING_WINDOW_M, DEFAULT_LOW_RANGE_KM, DEFAULT_RESTAURANT_FILTERS, type RestaurantFilters } from '@roadtrip/core';
import { readSetting, writeSetting } from '@/db/repositories';

export type CameraMode = 'north-up' | 'heading-up';

export interface TestModeSettings {
  enabled: boolean;
  speedKmh: number;
  /** Simulated seconds per real second. */
  playbackRate: number;
}

export interface Settings {
  headingWindowM: number;
  cameraMode: CameraMode;
  testMode: TestModeSettings;
  /** No route: show nearby pumps below this range. */
  lowRangeKm: number;
  fuelAlertsEnabled: boolean;
  refuelPromptEnabled: boolean;
  noLogReminderEnabled: boolean;
  noLogDays: number;
  impossibleFuelReminderEnabled: boolean;
  /** Track trips in the background (needs "Allow all the time" location). */
  backgroundTracking: boolean;
  breakPlannerEnabled: boolean;
  breakEveryHours: number;
  includeLikelyRestrooms: boolean;
  restaurantFilters: RestaurantFilters;
  showDebugChip: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  headingWindowM: DEFAULT_HEADING_WINDOW_M,
  cameraMode: 'heading-up',
  testMode: { enabled: false, speedKmh: 70, playbackRate: 1 },
  lowRangeKm: DEFAULT_LOW_RANGE_KM,
  fuelAlertsEnabled: true,
  refuelPromptEnabled: true,
  noLogReminderEnabled: true,
  noLogDays: 10,
  impossibleFuelReminderEnabled: true,
  backgroundTracking: false,
  breakPlannerEnabled: true,
  breakEveryHours: 2,
  includeLikelyRestrooms: true,
  restaurantFilters: DEFAULT_RESTAURANT_FILTERS,
  showDebugChip: false,
};

const KEY = 'app-settings';

interface SettingsStore extends Settings {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  update: (patch: Partial<Settings>) => void;
  setTestMode: (patch: Partial<TestModeSettings>) => void;
  // Convenience setters used by the map screen.
  setHeadingWindow: (m: number) => void;
  setCameraMode: (m: CameraMode) => void;
}

const pick = (s: SettingsStore): Settings => {
  const out = {} as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_SETTINGS)) out[k] = (s as unknown as Record<string, unknown>)[k];
  return out as unknown as Settings;
};

export const useSettings = create<SettingsStore>((set, get) => {
  const persist = (): void => {
    // Test mode is a session thing; never restore it on next launch.
    const toSave = { ...pick(get()), testMode: { ...get().testMode, enabled: false } };
    writeSetting(KEY, toSave).catch((e: unknown) => console.warn('Saving settings failed', e));
  };
  return {
    ...DEFAULT_SETTINGS,
    hydrated: false,
    hydrate: async () => {
      try {
        const saved = await readSetting<Partial<Settings>>(KEY);
        if (saved) {
          set({
            ...DEFAULT_SETTINGS,
            ...saved,
            testMode: { ...DEFAULT_SETTINGS.testMode, ...saved.testMode, enabled: false },
            restaurantFilters: { ...DEFAULT_RESTAURANT_FILTERS, ...saved.restaurantFilters },
          });
        }
      } catch (e) {
        console.warn('Loading settings failed; using defaults', e);
      }
      set({ hydrated: true });
    },
    update: (patch) => {
      set(patch);
      persist();
    },
    setTestMode: (patch) => {
      set((s) => ({ testMode: { ...s.testMode, ...patch } }));
      persist();
    },
    setHeadingWindow: (headingWindowM) => get().update({ headingWindowM }),
    setCameraMode: (cameraMode) => get().update({ cameraMode }),
  };
});
