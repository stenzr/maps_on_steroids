import {
  angleDelta,
  circularWeightedMean,
  emptyAngleFilter,
  isValidAngle,
  normalizeDegrees,
  smoothAngle,
  type AngleFilterState,
} from '../angles';

describe('normalizeDegrees', () => {
  it.each([
    [0, 0],
    [360, 0],
    [720, 0],
    [-1, 359],
    [-360, 0],
    [361, 1],
    [-0, 0],
  ])('%p → %p', (input, expected) => {
    expect(normalizeDegrees(input)).toBe(expected);
  });
});

describe('angleDelta', () => {
  it('takes the short way across north', () => {
    expect(angleDelta(350, 10)).toBeCloseTo(20);
    expect(angleDelta(10, 350)).toBeCloseTo(-20);
  });
  it('180° is +180', () => {
    expect(angleDelta(0, 180)).toBe(180);
  });
});

describe('isValidAngle', () => {
  it('rejects null, NaN and the -1 "unknown" sentinel', () => {
    expect(isValidAngle(null)).toBe(false);
    expect(isValidAngle(undefined)).toBe(false);
    expect(isValidAngle(NaN)).toBe(false);
    expect(isValidAngle(-1)).toBe(false);
    expect(isValidAngle(0)).toBe(true);
    expect(isValidAngle(359.9)).toBe(true);
  });
});

describe('circularWeightedMean', () => {
  it('averages across 0/360 correctly', () => {
    expect(circularWeightedMean([{ deg: 350, weight: 1 }, { deg: 10, weight: 1 }])).toBeCloseTo(0, 6);
  });
  it('respects weights', () => {
    const m = circularWeightedMean([{ deg: 0, weight: 3 }, { deg: 90, weight: 1 }])!;
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThan(45);
  });
  it('returns null when vectors cancel', () => {
    expect(circularWeightedMean([{ deg: 0, weight: 1 }, { deg: 180, weight: 1 }])).toBeNull();
  });
});

describe('smoothAngle (EMA on sin/cos)', () => {
  const run = (samples: number[], alpha: number): number[] => {
    let s: AngleFilterState = emptyAngleFilter();
    return samples.map((d) => {
      const r = smoothAngle(s, d, alpha);
      s = r.state;
      return r.value;
    });
  };

  it('first sample passes through unchanged', () => {
    expect(run([123], 0.3)).toEqual([123]);
  });

  it('crossing 359° → 1° stays near north (no swing through 180°)', () => {
    const out = run([355, 357, 359, 1, 3, 5], 0.4);
    for (const v of out) {
      expect(Math.abs(angleDelta(0, v))).toBeLessThan(6);
    }
    // the naive average of 359 and 1 would be 180
    expect(Math.abs(angleDelta(0, out[3]!))).toBeLessThan(3);
  });

  it('crossing 1° → 359° the other way also stays near north', () => {
    const out = run([5, 3, 1, 359, 357, 355], 0.4);
    for (const v of out) expect(Math.abs(angleDelta(0, v))).toBeLessThan(6);
  });

  it('converges to a new steady heading', () => {
    const out = run([10, ...Array(40).fill(100)], 0.3);
    expect(out[out.length - 1]).toBeCloseTo(100, 3);
  });

  it('moves gradually: a 90° turn is not applied in one step with alpha < 1', () => {
    const out = run([0, 90], 0.3);
    expect(out[1]).toBeGreaterThan(0);
    expect(out[1]).toBeLessThan(45);
  });

  it('output is always in [0, 360)', () => {
    const out = run([359.9, 0.1, 359.5, 0.5, 180, 270], 0.5);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(360);
    }
  });

  it('opposite sample that would cancel to zero falls back to the new sample', () => {
    const out = run([0, 180], 0.5);
    expect(out[1]).toBeCloseTo(180, 6);
  });
});
