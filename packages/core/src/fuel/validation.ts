import { computeMileagePeriods, ROLLING_WINDOW, sortLogs, weightedEfficiency } from './mileage';
import type { FuelLog, Vehicle } from './types';

export interface FuelLogDraft {
  id?: string;
  filledAt: number;
  odometerKm: number;
  quantity: number;
  totalCost: number;
  pricePerUnit: number;
  isFullTank: boolean;
  missedPrevious: boolean;
}

export type FuelLogWarningCode = 'mileage-outlier' | 'over-capacity' | 'price-unusual' | 'price-mismatch';

export interface FuelLogValidation {
  /** Blocking problems. */
  errors: string[];
  /** Ask the user to confirm before saving. */
  warnings: { code: FuelLogWarningCode; message: string }[];
  /** km/L of the period this entry would close, if it's a full fill. */
  periodKmPerUnit: number | null;
}

/** Fraction off the rolling average that counts as an outlier. */
export const OUTLIER_THRESHOLD = 0.4;

/**
 * Validates a new or edited log against the vehicle's other logs. Odometer readings must
 * increase with time (strictly, against both neighbours). Flags a full fill whose km/L is more
 * than 40% off the rolling average (needs at least 2 earlier periods).
 */
export function validateFuelLog(draft: FuelLogDraft, others: readonly FuelLog[], vehicle: Vehicle): FuelLogValidation {
  const errors: string[] = [];
  const warnings: FuelLogValidation['warnings'] = [];
  const unit = vehicle.fuelType === 'cng' ? 'kg' : 'litres';

  if (!(draft.quantity > 0)) errors.push(`Enter the ${unit} filled.`);
  if (!(draft.totalCost > 0)) errors.push('Enter the amount paid (₹).');
  if (!(draft.odometerKm >= 0) || !Number.isFinite(draft.odometerKm)) errors.push('Enter the odometer reading (km).');
  if (!Number.isFinite(draft.filledAt)) errors.push('Enter a valid date and time.');

  const rest = sortLogs(others.filter((l) => l.id !== draft.id));
  const prev = [...rest].reverse().find((l) => l.filledAt <= draft.filledAt);
  const next = rest.find((l) => l.filledAt > draft.filledAt);
  if (prev && draft.odometerKm <= prev.odometerKm) {
    errors.push(`Odometer must be more than the previous entry (${prev.odometerKm.toLocaleString('en-IN')} km).`);
  }
  if (next && draft.odometerKm >= next.odometerKm) {
    errors.push(`Odometer must be less than the next entry (${next.odometerKm.toLocaleString('en-IN')} km).`);
  }

  if (draft.quantity > vehicle.tankCapacity * 1.05) {
    warnings.push({
      code: 'over-capacity',
      message: `${draft.quantity} ${unit} is more than the ${vehicle.tankCapacity} ${unit} tank.`,
    });
  }
  if (draft.quantity > 0 && draft.totalCost > 0) {
    const computed = draft.totalCost / draft.quantity;
    if (Math.abs(computed - draft.pricePerUnit) / computed > 0.02) {
      warnings.push({
        code: 'price-mismatch',
        message: `Price ₹${draft.pricePerUnit.toFixed(2)} doesn't match amount ÷ quantity (₹${computed.toFixed(2)}).`,
      });
    }
    // Indian retail fuel prices are well within this band; outside it is likely a typo.
    if (draft.pricePerUnit < 40 || draft.pricePerUnit > 200) {
      warnings.push({ code: 'price-unusual', message: `₹${draft.pricePerUnit.toFixed(2)} per ${vehicle.fuelType === 'cng' ? 'kg' : 'litre'} looks unusual.` });
    }
  }

  let periodKmPerUnit: number | null = null;
  if (errors.length === 0 && draft.isFullTank) {
    const asLog: FuelLog = {
      ...draft,
      id: draft.id ?? '__draft__',
      vehicleId: vehicle.id,
      stationName: null,
      stationPlaceId: null,
      notes: null,
      createdAt: 0,
      updatedAt: 0,
    };
    const withDraft = [...rest, asLog];
    const periods = computeMileagePeriods(withDraft);
    const mine = periods.find((p) => p.endLogId === asLog.id);
    if (mine) {
      periodKmPerUnit = mine.kmPerUnit;
      const earlier = computeMileagePeriods(rest.filter((l) => l.filledAt < draft.filledAt));
      if (earlier.length >= 2) {
        const avg = weightedEfficiency(earlier.slice(-ROLLING_WINDOW))!;
        const off = (mine.kmPerUnit - avg) / avg;
        if (Math.abs(off) > OUTLIER_THRESHOLD) {
          warnings.push({
            code: 'mileage-outlier',
            message: `This gives ${mine.kmPerUnit.toFixed(1)} km/${unit === 'kg' ? 'kg' : 'L'}, ${Math.round(Math.abs(off) * 100)}% ${off > 0 ? 'above' : 'below'} your average of ${avg.toFixed(1)}. Check the odometer and quantity, or mark that a fill was missed.`,
          });
        }
      }
    }
  }

  return { errors, warnings, periodKmPerUnit };
}
