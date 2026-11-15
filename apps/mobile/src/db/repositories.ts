import { randomUUID } from 'expo-crypto';
import type { DistanceTick, FuelCorrection, FuelLog, FuelType, Vehicle, VehicleType } from '@roadtrip/core';
import { getDb } from './database';

export const newId = (): string => randomUUID();

// ---------- vehicles ----------

interface VehicleRow {
  id: string;
  name: string;
  vehicle_type: string;
  fuel_type: string;
  tank_capacity: number;
  reserve_fraction: number;
  claimed_km_per_unit: number | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

const toVehicle = (r: VehicleRow): Vehicle => ({
  id: r.id,
  name: r.name,
  vehicleType: r.vehicle_type as VehicleType,
  fuelType: r.fuel_type as FuelType,
  tankCapacity: r.tank_capacity,
  reserveFraction: r.reserve_fraction,
  claimedKmPerUnit: r.claimed_km_per_unit,
  isActive: r.is_active === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listVehicles(): Promise<Vehicle[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<VehicleRow>('SELECT * FROM vehicles WHERE deleted_at IS NULL ORDER BY created_at');
  return rows.map(toVehicle);
}

export async function saveVehicle(v: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt' | 'isActive'> & { id?: string }): Promise<string> {
  const db = await getDb();
  const now = Date.now();
  if (v.id) {
    await db.runAsync(
      `UPDATE vehicles SET name=?, vehicle_type=?, fuel_type=?, tank_capacity=?, reserve_fraction=?, claimed_km_per_unit=?, updated_at=? WHERE id=?`,
      [v.name, v.vehicleType, v.fuelType, v.tankCapacity, v.reserveFraction, v.claimedKmPerUnit, now, v.id],
    );
    return v.id;
  }
  const id = newId();
  const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM vehicles WHERE deleted_at IS NULL');
  await db.runAsync(
    `INSERT INTO vehicles (id, name, vehicle_type, fuel_type, tank_capacity, reserve_fraction, claimed_km_per_unit, is_active, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, v.name, v.vehicleType, v.fuelType, v.tankCapacity, v.reserveFraction, v.claimedKmPerUnit, (count?.n ?? 0) === 0 ? 1 : 0, now, now],
  );
  return id;
}

export async function setActiveVehicle(id: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE vehicles SET is_active=0, updated_at=? WHERE is_active=1', [now]);
    await db.runAsync('UPDATE vehicles SET is_active=1, updated_at=? WHERE id=?', [now, id]);
  });
}

export async function deleteVehicle(id: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync('UPDATE vehicles SET deleted_at=?, is_active=0, updated_at=? WHERE id=?', [now, now, id]);
  const next = await db.getFirstAsync<{ id: string }>('SELECT id FROM vehicles WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1');
  const active = await db.getFirstAsync<{ id: string }>('SELECT id FROM vehicles WHERE deleted_at IS NULL AND is_active=1');
  if (next && !active) await setActiveVehicle(next.id);
}

// ---------- fuel logs ----------

interface FuelLogRow {
  id: string;
  vehicle_id: string;
  filled_at: number;
  odometer_km: number;
  odometer_estimated: number;
  quantity: number;
  total_cost: number;
  price_per_unit: number;
  is_full_tank: number;
  missed_previous: number;
  station_name: string | null;
  station_place_id: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export type StoredFuelLog = FuelLog & { odometerEstimated: boolean };

const toLog = (r: FuelLogRow): StoredFuelLog => ({
  id: r.id,
  vehicleId: r.vehicle_id,
  filledAt: r.filled_at,
  odometerKm: r.odometer_km,
  odometerEstimated: r.odometer_estimated === 1,
  quantity: r.quantity,
  totalCost: r.total_cost,
  pricePerUnit: r.price_per_unit,
  isFullTank: r.is_full_tank === 1,
  missedPrevious: r.missed_previous === 1,
  stationName: r.station_name,
  stationPlaceId: r.station_place_id,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listFuelLogs(vehicleId?: string): Promise<StoredFuelLog[]> {
  const db = await getDb();
  const rows = vehicleId
    ? await db.getAllAsync<FuelLogRow>('SELECT * FROM fuel_logs WHERE deleted_at IS NULL AND vehicle_id=? ORDER BY filled_at', [vehicleId])
    : await db.getAllAsync<FuelLogRow>('SELECT * FROM fuel_logs WHERE deleted_at IS NULL ORDER BY filled_at');
  return rows.map(toLog);
}

export type FuelLogInput = Omit<StoredFuelLog, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export async function saveFuelLog(l: FuelLogInput): Promise<string> {
  const db = await getDb();
  const now = Date.now();
  const values = [
    l.vehicleId,
    l.filledAt,
    l.odometerKm,
    l.odometerEstimated ? 1 : 0,
    l.quantity,
    l.totalCost,
    l.pricePerUnit,
    l.isFullTank ? 1 : 0,
    l.missedPrevious ? 1 : 0,
    l.stationName,
    l.stationPlaceId,
    l.notes,
  ];
  if (l.id) {
    await db.runAsync(
      `UPDATE fuel_logs SET vehicle_id=?, filled_at=?, odometer_km=?, odometer_estimated=?, quantity=?, total_cost=?, price_per_unit=?,
       is_full_tank=?, missed_previous=?, station_name=?, station_place_id=?, notes=?, updated_at=? WHERE id=?`,
      [...values, now, l.id],
    );
    return l.id;
  }
  const id = newId();
  await db.runAsync(
    `INSERT INTO fuel_logs (vehicle_id, filled_at, odometer_km, odometer_estimated, quantity, total_cost, price_per_unit, is_full_tank,
       missed_previous, station_name, station_place_id, notes, id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [...values, id, now, now],
  );
  return id;
}

export async function deleteFuelLog(id: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync('UPDATE fuel_logs SET deleted_at=?, updated_at=? WHERE id=?', [now, now, id]);
}

// ---------- corrections ----------

export async function listCorrections(vehicleId: string): Promise<FuelCorrection[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; vehicle_id: string; at: number; fraction: number; created_at: number; updated_at: number }>(
    'SELECT * FROM fuel_corrections WHERE deleted_at IS NULL AND vehicle_id=? ORDER BY at',
    [vehicleId],
  );
  return rows.map((r) => ({ id: r.id, vehicleId: r.vehicle_id, at: r.at, fraction: r.fraction, createdAt: r.created_at, updatedAt: r.updated_at }));
}

export async function addCorrection(vehicleId: string, fraction: number): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync('INSERT INTO fuel_corrections (id, vehicle_id, at, fraction, created_at, updated_at) VALUES (?,?,?,?,?,?)', [
    newId(),
    vehicleId,
    now,
    Math.min(1, Math.max(0, fraction)),
    now,
    now,
  ]);
}

// ---------- distance ticks ----------

export async function addDistanceTick(vehicleId: string | null, tripId: string | null, at: number, km: number): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync('INSERT INTO distance_ticks (id, vehicle_id, trip_id, at, km, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', [
    newId(),
    vehicleId,
    tripId,
    at,
    km,
    now,
    now,
  ]);
}

export async function listDistanceTicks(vehicleId: string, sinceMs: number): Promise<DistanceTick[]> {
  const db = await getDb();
  return db.getAllAsync<DistanceTick>('SELECT at, km FROM distance_ticks WHERE deleted_at IS NULL AND vehicle_id=? AND at>=? ORDER BY at', [
    vehicleId,
    sinceMs,
  ]);
}

// ---------- trips ----------

export interface TripRow {
  id: string;
  vehicleId: string | null;
  startedAt: number;
  endedAt: number;
  distanceKm: number;
  stops: number;
}

export async function upsertTrip(t: TripRow): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO trips (id, vehicle_id, started_at, ended_at, distance_km, stops, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET ended_at=excluded.ended_at, distance_km=excluded.distance_km, stops=excluded.stops, updated_at=excluded.updated_at`,
    [t.id, t.vehicleId, t.startedAt, t.endedAt, t.distanceKm, t.stops, now, now],
  );
}

export async function listTrips(limit = 50): Promise<TripRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; vehicle_id: string | null; started_at: number; ended_at: number; distance_km: number; stops: number }>(
    'SELECT * FROM trips WHERE deleted_at IS NULL AND distance_km >= 1 ORDER BY started_at DESC LIMIT ?',
    [limit],
  );
  return rows.map((r) => ({ id: r.id, vehicleId: r.vehicle_id, startedAt: r.started_at, endedAt: r.ended_at, distanceKm: r.distance_km, stops: r.stops }));
}

// ---------- prompts (dedupe for notifications) ----------

export async function wasPromptSent(id: string): Promise<boolean> {
  const db = await getDb();
  return (await db.getFirstAsync('SELECT id FROM prompts WHERE id=?', [id])) !== null;
}

export async function markPromptSent(id: string, kind: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync('INSERT OR REPLACE INTO prompts (id, kind, sent_at, created_at, updated_at) VALUES (?,?,?,?,?)', [id, kind, now, now, now]);
}

export async function lastPromptSent(kind: string): Promise<number | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ t: number | null }>('SELECT MAX(sent_at) AS t FROM prompts WHERE kind=?', [kind]);
  return r?.t ?? null;
}

// ---------- settings (JSON blob per key) ----------

export async function readSetting<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key=?', [key]);
  if (!r) return null;
  try {
    return JSON.parse(r.value) as T;
  } catch {
    return null;
  }
}

export async function writeSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?,?,?)', [key, JSON.stringify(value), Date.now()]);
}
