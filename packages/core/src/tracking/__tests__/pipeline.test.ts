import { normalizeFix } from '../normalizeFix';
import { initialTrackingState, reduceTracking, type TrackingState } from '../pipeline';
import { DriveSimulator } from '../../sim/driveSimulator';
import { PUNE_NASHIK_WAYPOINTS } from '../../sim/fixtures/puneNashik';
import { pathLength } from '../../geo/path';

describe('normalizeFix', () => {
  it('maps negative sentinels to null and keeps valid values', () => {
    const f = normalizeFix({
      timestamp: 5,
      coords: { latitude: 18.5, longitude: 73.8, accuracy: 4, speed: -1, heading: -1 },
    });
    expect(f).toEqual({ timestamp: 5, latitude: 18.5, longitude: 73.8, accuracy: 4, speed: null, course: null });
    const g = normalizeFix({
      timestamp: 5,
      coords: { latitude: 18.5, longitude: 73.8, accuracy: null, speed: 12, heading: 360 },
    });
    expect(g.course).toBe(0);
    expect(g.speed).toBe(12);
    expect(g.accuracy).toBeNull();
  });
});

describe('reduceTracking', () => {
  it('builds heading, a ≤500 m trail and odometer from a simulated drive with a stop', () => {
    const sim = new DriveSimulator(PUNE_NASHIK_WAYPOINTS, {
      speedKmh: 60,
      stops: [{ atDistanceM: 3000, durationMs: 180_000 }],
    });
    let s: TrackingState = initialTrackingState();
    let sawStationary = false;
    for (let i = 0; i < 600; i++) {
      s = reduceTracking(s, sim.next());
      if (s.heading.stationary) {
        sawStationary = true;
        expect(s.stationarySince).not.toBeNull();
      }
    }
    expect(sawStationary).toBe(true);
    expect(s.heading.heading).not.toBeNull();
    expect(pathLength(s.trail)).toBeLessThanOrEqual(500.5);
    expect(pathLength(s.trail)).toBeGreaterThan(400);
    expect(s.distance.totalMeters / sim.progressMeters).toBeGreaterThan(0.97);
    expect(s.distance.totalMeters / sim.progressMeters).toBeLessThan(1.03);
  });
});
