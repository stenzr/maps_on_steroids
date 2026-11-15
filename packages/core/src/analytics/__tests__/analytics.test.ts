import type { FuelLog, Vehicle } from '../../fuel/types';
import { costSummary, efficiencySeries, istMonthKey, monthlySpend, priceSeries, tripSummary } from '../aggregations';
import { csvField, fuelLogCsv, istDateTime } from '../csv';

const log = (id: string, iso: string, odometerKm: number, quantity: number, totalCost: number, over: Partial<FuelLog> = {}): FuelLog => ({
  id,
  vehicleId: 'v1',
  filledAt: Date.parse(iso),
  odometerKm,
  quantity,
  totalCost,
  pricePerUnit: Math.round((totalCost / quantity) * 100) / 100,
  isFullTank: true,
  missedPrevious: false,
  stationName: null,
  stationPlaceId: null,
  notes: null,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const vehicle: Vehicle = {
  id: 'v1',
  name: 'Swift',
  vehicleType: 'car',
  fuelType: 'petrol',
  tankCapacity: 37,
  reserveFraction: 0.15,
  claimedKmPerUnit: null,
  isActive: true,
  createdAt: 0,
  updatedAt: 0,
};

const logs = [
  log('a', '2026-09-30T20:00:00Z', 10_000, 30, 3000), // 1 Oct 01:30 IST
  log('b', '2026-10-10T05:00:00Z', 10_500, 25, 2550),
  log('c', '2026-11-02T05:00:00Z', 11_000, 25, 2600, { stationName: 'HP, "Chakan"', notes: '=cmd' }),
];

describe('analytics', () => {
  it('month keys use IST', () => {
    expect(istMonthKey(Date.parse('2026-09-30T20:00:00Z'))).toBe('2026-10');
    expect(istMonthKey(Date.parse('2026-09-30T18:00:00Z'))).toBe('2026-09');
  });

  it('monthly spend', () => {
    expect(monthlySpend(logs)).toEqual([
      { month: '2026-10', totalCost: 5550, quantity: 55, fills: 2 },
      { month: '2026-11', totalCost: 2600, quantity: 25, fills: 1 },
    ]);
  });

  it('efficiency series with rolling line', () => {
    const s = efficiencySeries(logs);
    expect(s.map((p) => p.kmPerUnit)).toEqual([20, 20]);
    expect(s[1]!.rolling).toBe(20);
  });

  it('price series and cost per km', () => {
    expect(priceSeries(logs).map((p) => p.price)).toEqual([100, 102, 104]);
    const c = costSummary(logs);
    expect(c.costPerKm).toBeCloseTo((2550 + 2600) / 1000);
    expect(c.totalSpend).toBe(8150);
    expect(c.distanceKm).toBe(1000);
  });

  it('trip summary', () => {
    const t = tripSummary({ startedAt: 0, endedAt: 3.5 * 3600_000, distanceKm: 210, stops: 2, kmPerUnit: 15, pricePerUnit: 104 });
    expect(t.durationMin).toBe(210);
    expect(t.estFuel).toBe(14);
    expect(t.estCost).toBe(1456);
    expect(t.avgSpeedKmh).toBe(60);
  });
});

describe('CSV', () => {
  it('escapes fields per RFC 4180 and blocks formula injection', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvField(-5)).toBe('-5');
    expect(csvField(null)).toBe('');
  });

  it('IST date time', () => {
    expect(istDateTime(Date.parse('2026-09-30T20:00:00Z'))).toBe('2026-10-01 01:30');
  });

  it('exports the fuel log', () => {
    const csv = fuelLogCsv(logs, [vehicle]);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe(
      'date_time_ist,vehicle,fuel_type,odometer_km,quantity,unit,total_inr,price_per_unit_inr,full_tank,missed_previous,station,notes',
    );
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('2026-10-01 01:30,Swift,petrol,10000,30,L,3000,100,yes,no,,');
    expect(lines[3]).toBe('2026-11-02 10:30,Swift,petrol,11000,25,L,2600,104,yes,no,"HP, ""Chakan""",\'=cmd');
  });
});
