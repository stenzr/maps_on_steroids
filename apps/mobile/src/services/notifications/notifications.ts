import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const CHANNELS = {
  fuel: 'fuel-alerts',
  refuel: 'refuel-prompts',
  reminders: 'reminders',
} as const;

/** Notification payload: `url` is an expo-router path opened when the user taps it. */
export interface NotificationData extends Record<string, unknown> {
  url?: string;
}

let configured = false;

export async function configureNotifications(): Promise<void> {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNELS.fuel, {
      name: 'Fuel and range alerts',
      importance: Notifications.AndroidImportance.HIGH,
      description: 'Low range and next petrol pump warnings while driving',
    });
    await Notifications.setNotificationChannelAsync(CHANNELS.refuel, {
      name: 'Log your refuel',
      importance: Notifications.AndroidImportance.DEFAULT,
      description: 'Asks whether you refuelled after a stop at a petrol pump',
    });
    await Notifications.setNotificationChannelAsync(CHANNELS.reminders, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.LOW,
      description: 'Nudges to log fuel or correct the fuel gauge',
    });
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Show a notification now. Failures are logged, never thrown: a missed alert must not break tracking. */
export async function notify(channel: (typeof CHANNELS)[keyof typeof CHANNELS], title: string, body: string, data: NotificationData = {}): Promise<void> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data },
      trigger: Platform.OS === 'android' ? { channelId: channel } : null,
    });
  } catch (e) {
    console.warn('Notification failed', e);
  }
}

/** Route taps (including the one that cold-started the app) to the screen in `data.url`. */
export function listenForNotificationTaps(open: (url: string) => void): () => void {
  const handle = (r: Notifications.NotificationResponse | null): void => {
    const url = (r?.notification.request.content.data as NotificationData | undefined)?.url;
    if (typeof url === 'string' && url.startsWith('/')) open(url);
  };
  void Notifications.getLastNotificationResponseAsync().then(handle);
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
