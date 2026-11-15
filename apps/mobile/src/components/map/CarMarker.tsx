import { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';
import type { LatLng } from '@roadtrip/core';
import { colors } from '@/theme';

interface Props {
  position: LatLng;
  /** Degrees clockwise from north; null = direction unknown (shows a dot). */
  rotation: number | null;
  frozen: boolean;
}

/**
 * Direction-of-travel arrow. `flat` keeps it glued to the map surface, so in heading-up
 * mode (camera rotated) it still points along the road.
 */
function CarMarkerImpl({ position, rotation, frozen }: Props) {
  const color = frozen ? colors.carFrozen : colors.car;
  // The marker bitmap only changes with these props; let Android snapshot it once per change.
  const [tracks, setTracks] = useState(true);
  const showsDot = rotation === null;
  useEffect(() => {
    setTracks(true);
    const t = setTimeout(() => setTracks(false), 250);
    return () => clearTimeout(t);
  }, [frozen, showsDot]);

  return (
    <Marker
      coordinate={position}
      flat
      rotation={rotation ?? 0}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      zIndex={1000}
    >
      <View style={styles.halo}>
        {showsDot ? (
          <View style={[styles.dot, { backgroundColor: color }]} />
        ) : (
          <View style={styles.arrowWrap}>
            <View style={[styles.arrow, { borderBottomColor: color }]} />
          </View>
        )}
      </View>
    </Marker>
  );
}

export const CarMarker = memo(CarMarkerImpl);

const styles = StyleSheet.create({
  halo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: '#fff' },
  arrowWrap: { alignItems: 'center', justifyContent: 'center', marginTop: -4 },
  // CSS-border triangle pointing up (north); the marker's rotation turns it.
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderBottomWidth: 26,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
