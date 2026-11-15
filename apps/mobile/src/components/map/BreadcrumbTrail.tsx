import { memo, useMemo } from 'react';
import { Polyline } from 'react-native-maps';
import type { LatLng } from '@roadtrip/core';
import { colors } from '@/theme';

const SEGMENTS = 5;

/**
 * The last ~500 m driven, fading out towards the oldest end. Drawn as a few overlapping
 * polylines of rising opacity, because per-vertex gradients (`strokeColors`) aren't
 * reliable on Android.
 */
function BreadcrumbTrailImpl({ trail }: { trail: readonly LatLng[] }) {
  const chunks = useMemo(() => {
    if (trail.length < 2) return [];
    const size = Math.ceil(trail.length / SEGMENTS);
    const out: { coords: LatLng[]; opacity: number }[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const start = i * size;
      if (start >= trail.length - 1) break;
      // +1 overlap so the chunks join without gaps
      out.push({ coords: trail.slice(start, Math.min(trail.length, start + size + 1)), opacity: 0.15 + (0.6 * (i + 1)) / SEGMENTS });
    }
    return out;
  }, [trail]);

  return (
    <>
      {chunks.map((c, i) => (
        <Polyline
          key={i}
          coordinates={c.coords}
          strokeColor={`rgba(${colors.trail}, ${c.opacity.toFixed(2)})`}
          strokeWidth={6}
          lineCap="round"
          lineJoin="round"
          zIndex={10 + i}
        />
      ))}
    </>
  );
}

export const BreadcrumbTrail = memo(BreadcrumbTrailImpl);
