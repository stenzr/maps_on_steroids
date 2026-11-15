import { create } from 'zustand';
import {
  DEFAULT_HEADING_CONFIG,
  initialTrackingState,
  reduceTracking,
  type LocationFix,
  type TrackingState,
} from '@roadtrip/core';

export type TrackingStatus =
  | { kind: 'idle' }
  | { kind: 'requesting-permission' }
  | { kind: 'permission-denied'; canAskAgain: boolean }
  | { kind: 'services-disabled' }
  | { kind: 'tracking'; source: 'gps' | 'simulator' }
  | { kind: 'error'; message: string };

interface TrackingStore {
  tracking: TrackingState;
  status: TrackingStatus;
  pushFix: (fix: LocationFix, headingWindowM: number) => void;
  setStatus: (status: TrackingStatus) => void;
  reset: () => void;
}

export const useTracking = create<TrackingStore>((set) => ({
  tracking: initialTrackingState(),
  status: { kind: 'idle' },
  pushFix: (fix, headingWindowM) =>
    set((s) => ({
      tracking: reduceTracking(s.tracking, fix, { ...DEFAULT_HEADING_CONFIG, windowMeters: headingWindowM }),
    })),
  setStatus: (status) => set({ status }),
  reset: () => set({ tracking: initialTrackingState() }),
}));
