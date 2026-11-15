import { estimatedOdometer, estimateFuel } from '../fuelLevel';
import { computeMileagePeriods, mileageStats, rollingSeries } from '../mileage';
import { estimateRange, formatRange } from '../range';
import { pricePerUnit, type FuelLog, type Vehicle } from '../types';
import { validateFuelLog, type FuelLogDraft } from '../validation';

const DAY = 86_400_000;
let seq = 0;
const log = (day: number, odometerKm: number, quantity: number, isFullTank = true, extra: Partial<FuelLog> = {}): FuelLog => ({
  id: `l${++seq}`,
  vehicleId: 'v1',
  filledAt: day * DAY,
  odometerKm,
  quantity,
  totalCost: quantity * 100,
  pricePerUnit: 100,
  isFullTank,
  missedPrevious: false,
  stationName: null,
  stationPlaceId: null,
  notes: null,
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

const car: Vehicle = {
  id: 'v1',
  name: 'Swift',
  vehicleType: 'car',
  fuelType: 'petrol',
  tankCapacity: 37,
  reserveFraction: 0.15,
  claimedKmPerUnit: 20,
  isActive: true,
  createdAt: 0,
  updatedAt: 0,
};

describe('pricePerUnit', () => {
  it('is amount ÷ litres, rounded to paise', () => {
    expect(pricePerUnit(2000, 19.3)).toBe(103.63);
    expect(pricePerUnit(100, 0)).toBeNull();
  });
});

describe('full-to-full mileage', () => {
  it('first entry with no previous fill produces no period', () => {
    expect(computeMileagePeriods([log(1, 10_000, 30)])).toEqual([]);
    expect(mileageStats([log(1, 10_000, 30)])).toEqual({ latest: null, rolling: null, lifetime: null, periodCount: 0 });
  });

  it('simple full → full', () => {
    const p = computeMileagePeriods([log(1, 10_000, 30), log(5, 10_500, 25)]);
    expect(p).toHaveLength(1);
    expect(p[0]!.distanceKm).toBe(500);
    expect(p[0]!.quantity).toBe(25);
    expect(p[0]!.kmPerUnit).toBe(20);
    expect(p[0]!.cost).toBe(2500);
  });

  it('includes partial fills in the litres of the period', () => {
    const p = computeMileagePeriods([
      log(1, 10_000, 30),
      log(3, 10_200, 10, false),
      log(5, 10_600, 20),
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]!.quantity).toBe(30);
    expect(p[0]!.kmPerUnit).toBeCloseTo(20);
  });

  it('partial fills before the first full fill are ignored', () => {
    const p = computeMileagePeriods([log(1, 9_800, 5, false), log(2, 10_000, 30), log(5, 10_400, 20)]);
    expect(p).toHaveLength(1);
    expect(p[0]!.kmPerUnit).toBe(20);
  });

  it('drops the period containing a missed entry and resumes after the next full fill', () => {
    const p = computeMileagePeriods([
      log(1, 10_000, 30),
      log(10, 11_200, 25, true, { missedPrevious: true }), // a fill in between wasn't logged
      log(14, 11_700, 25),
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]!.distanceKm).toBe(500);
    expect(p[0]!.kmPerUnit).toBe(20);
  });

  it('a missed partial fill also invalidates its period', () => {
    const p = computeMileagePeriods([
      log(1, 10_000, 30),
      log(3, 10_300, 10, false, { missedPrevious: true }),
      log(5, 10_700, 20),
    ]);
    expect(p).toEqual([]);
  });

  it('sorts out-of-order entries by date', () => {
    const p = computeMileagePeriods([log(5, 10_500, 25), log(1, 10_000, 30)]);
    expect(p[0]!.distanceKm).toBe(500);
  });

  it('latest, rolling average of last 5 and lifetime', () => {
    // periods: 20, 10, 20, 20, 20, 20  (each 25 L)
    const logs = [
      log(0, 0, 30),
      log(1, 500, 25),
      log(2, 750, 25),
      log(3, 1250, 25),
      log(4, 1750, 25),
      log(5, 2250, 25),
      log(6, 2750, 25),
    ];
    const s = mileageStats(logs);
    expect(s.periodCount).toBe(6);
    expect(s.latest).toBe(20);
    // last 5 periods: 250 + 4 × 500 km over 125 L
    expect(s.rolling).toBeCloseTo(2250 / 125);
    expect(s.lifetime).toBeCloseTo(2750 / 150);
  });

  it('rolling series has one value per period', () => {
    const periods = computeMileagePeriods([log(0, 0, 30), log(1, 500, 25), log(2, 750, 25)]);
    const r = rollingSeries(periods);
    expect(r).toHaveLength(2);
    expect(r[0]).toBe(20);
    expect(r[1]).toBeCloseTo(750 / 50);
  });
});

describe('validateFuelLog', () => {
  const history = [log(1, 10_000, 30), log(5, 10_500, 25), log(9, 11_000, 25), log(13, 11_500, 25)];
  const draft = (over: Partial<FuelLogDraft>): FuelLogDraft => ({
    filledAt: 17 * DAY,
    odometerKm: 12_000,
    quantity: 25,
    totalCost: 2500,
    pricePerUnit: 100,
    isFullTank: true,
    missedPrevious: false,
    ...over,
  });

  it('accepts a normal entry and reports its km/L', () => {
    const v = validateFuelLog(draft({}), history, car);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
    expect(v.periodKmPerUnit).toBe(20);
  });

  it('rejects an odometer that does not increase', () => {
    expect(validateFuelLog(draft({ odometerKm: 11_400 }), history, car).errors[0]).toMatch(/more than the previous/);
    expect(validateFuelLog(draft({ odometerKm: 11_500 }), history, car).errors[0]).toMatch(/more than the previous/);
  });

  it('rejects a back-dated entry whose odometer is beyond the next entry', () => {
    const v = validateFuelLog(draft({ filledAt: 7 * DAY, odometerKm: 11_100 }), history, car);
    expect(v.errors.join()).toMatch(/less than the next/);
  });

  it('requires quantity and amount', () => {
    const v = validateFuelLog(draft({ quantity: 0, totalCost: 0 }), history, car);
    expect(v.errors).toHaveLength(2);
  });

  it('flags km/L more than 40% off the rolling average', () => {
    const v = validateFuelLog(draft({ odometerKm: 12_800 }), history, car); // 32 km/L vs 20
    expect(v.warnings.map((w) => w.code)).toContain('mileage-outlier');
    expect(v.warnings[0]!.message).toMatch(/60% above/);
    const low = validateFuelLog(draft({ odometerKm: 11_750 }), history, car); // 10 km/L
    expect(low.warnings.map((w) => w.code)).toContain('mileage-outlier');
  });

  it('does not flag outliers with fewer than 2 earlier periods', () => {
    const v = validateFuelLog(draft({ filledAt: 6 * DAY, odometerKm: 10_600 }), history.slice(0, 2), car);
    expect(v.warnings.map((w) => w.code)).not.toContain('mileage-outlier');
  });

  it('warns about more fuel than the tank holds and a price mismatch', () => {
    const v = validateFuelLog(draft({ quantity: 45, totalCost: 4500, pricePerUnit: 120 }), history, car);
    const codes = v.warnings.map((w) => w.code);
    expect(codes).toContain('over-capacity');
    expect(codes).toContain('price-mismatch');
  });

  it('editing an entry ignores itself when checking the odometer', () => {
    const existing = history[3]!;
    const v = validateFuelLog(draft({ id: existing.id, filledAt: existing.filledAt, odometerKm: 11_510 }), history, car);
    expect(v.errors).toEqual([]);
  });
});

describe('estimateFuel', () => {
  const base = { capacity: 40, corrections: [], ticks: [], kmPerUnit: 20 };

  it('is unknown before any log', () => {
    expect(estimateFuel({ ...base, logs: [], now: 0 }).quantity).toBeNull();
  });

  it('full tank minus GPS distance since', () => {
    const e = estimateFuel({ ...base, logs: [log(1, 10_000, 30)], ticks: [{ at: 1.5 * DAY, km: 200 }], now: 2 * DAY });
    expect(e.quantity).toBe(30);
    expect(e.fraction).toBe(0.75);
  });

  it('partial fill adds to the previous estimate, capped at capacity, re-syncing with the odometer', () => {
    const logs = [log(1, 10_000, 30), log(3, 10_400, 10, false)];
    // 400 km by odometer at 20 km/L = 20 L used → 20 + 10 = 30 L
    expect(estimateFuel({ ...base, logs, now: 3 * DAY }).quantity).toBe(30);
    const big = [log(1, 10_000, 30), log(3, 10_100, 30, false)];
    expect(estimateFuel({ ...base, logs: big, now: 3 * DAY }).quantity).toBe(40);
  });

  it('first log partial: guesses the tank held just that much', () => {
    const e = estimateFuel({ ...base, logs: [log(1, 10_000, 12, false)], now: 2 * DAY });
    expect(e.quantity).toBe(12);
    expect(e.startGuessed).toBe(true);
  });

  it('manual correction resets the level; GPS distance is used after it', () => {
    const e = estimateFuel({
      ...base,
      logs: [log(1, 10_000, 30)],
      corrections: [{ id: 'c', vehicleId: 'v1', at: 2 * DAY, fraction: 0.5, createdAt: 0, updatedAt: 0 }],
      ticks: [
        { at: 1.5 * DAY, km: 100 },
        { at: 2.5 * DAY, km: 100 },
      ],
      now: 3 * DAY,
    });
    expect(e.quantity).toBe(15); // 20 L − 100 km / 20
  });

  it('reports an impossible (negative) raw estimate but clamps the displayed level', () => {
    const e = estimateFuel({ ...base, logs: [log(1, 10_000, 30)], ticks: [{ at: 2 * DAY, km: 1000 }], now: 3 * DAY });
    expect(e.quantity).toBe(0);
    expect(e.rawQuantity).toBe(-10);
  });

  it('estimated odometer = last log + GPS since', () => {
    expect(estimatedOdometer([log(1, 10_000, 30)], [{ at: 1.2 * DAY, km: 42.4 }], 2 * DAY)).toBe(10_042);
    expect(estimatedOdometer([], [], 0)).toBeNull();
  });
});

describe('estimateRange', () => {
  it('uses the claimed efficiency until there is real mileage, with low confidence', () => {
    const r = estimateRange({ vehicle: car, logs: [log(1, 10_000, 30)], corrections: [], ticks: [], now: 2 * DAY });
    expect(r.efficiencySource).toBe('claimed');
    expect(r.rangeKm).toBe(37 * 20);
    expect(r.lowConfidence).toBe(true);
    expect(r.reserveQuantity).toBeCloseTo(5.55);
  });

  it('uses the rolling average once periods exist; confident after 2', () => {
    const logs = [log(1, 10_000, 30), log(5, 10_400, 25), log(9, 10_800, 25)]; // 16 km/L
    const r = estimateRange({ vehicle: car, logs, corrections: [], ticks: [{ at: 10 * DAY, km: 160 }], now: 11 * DAY });
    expect(r.efficiencySource).toBe('rolling');
    expect(r.kmPerUnit).toBe(16);
    expect(r.fuel.quantity).toBe(27);
    expect(r.rangeKm).toBe(432);
    expect(r.rangeToReserveKm).toBeCloseTo((27 - 5.55) * 16);
    expect(r.lowConfidence).toBe(false);
    expect(r.atReserve).toBe(false);
  });

  it('formats range', () => {
    expect(formatRange(213)).toBe('≈ 210 km range');
    expect(formatRange(47)).toBe('≈ 45 km range');
    expect(formatRange(null)).toBe('Range —');
  });
});
