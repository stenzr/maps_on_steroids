import type { LocationFix } from '@roadtrip/core';

/**
 * 'active' = high-accuracy, ~1 Hz (driving/navigating).
 * 'idle'   = coarse and infrequent, to save battery while parked.
 */
export type PowerMode = 'active' | 'idle';

export interface LocationSource {
  readonly kind: 'gps' | 'simulator';
  start(onFix: (fix: LocationFix) => void, onError: (message: string) => void): Promise<void>;
  stop(): void;
  setPowerMode(mode: PowerMode): void;
}
