import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { TrackingStatus } from '@/state/trackingStore';
import { colors, radius, spacing } from '@/theme';

interface Props {
  status: TrackingStatus;
  onRetry: () => void;
}

/** Clear, non-crashing messages for permission / GPS problems. */
export function StatusOverlay({ status, onRetry }: Props) {
  let title: string;
  let body: string;
  let action: { label: string; onPress: () => void };

  switch (status.kind) {
    case 'permission-denied':
      title = 'Location permission needed';
      body = 'RoadTrip Companion needs your location to show where you are and which way you are heading.';
      action = status.canAskAgain
        ? { label: 'Allow location', onPress: onRetry }
        : { label: 'Open settings', onPress: () => void Linking.openSettings() };
      break;
    case 'services-disabled':
      title = 'Location is turned off';
      body = 'Turn on location (GPS) in your phone’s quick settings, then try again.';
      action = { label: 'Try again', onPress: onRetry };
      break;
    case 'error':
      title = 'Location problem';
      body = status.message;
      action = { label: 'Try again', onPress: onRetry };
      break;
    default:
      return null;
  }

  return (
    <View style={styles.card} accessibilityRole="alert">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Pressable style={styles.button} onPress={action.onPress} accessibilityRole="button">
        <Text style={styles.buttonText}>{action.label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: spacing(4),
    right: spacing(4),
    bottom: spacing(8),
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing(5),
    elevation: 6,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: spacing(1) },
  body: { fontSize: 15, color: colors.textMuted, lineHeight: 21 },
  button: {
    marginTop: spacing(4),
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing(3),
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
