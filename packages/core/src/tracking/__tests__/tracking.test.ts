import type { LatLng, LocationFix } from '../../types';
import { destinationPoint } from '../../geo/bearing';
import { pathLength } from '../../geo/path';
import { DriveSimulator } from '../../sim/driveSimulator';
import { PUNE_NASHIK_WAYPOINTS } from '../../sim/fixtures/puneNashik';
import { appendBreadcrumb } from '../breadcrumb';
import { initialDistanceTracker, trackDistance } from '../distanceTracker';
import { emptyFixGate, gateFix } from '../fixGate';

const O: LatLng = { latitude: 18.6, longitude: 73.85 };
const fix = (p: LatLng, t: number, accuracy: number | null = 5): LocationFix => ({
  ...p,
  timestamp: t,
  accuracy,
  speed: null,
  course: null,
});

describe('gateFix', () => {
  it('rejects poor or missing accuracy', () => {
    expect(gateFix(emptyFixGate(), fix(O, 1, 30), { maxAccuracyM: 25 }).rejection).toBe('low-accuracy');
    expect(gateFix(emptyFixGate(), fix(O, 1, null), { maxAccuracyM: 25 }).rejection).toBe('low-accuracy');
  });

  it('rejects out-of-order fixes', () => {
    const s = gateFix(emptyFixGate(), fix(O, 2000), { maxAccuracyM: 25 }).state;
    expect(gateFix(s, fix(O, 1000), { maxAccuracyM: 25 }).rejection).toBe('out-of-order');
  });

  it('rejects a 2 km jump in 1 s, then re-anchors after 3 consistent fixes', () => {
    let s = gateFix(emptyFixGate(), fix(O, 0), { maxAccuracyM: 25 }).state;
    const far = destinationPoint(O, 90, 2000);
    const r1 = gateFix(s, fix(far, 1000), { maxAccuracyM: 25 });
    expect(r1.rejection).toBe('implausible-jump');
    s = r1.state;
    const r2 = gateFix(s, fix(far, 2000), { maxAccuracyM: 25 });
    expect(r2.accepted).toBe(false);
    const r3 = gateFix(r2.state, fix(far, 3000), { maxAccuracyM: 25 });
    expect(r3.accepted).toBe(true);
  });

  it('accepts highway speed', () => {
    const s = gateFix(emptyFixGate(), fix(O, 0), { maxAccuracyM: 25 }).state;
    expect(gateFix(s, fix(destinationPoint(O, 0, 33), 1000), { maxAccuracyM: 25 }).accepted).toBe(true);
  });
});

describe('trackDistance', () => {
  it('ignores a parked phone wandering ±10 m for 10 minutes', () => {
    let s = initialDistanceTracker();
    for (let i = 0; i < 600; i++) s = trackDistance(s, fix(destinationPoint(O, (i * 73) % 360, (i % 3) * 4), i * 1000, 10));
    expect(s.totalMeters).toBe(0);
  });

  it('measures a simulated 20 km of the Pune → Nashik drive within 2%', () => {
    const sim = new DriveSimulator(PUNE_NASHIK_WAYPOINTS, { speedKmh: 70, noiseM: 3, accuracyM: 6 });
    let s = initialDistanceTracker();
    while (sim.progressMeters < 20_000) s = trackDistance(s, sim.next());
    expect(s.totalMeters / sim.progressMeters).toBeGreaterThan(0.98);
    expect(s.totalMeters / sim.progressMeters).toBeLessThan(1.02);
  });

  it('skips fixes worse than 25 m', () => {
    let s = trackDistance(initialDistanceTracker(), fix(O, 0));
    s = trackDistance(s, fix(destinationPoint(O, 0, 100), 10_000, 40));
    expect(s.totalMeters).toBe(0);
  });
});

describe('appendBreadcrumb', () => {
  it('keeps only the last ~500 m and skips points closer than 5 m', () => {
    let trail: LatLng[] = [];
    for (let i = 0; i <= 200; i++) trail = appendBreadcrumb(trail, destinationPoint(O, 45, i * 10));
    expect(pathLength(trail)).toBeCloseTo(500, 0);
    const same = appendBreadcrumb(trail, destinationPoint(O, 45, 2002));
    expect(same).toBe(trail);
  });
});

describe('DriveSimulator', () => {
  it('is deterministic for a seed and finishes the whole route', () => {
    const a = new DriveSimulator(PUNE_NASHIK_WAYPOINTS, { seed: 7, speedKmh: 100, intervalMs: 5000 });
    const b = new DriveSimulator(PUNE_NASHIK_WAYPOINTS, { seed: 7, speedKmh: 100, intervalMs: 5000 });
    expect(a.next()).toEqual(b.next());
    let n = 0;
    while (!a.finished && n < 10_000) {
      a.next();
      n++;
    }
    expect(a.finished).toBe(true);
    expect(a.progressMeters).toBeCloseTo(a.totalMeters, 3);
  });

  it('holds position (with jitter) during a scheduled stop', () => {
    const sim = new DriveSimulator(PUNE_NASHIK_WAYPOINTS, { stops: [{ atDistanceM: 1000, durationMs: 60_000 }] });
    while (sim.progressMeters < 1000) sim.next();
    const p0 = sim.progressMeters;
    const stopped = Array.from({ length: 50 }, () => sim.next());
    expect(sim.progressMeters).toBe(p0);
    expect(stopped.every((f) => (f.speed ?? 0) < 1.5)).toBe(true);
  });
});
