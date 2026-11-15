import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { colors, radius, spacing } from '@/theme';

/** E → F slider for manual fuel correction. Value is 0–1, snapped to 1/16 like a fuel gauge. */
export function FuelGaugeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [width, setWidth] = useState(1);
  const widthRef = useRef(1);
  const startRef = useRef(value);
  const valueRef = useRef(value);
  valueRef.current = value;

  const snap = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 16) / 16;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const v = snap(e.nativeEvent.locationX / widthRef.current);
        startRef.current = v;
        onChange(v);
      },
      onPanResponderMove: (_e, g) => onChange(snap(startRef.current + g.dx / widthRef.current)),
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent): void => {
    widthRef.current = Math.max(1, e.nativeEvent.layout.width);
    setWidth(widthRef.current);
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Fuel level"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100), text: `${Math.round(value * 100)} percent` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(snap(valueRef.current + (e.nativeEvent.actionName === 'increment' ? 1 / 16 : -1 / 16)))}
    >
      <View style={styles.track} onLayout={onLayout} {...responder.panHandlers}>
        <View style={[styles.fill, { width: value * width, backgroundColor: value < 0.15 ? colors.danger : colors.primary }]} />
        <View style={[styles.thumb, { left: value * width - 14 }]} />
      </View>
      <View style={styles.labels}>
        <Text style={styles.end}>E</Text>
        <Text style={styles.pct}>{Math.round(value * 100)}%</Text>
        <Text style={styles.end}>F</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, justifyContent: 'center', overflow: 'visible' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radius.pill },
  thumb: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: colors.primary,
    elevation: 3,
  },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing(2) },
  end: { fontWeight: '800', color: colors.textMuted, fontSize: 16 },
  pct: { fontWeight: '700', color: colors.text, fontSize: 16 },
});
