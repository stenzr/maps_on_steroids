import { computeMileagePeriods, rollingSeries, sortLogs, weightedEfficiency } from '../fuel/mileage';
import type { FuelLog } from '../fuel/types';

export interface EfficiencyPoint {
  endAt: number;
  kmPerUnit: number;
  rolling: number | null;
}

export function efficiencySeries(logs: readonly FuelLog[]): EfficiencyPoint[] {
  const periods = computeMileagePeriods(logs);
  const rolling = rollingSeries(periods);
  return periods.map((p, i) => ({ endAt: p.endAt, kmPerUnit: p.kmPerUnit, rolling: rolling[i] ?? null }));
}

export interface MonthlySpend {
  /** "2026-11" */
  month: string;
  totalCost: number;
  quantity: number;
  fills: number;
}

/** Month key in India Standard Time (UTC+5:30, no DST), independent of the device timezone. */
export function istMonthKey(ts: number): string {
  const d = new Date(ts + 5.5 * 3_600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthlySpend(logs: readonly FuelLog[]): MonthlySpend[] {
  const map = new Map<string, MonthlySpend>();
  for (const l of sortLogs(logs)) {
    const month = istMonthKey(l.filledAt);
    const m = map.get(month) ?? { month, totalCost: 0, quantity: 0, fills: 0 };
    m.totalCost += l.totalCost;
    m.quantity += l.quantity;
    m.fills += 1;
    map.set(month, m);
  }
  return [...map.values()];
}

export function priceSeries(logs: readonly FuelLog[]): { at: number; price: number }[] {
  return sortLogs(logs).map((l) => ({ at: l.filledAt, price: l.pricePerUnit }));
}

export interface CostSummary {
  /** ₹/km across all full-to-full periods. */
  costPerKm: number | null;
  totalSpend: number;
  totalQuantity: number;
  /** Distance covered by logs (last odometer − first). */
  distanceKm: number;
  lifetimeKmPerUnit: number | null;
}

export function costSummary(logs: readonly FuelLog[]): CostSummary {
  const sorted = sortLogs(logs);
  const periods = computeMileagePeriods(sorted);
  const km = periods.reduce((s, p) => s + p.distanceKm, 0);
  const cost = periods.reduce((s, p) => s + p.cost, 0);
  return {
    costPerKm: km > 0 ? cost / km : null,
    totalSpend: sorted.reduce((s, l) => s + l.totalCost, 0),
    totalQuantity: sorted.reduce((s, l) => s + l.quantity, 0),
    distanceKm: sorted.length >= 2 ? sorted.at(-1)!.odometerKm - sorted[0]!.odometerKm : 0,
    lifetimeKmPerUnit: weightedEfficiency(periods),
  };
}

export interface TripSummaryInput {
  startedAt: number;
  endedAt: number;
  distanceKm: number;
  stops: number;
  kmPerUnit: number;
  /** Latest price per unit, ₹. */
  pricePerUnit: number | null;
}

export interface TripSummary {
  distanceKm: number;
  durationMin: number;
  estFuel: number;
  estCost: number | null;
  stops: number;
  avgSpeedKmh: number | null;
}

export function tripSummary(t: TripSummaryInput): TripSummary {
  const durationMin = Math.max(0, (t.endedAt - t.startedAt) / 60_000);
  const estFuel = t.kmPerUnit > 0 ? t.distanceKm / t.kmPerUnit : 0;
  return {
    distanceKm: t.distanceKm,
    durationMin,
    estFuel,
    estCost: t.pricePerUnit !== null ? estFuel * t.pricePerUnit : null,
    stops: t.stops,
    avgSpeedKmh: durationMin > 0 ? t.distanceKm / (durationMin / 60) : null,
  };
}
