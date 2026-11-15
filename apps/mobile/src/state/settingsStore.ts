import { create } from 'zustand';
import { DEFAULT_HEADING_WINDOW_M } from '@roadtrip/core';

export type CameraMode = 'north-up' | 'heading-up';
export type VehicleType = 'car' | 'two-wheeler';

export interface TestModeSettings {
  enabled: boolean;
  speedKmh: number;
  /** Simulated seconds per real second. */
  playbackRate: number;
}

interface SettingsState {
  headingWindowM: number;
  cameraMode: CameraMode;
  /** Default vehicle/travel mode is car (Routes API DRIVE). */
  vehicleType: VehicleType;
  testMode: TestModeSettings;
  setHeadingWindow: (m: number) => void;
  setCameraMode: (m: CameraMode) => void;
  setTestMode: (patch: Partial<TestModeSettings>) => void;
}

// In-memory for milestone 1; persisted to SQLite with the rest of the settings in milestone 2.
export const useSettings = create<SettingsState>((set) => ({
  headingWindowM: DEFAULT_HEADING_WINDOW_M,
  cameraMode: 'heading-up',
  vehicleType: 'car',
  testMode: { enabled: false, speedKmh: 70, playbackRate: 1 },
  setHeadingWindow: (headingWindowM) => set({ headingWindowM }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setTestMode: (patch) => set((s) => ({ testMode: { ...s.testMode, ...patch } })),
}));
