export type FuelType = 'petrol' | 'diesel' | 'cng';
export type VehicleType = 'car' | 'two-wheeler';

/** Petrol and diesel are sold by the litre; CNG by the kilogram. */
export type FuelUnit = 'L' | 'kg';
export const fuelUnit = (t: FuelType): FuelUnit => (t === 'cng' ? 'kg' : 'L');
export const efficiencyUnit = (t: FuelType): string => `km/${fuelUnit(t)}`;

export interface Vehicle {
  id: string;
  name: string;
  vehicleType: VehicleType;
  fuelType: FuelType;
  /** Tank capacity in the fuel's unit (L or kg). */
  tankCapacity: number;
  /** Reserve warning level as a fraction of the tank (default 0.15). */
  reserveFraction: number;
  /** Manufacturer-claimed km per unit; used until real mileage exists. */
  claimedKmPerUnit: number | null;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface FuelLog {
  id: string;
  vehicleId: string;
  /** Epoch ms. */
  filledAt: number;
  odometerKm: number;
  /** Litres (or kg for CNG). */
  quantity: number;
  /** Total paid, ₹. */
  totalCost: number;
  /** ₹ per unit. */
  pricePerUnit: number;
  isFullTank: boolean;
  /** User says a fill before this one wasn't logged; the period around it is excluded from mileage. */
  missedPrevious: boolean;
  stationName: string | null;
  stationPlaceId: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

/** A manual fuel-gauge correction ("slider: E to F"). */
export interface FuelCorrection {
  id: string;
  vehicleId: string;
  at: number;
  /** 0 (empty) – 1 (full). */
  fraction: number;
  createdAt: number;
  updatedAt: number;
}

/** GPS distance driven, recorded in small chunks while tracking. */
export interface DistanceTick {
  at: number;
  km: number;
}

export const DEFAULT_RESERVE_FRACTION = 0.15;

/** Fallback efficiency when there's no claimed or measured value. */
export function defaultEfficiency(vehicleType: VehicleType, fuelType: FuelType): number {
  if (vehicleType === 'two-wheeler') return 45;
  return fuelType === 'cng' ? 22 : fuelType === 'diesel' ? 17 : 15;
}

/** Price per unit from amount ÷ quantity, rounded to paise. */
export function pricePerUnit(totalCost: number, quantity: number): number | null {
  if (!(quantity > 0) || !(totalCost >= 0)) return null;
  return Math.round((totalCost / quantity) * 100) / 100;
}
