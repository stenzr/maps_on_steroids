import type { LatLng, LocationFix } from '../../types';
import { destinationPoint } from '../../geo/bearing';
import { angleDelta } from '../angles';
import { findTrendAnchor, pushFix } from '../fixBuffer';
import {
  DEFAULT_HEADING_CONFIG,
  initialHeadingState,
  updateHeading,
  type HeadingConfig,
  type HeadingOutput,
  type HeadingState,
} from '../headingEstimator';
import { DriveSimulator } from '../../sim/driveSimulator';
import { PUNE_NASHIK_WAYPOINTS } from '../../sim/fixtures/puneNashik';

const ORIGIN: LatLng = { latitude: 18.6, longitude: 73.85 };

const fix = (p: LatLng, t: number, extra: Partial<LocationFix> = {}): LocationFix => ({
  latitude: p.latitude,
  longitude: p.longitude,
  timestamp: t,
  accuracy: 5,
  speed: null,
  course: null,
  ...extra,
});

/** Drive in a straight line: one fix per second at `speedMps`. */
function straightDrive(start: LatLng, bearing: number, speedMps: number, seconds: number, t0 = 0, extra: Partial<LocationFix> = {}): LocationFix[] {
  return Array.from({ length: seconds }, (_, i) =>
    fix(destinationPoint(start, bearing, speedMps * (i + 1)), t0 + (i + 1) * 1000, { speed: speedMps, ...extra }),
  );
}

function feed(fixes: LocationFix[], cfg: HeadingConfig = DEFAULT_HEADING_CONFIG, s: HeadingState = initialHeadingState()) {
  const outputs: HeadingOutput[] = [];
  let state = s;
  for (const f of fixes) {
    const r = updateHeading(state, f, cfg);
    state = r.state;
    outputs.push(r.output);
  }
  return { state, outputs, last: outputs[outputs.length - 1]! };
}

describe('fix buffer', () => {
  it('trend anchor is the most recent fix at least D behind', () => {
    const fixes = straightDrive(ORIGIN, 0, 10, 10); // 10 m apart
    const current = fixes[9]!;
    const anchor = findTrendAnchor(fixes.slice(0, 9), current, 29)!;
    expect(anchor.timestamp).toBe(fixes[6]!.timestamp); // 30 m behind (≥ 29 m)
  });

  it('prunes history that is far behind but keeps one fix beyond keepDistance', () => {
    let buf: LocationFix[] = [];
    for (const f of straightDrive(ORIGIN, 0, 20, 30)) buf = pushFix(buf, f, { maxAgeMs: 1e9, keepDistanceM: 99, maxLength: 1000 });
    expect(buf.length).toBe(6); // 100 m anchor (≥ 99 m) + 4 in between + current
  });

  it('prunes by age', () => {
    let buf: LocationFix[] = [];
    for (let i = 0; i < 100; i++) buf = pushFix(buf, fix(ORIGIN, i * 1000), { maxAgeMs: 10_000, keepDistanceM: 100, maxLength: 1000 });
    expect(buf[0]!.timestamp).toBe(89_000);
  });
});

describe('updateHeading — trend bearing', () => {
  it.each([0, 45, 90, 180, 270, 315])('straight drive at %p° gives that heading', (brg) => {
    const { last } = feed(straightDrive(ORIGIN, brg, 3, 40));
    expect(last.source).toBe('trend');
    expect(Math.abs(angleDelta(brg, last.heading!))).toBeLessThan(0.5);
  });

  it('has no heading until we have moved D metres', () => {
    const { outputs } = feed(straightDrive(ORIGIN, 90, 3, 20));
    // 3 m/s with D=30 → first trend heading at ~10 s
    expect(outputs[5]!.heading).toBeNull();
    expect(outputs[5]!.source).toBe('none');
    expect(outputs[15]!.heading).not.toBeNull();
  });

  it('discards fixes worse than 20 m accuracy', () => {
    const fixes = straightDrive(ORIGIN, 0, 3, 40);
    const bad = fix(destinationPoint(ORIGIN, 90, 500), 40_500, { accuracy: 35, speed: 3 });
    const { state } = feed(fixes);
    const r = updateHeading(state, bad);
    expect(r.output.accepted).toBe(false);
    expect(r.output.rejection).toBe('low-accuracy');
    expect(r.output.heading).toBeCloseTo(state.heading!, 6);
  });

  it('discards an implausible jump', () => {
    const { state } = feed(straightDrive(ORIGIN, 0, 10, 40));
    const jump = fix(destinationPoint(ORIGIN, 90, 5000), 41_000, { speed: 10 });
    const r = updateHeading(state, jump);
    expect(r.output.rejection).toBe('implausible-jump');
  });

  it('respects a configurable window D', () => {
    // Drive east, then turn north. With D=10 the arrow follows the turn sooner than with D=100.
    const east = straightDrive(ORIGIN, 90, 5, 60);
    const north = straightDrive(east[east.length - 1]!, 0, 5, 6, 60_000);
    const cfg = (d: number): HeadingConfig => ({ ...DEFAULT_HEADING_CONFIG, windowMeters: d, smoothingAlpha: 1 });
    const short = feed([...east, ...north], cfg(10)).last.heading!;
    const long = feed([...east, ...north], cfg(100)).last.heading!;
    expect(Math.abs(angleDelta(0, short))).toBeLessThan(Math.abs(angleDelta(0, long)));
  });
});

