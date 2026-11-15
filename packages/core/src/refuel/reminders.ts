const DAY_MS = 86_400_000;

export type ReminderKind = 'no-recent-log' | 'impossible-fuel';

export interface ReminderInput {
  now: number;
  lastLogAt: number | null;
  /** Nudge if no log for this many days (default 10). */
  noLogDays: number;
  /** Unclamped fuel estimate; negative = impossible. */
  rawFuelQuantity: number | null;
  /** When each kind of reminder last fired. */
  lastSent: Partial<Record<ReminderKind, number>>;
  /** Don't repeat the same reminder more than once per this many ms (default 1 day). */
  cooldownMs?: number;
}

export function dueReminders(input: ReminderInput): ReminderKind[] {
  const cooldown = input.cooldownMs ?? DAY_MS;
  const ready = (k: ReminderKind): boolean => input.now - (input.lastSent[k] ?? -Infinity) >= cooldown;
  const out: ReminderKind[] = [];
  if (input.lastLogAt !== null && input.now - input.lastLogAt >= input.noLogDays * DAY_MS && ready('no-recent-log')) {
    out.push('no-recent-log');
  }
  // Allow a small negative margin (half a litre) before calling the estimate impossible.
  if (input.rawFuelQuantity !== null && input.rawFuelQuantity < -0.5 && ready('impossible-fuel')) out.push('impossible-fuel');
  return out;
}

export const REMINDER_TEXT: Record<ReminderKind, { title: string; body: string }> = {
  'no-recent-log': {
    title: 'Log your fuel',
    body: "It's been a while since your last fuel entry. Log it to keep range and mileage accurate.",
  },
  'impossible-fuel': {
    title: 'Fuel estimate looks off',
    body: 'The estimated fuel is below empty — a fill may be missing. Log it or set the gauge.',
  },
};
