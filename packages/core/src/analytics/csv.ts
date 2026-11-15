import { sortLogs } from '../fuel/mileage';
import type { FuelLog, Vehicle } from '../fuel/types';
import { fuelUnit } from '../fuel/types';

/** RFC 4180 field: quote if it contains a comma, quote or newline; double embedded quotes. */
export function csvField(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
  // Guard against formula injection when opened in a spreadsheet.
  const safe = /^[=+\-@]/.test(s) && typeof v !== 'number' ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** ISO-like local IST timestamp, e.g. 2026-11-15 14:05 (IST is UTC+5:30, no DST). */
export function istDateTime(ts: number): string {
  const d = new Date(ts + 5.5 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function fuelLogCsv(logs: readonly FuelLog[], vehicles: readonly Vehicle[]): string {
  const byId = new Map(vehicles.map((v) => [v.id, v]));
  const header = [
    'date_time_ist',
    'vehicle',
    'fuel_type',
    'odometer_km',
    'quantity',
    'unit',
    'total_inr',
    'price_per_unit_inr',
    'full_tank',
    'missed_previous',
    'station',
    'notes',
  ];
  const rows = sortLogs(logs).map((l) => {
    const v = byId.get(l.vehicleId);
    return [
      istDateTime(l.filledAt),
      v?.name ?? '',
      v?.fuelType ?? '',
      l.odometerKm,
      l.quantity,
      v ? fuelUnit(v.fuelType) : '',
      l.totalCost,
      l.pricePerUnit,
      l.isFullTank ? 'yes' : 'no',
      l.missedPrevious ? 'yes' : 'no',
      l.stationName,
      l.notes,
    ]
      .map(csvField)
      .join(',');
  });
  return [header.join(','), ...rows].join('\r\n') + '\r\n';
}