describe('updateHeading — GPS course blending', () => {
  it('blends a valid course when faster than 15 km/h', () => {
    const fixes = straightDrive(ORIGIN, 0, 20, 30, 0, { course: 20 });
    const { last } = feed(fixes, { ...DEFAULT_HEADING_CONFIG, smoothingAlpha: 1, courseWeight: 0.5 });
    expect(last.source).toBe('trend+course');
    expect(last.heading).toBeCloseTo(10, 0);
  });

  it('ignores course below 15 km/h', () => {
    const fixes = straightDrive(ORIGIN, 0, 3, 40, 0, { course: 90 });
    const { last } = feed(fixes);
    expect(last.source).toBe('trend');
    expect(Math.abs(angleDelta(0, last.heading!))).toBeLessThan(0.5);
  });

  it('ignores an invalid (-1) course', () => {
    const { last } = feed(straightDrive(ORIGIN, 0, 20, 30, 0, { course: -1 }));
    expect(last.source).toBe('trend');
  });

  it('blends correctly across north (course 350°, trend 10°)', () => {
    const fixes = straightDrive(ORIGIN, 10, 20, 30, 0, { course: 350 });
    const { last } = feed(fixes, { ...DEFAULT_HEADING_CONFIG, smoothingAlpha: 1 });
    expect(Math.abs(angleDelta(0, last.heading!))).toBeLessThan(0.5);
  });

  it('uses course alone when fast but not yet D metres of history', () => {
    const r = updateHeading(initialHeadingState(), fix(ORIGIN, 1000, { speed: 20, course: 123 }));
    expect(r.output.source).toBe('course');
    expect(r.output.heading).toBeCloseTo(123);
  });
});

describe('updateHeading — stationary freeze', () => {
  const driveThenStop = (jitterFixes: LocationFix[]) => {
    const drive = straightDrive(ORIGIN, 60, 10, 30);
    return feed([...drive, ...jitterFixes]);
  };

  it('freezes at the last good heading when speed < 1.5 m/s, despite jitter', () => {
    const stopAt = destinationPoint(ORIGIN, 60, 300);
    // GPS wandering ±8 m in random directions with junk course values.
    const jitter = Array.from({ length: 60 }, (_, i) =>
      fix(destinationPoint(stopAt, (i * 137) % 360, 8), 31_000 + i * 1000, { speed: 0.3, course: (i * 97) % 360 }),
    );
    const { outputs } = driveThenStop(jitter);
    const before = outputs[29]!.heading!;
    expect(Math.abs(angleDelta(60, before))).toBeLessThan(1);
    for (const o of outputs.slice(30)) {
      expect(o.stationary).toBe(true);
      expect(o.source).toBe('frozen');
      expect(o.heading).toBe(before);
    }
  });

  it('freezes when speed is unknown but we moved < 15 m in the last 10 s', () => {
    const stopAt = destinationPoint(ORIGIN, 60, 300);
    const jitter = Array.from({ length: 40 }, (_, i) =>
      fix(destinationPoint(stopAt, (i * 211) % 360, 6), 31_000 + i * 1000, { speed: null, course: null }),
    );
    const { outputs } = driveThenStop(jitter);
    // Without a speed reading, the first 10 s at the stop can still nudge the arrow a little
    // (jitter vs. an anchor ≥ 30 m back). After that every output is frozen at one value.
    const frozenAt = outputs[41]!.heading!;
    expect(Math.abs(angleDelta(60, frozenAt))).toBeLessThan(15);
    for (const o of outputs.slice(41)) {
      expect(o.stationary).toBe(true);
      expect(o.heading).toBe(frozenAt);
    }
  });

  it('does not freeze slow driving with a large D (36 km/h, D = 100 m)', () => {
    const fixes = straightDrive(ORIGIN, 200, 10, 60, 0, { speed: null });
    const { outputs } = feed(fixes, { ...DEFAULT_HEADING_CONFIG, windowMeters: 100 });
    expect(outputs.slice(15).every((o) => !o.stationary)).toBe(true);
  });

  it('resumes tracking after the stop', () => {
    const stopAt = destinationPoint(ORIGIN, 60, 300);
    const jitter = Array.from({ length: 20 }, (_, i) => fix(stopAt, 31_000 + i * 1000, { speed: 0 }));
    const away = straightDrive(stopAt, 150, 8, 30, 51_000);
    const { last } = driveThenStop([...jitter, ...away]);
    expect(last.stationary).toBe(false);
    expect(Math.abs(angleDelta(150, last.heading!))).toBeLessThan(2);
  });
});

describe('updateHeading on a simulated Pune → Nashik drive', () => {
  it('tracks the road bearing while cruising and freezes at a stop', () => {
    const sim = new DriveSimulator(PUNE_NASHIK_WAYPOINTS, {
      speedKmh: 60,
      noiseM: 3,
      stops: [{ atDistanceM: 5000, durationMs: 120_000 }],
    });
    let state = initialHeadingState();
    const errors: number[] = [];
    let frozenTicks = 0;
    let headingAtStop: number | null = null;
    let headingChangedWhileStopped = false;

    for (let i = 0; i < 900 && !sim.finished; i++) {
      const f = sim.next();
      const r = updateHeading(state, f);
      state = r.state;
      if (r.output.stationary) {
        frozenTicks++;
        headingAtStop ??= r.output.heading;
        if (r.output.heading !== headingAtStop) headingChangedWhileStopped = true;
      } else if (i > 30 && f.speed! > 15 && f.course !== null && r.output.heading !== null) {
        // Compare with the simulator's true course (itself ±3° noisy).
        errors.push(Math.abs(angleDelta(f.course, r.output.heading)));
      }
    }
    errors.sort((a, b) => a - b);
    const pct = (p: number) => errors[Math.floor(errors.length * p)]!;
    expect(frozenTicks).toBeGreaterThan(100);
    expect(headingChangedWhileStopped).toBe(false);
    expect(pct(0.5)).toBeLessThan(4);
    // The worst errors are the brief lag at sharp waypoint corners.
    expect(pct(0.95)).toBeLessThan(15);
  });
});
