import { useEffect, useRef, useState } from 'react';
import { angleDelta, normalizeDegrees, type LatLng } from '@roadtrip/core';

export interface Pose {
  position: LatLng;
  rotation: number;
}

const FRAME_MS = 33; // ~30 fps is plenty for a map marker and kinder to the battery

const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/**
 * Glides the car marker from its previous pose to the new one: position linearly,
 * rotation along the shortest arc (350° → 10° turns 20° through north).
 */
export function useAnimatedPose(target: Pose | null, durationMs = 600): Pose | null {
  const [pose, setPose] = useState<Pose | null>(target);
  const fromRef = useRef<Pose | null>(target);
  const currentRef = useRef<Pose | null>(target);

  useEffect(() => {
    if (!target) return;
    const from = currentRef.current;
    if (!from) {
      currentRef.current = target;
      setPose(target);
      return;
    }
    fromRef.current = from;
    const rotDelta = angleDelta(from.rotation, target.rotation);
    const start = Date.now();
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      const k = easeOut(t);
      const next: Pose = {
        position: {
          latitude: from.position.latitude + (target.position.latitude - from.position.latitude) * k,
          longitude: from.position.longitude + (target.position.longitude - from.position.longitude) * k,
        },
        rotation: normalizeDegrees(from.rotation + rotDelta * k),
      };
      currentRef.current = next;
      setPose(next);
      if (t >= 1) clearInterval(timer);
    }, FRAME_MS);
    return () => clearInterval(timer);
    // Re-run only when the target values change, not on object identity.
  }, [target?.position.latitude, target?.position.longitude, target?.rotation, durationMs]); // eslint-disable-line react-hooks/exhaustive-deps

  return pose;
}
