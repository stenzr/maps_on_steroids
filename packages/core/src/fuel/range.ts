import { estimateFuel, type FuelEstimate } from './fuelLevel';
import { mileageStats, type MileageStats } from './mileage';
import { defaultEfficiency, type DistanceTick, type FuelCorrection, type FuelLog, type Vehicle } from './types';

export type EfficiencySource = 'rolling' | 'claimed' | 'default';

export interface RangeEstimate {
  fuel: FuelEstimate;
  stats: MileageStats;
  kmPerUnit: number;
  efficiencySource: EfficiencySource;
  /** Distance until empty. */
  rangeKm: number | null;
  /** Distance until the reserve level. */
  rangeToReserveKm: number | null;
  reserveQuantity: number;
  atReserve: boolean;
  /** Show "estimate, improves after 2 full-to-full fills" when true. */
  lowConfidence: boolean;
}

export function pickEfficiency(vehicle: Vehicle, stats: MileageStats): { kmPerUnit: number; source: EfficiencySource } {
  if (stats.rolling !== null) return { kmPerUnit: stats.rolling, source: 'rolling' };
  if (vehicle.claimedKmPerUnit && vehicle.claimedKmPerUnit > 0) return { kmPerUnit: vehicle.claimedKmPerUnit, source: 'claimed' };
  return { kmPerUnit: defaultEfficiency(vehicle.vehicleType, vehicle.fuelType), source: 'default' };
}

/** Range = fuel remaining × rolling-average km per unit. */
export function estimateRange(args: {
  vehicle: Vehicle;
  logs: readonly FuelLog[];
  corrections: readonly FuelCorrection[];
  ticks: readonly DistanceTick[];
  now: number;
}): RangeEstimate {
  const { vehicle } = args;
  const stats = mileageStats(args.logs);
  const eff = pickEfficiency(vehicle, stats);
  const fuel = estimateFuel({
    capacity: vehicle.tankCapacity,
    logs: args.logs,
    corrections: args.corrections,
    ticks: args.ticks,
    kmPerUnit: eff.kmPerUnit,
    now: args.now,
  });
  const reserveQuantity = vehicle.tankCapacity * vehicle.reserveFraction;
  const rangeKm = fuel.quantity === null ? null : fuel.quantity * eff.kmPerUnit;
  const rangeToReserveKm = fuel.quantity === null ? null : Math.max(0, fuel.quantity - reserveQuantity) * eff.kmPerUnit;
  return {
    fuel,
    stats,
    kmPerUnit: eff.kmPerUnit,
    efficiencySource: eff.source,
    rangeKm,
    rangeToReserveKm,
    reserveQuantity,
    atReserve: fuel.quantity !== null && fuel.quantity <= reserveQuantity,
    lowConfidence: stats.periodCount < 2 || fuel.startGuessed,
  };
}

/** "≈ 210 km range" — rounded to 10 km above 100 km, 5 km below, since precision is false comfort. */
export function formatRange(km: number | null): string {
  if (km === null) return 'Range —';
  const r = km >= 100 ? Math.round(km / 10) * 10 : Math.round(km / 5) * 5;
  return `≈ ${r} km range`;
}
