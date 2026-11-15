import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '@/theme';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  compact,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  compact?: boolean;
}) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading) }}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: v.bg, borderColor: v.border },
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : <Text style={[styles.buttonText, compact && styles.buttonTextCompact, { color: v.fg }]}>{label}</Text>}
    </Pressable>
  );
}

const buttonVariants = {
  primary: { bg: colors.primary, fg: '#fff', border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.primary, border: colors.border },
  danger: { bg: colors.surface, fg: colors.danger, border: colors.border },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
} as const;

export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...input}
        style={[styles.input, error ? styles.inputError : null, input.style]}
        accessibilityLabel={label}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

export function Card({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.card}>
      {(title || right) && (
        <View style={styles.cardHeader}>
          {title ? <Text style={styles.cardTitle}>{title}</Text> : <View />}
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.hint}>{sub}</Text> : null}
    </View>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={[styles.hint, styles.center]}>{body}</Text>
      {action}
    </View>
  );
}

export const formatInr = (n: number | null | undefined, digits = 0): string =>
  n === null || n === undefined || !Number.isFinite(n)
    ? '—'
    : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;

export const formatKm = (n: number | null | undefined, digits = 0): string =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n.toLocaleString('en-IN', { maximumFractionDigits: digits })} km`;

export const formatDate = (ts: number): string =>
  new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  buttonCompact: { minHeight: 36, paddingHorizontal: spacing(3), borderRadius: radius.sm },
  buttonText: { fontSize: 16, fontWeight: '700' },
  buttonTextCompact: { fontSize: 14 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  field: { marginBottom: spacing(3) },
  label: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: spacing(1) },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  error: { fontSize: 13, color: colors.danger, marginTop: spacing(1) },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(3),
    fontSize: 17,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.danger },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingVertical: spacing(2) },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing(4) },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(3) },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  stat: { flex: 1, minWidth: 90 },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  empty: { alignItems: 'center', gap: spacing(3), padding: spacing(8) },
});
