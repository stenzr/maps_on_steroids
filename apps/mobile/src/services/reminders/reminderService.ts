import { dueReminders, REMINDER_TEXT, type ReminderKind } from '@roadtrip/core';
import { lastPromptSent, markPromptSent } from '@/db/repositories';
import { CHANNELS, notify } from '@/services/notifications/notifications';
import { useGarage } from '@/state/garageStore';
import { useSettings } from '@/state/settingsStore';

const URL_FOR: Record<ReminderKind, string> = {
  'no-recent-log': '/fuel/edit?quick=1',
  'impossible-fuel': '/fuel-level',
};

/** Check and send due reminders (on app start/foreground and at the end of each trip). */
export async function runReminders(now = Date.now()): Promise<void> {
  const s = useSettings.getState();
  const { logs, range, active } = useGarage.getState();
  if (!active) return;
  const [noLog, impossible] = await Promise.all([lastPromptSent('no-recent-log'), lastPromptSent('impossible-fuel')]);
  const due = dueReminders({
    now,
    lastLogAt: logs.at(-1)?.filledAt ?? null,
    noLogDays: s.noLogDays,
    rawFuelQuantity: range?.fuel.rawQuantity ?? null,
    lastSent: { 'no-recent-log': noLog ?? undefined, 'impossible-fuel': impossible ?? undefined },
  }).filter((k) => (k === 'no-recent-log' ? s.noLogReminderEnabled : s.impossibleFuelReminderEnabled));

  for (const kind of due) {
    const t = REMINDER_TEXT[kind];
    await notify(CHANNELS.reminders, t.title, t.body, { url: URL_FOR[kind] });
    await markPromptSent(`${kind}@${now}`, kind);
  }
}
