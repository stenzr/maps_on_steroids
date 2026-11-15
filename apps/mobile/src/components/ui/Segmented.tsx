import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/theme';

interface Props<T extends string | number> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string | number>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            style={[styles.item, selected && styles.selected]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 3 },
  item: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: radius.sm },
  selected: { backgroundColor: colors.surface, elevation: 2 },
  label: { color: colors.textMuted, fontWeight: '600' },
  labelSelected: { color: colors.primary },
});
