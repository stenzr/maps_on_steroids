import * as SQLite from 'expo-sqlite';

/**
 * Local-first storage. Every table has a UUID primary key plus created_at / updated_at and a
 * nullable deleted_at (soft delete), so cloud sync can be added later without a schema rewrite.
 * Google Places content is not stored here apart from place_id (and the station name the user
 * logged with a fill, which is their own record).
 */
const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    vehicle_type TEXT NOT NULL DEFAULT 'car',
    fuel_type TEXT NOT NULL,
    tank_capacity REAL NOT NULL,
    reserve_fraction REAL NOT NULL DEFAULT 0.15,
    claimed_km_per_unit REAL,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS fuel_logs (
    id TEXT PRIMARY KEY NOT NULL,
    vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
    filled_at INTEGER NOT NULL,
    odometer_km REAL NOT NULL,
    odometer_estimated INTEGER NOT NULL DEFAULT 0,
    quantity REAL NOT NULL,
    total_cost REAL NOT NULL,
    price_per_unit REAL NOT NULL,
    is_full_tank INTEGER NOT NULL,
    missed_previous INTEGER NOT NULL DEFAULT 0,
    station_name TEXT,
    station_place_id TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_fuel_logs_vehicle ON fuel_logs(vehicle_id, filled_at);
  CREATE TABLE IF NOT EXISTS fuel_corrections (
    id TEXT PRIMARY KEY NOT NULL,
    vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
    at INTEGER NOT NULL,
    fraction REAL NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY NOT NULL,
    vehicle_id TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    distance_km REAL NOT NULL DEFAULT 0,
    stops INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS distance_ticks (
    id TEXT PRIMARY KEY NOT NULL,
    vehicle_id TEXT,
    trip_id TEXT,
    at INTEGER NOT NULL,
    km REAL NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_ticks_vehicle ON distance_ticks(vehicle_id, at);
  CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    sent_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
];

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[v]!);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

/** Shared connection; migrations run once on first use. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= SQLite.openDatabaseAsync('roadtrip.db').then(async (db) => {
    await migrate(db);
    return db;
  });
  return dbPromise;
}
