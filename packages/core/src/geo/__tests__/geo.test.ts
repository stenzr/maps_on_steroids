import { destinationPoint, initialBearing } from '../bearing';
import { distanceMeters } from '../distance';
import { angleDelta } from '../../heading/angles';
import { decodePolyline, encodePolyline } from '../polyline';
import { pathLength, pointAlongPath, trimPathFromEnd } from '../path';
import { PUNE_NASHIK_WAYPOINTS } from '../../sim/fixtures/puneNashik';

const pune = { latitude: 18.5308, longitude: 73.8475 };
const nashik = { latitude: 19.999, longitude: 73.79 };

describe('distanceMeters', () => {
  it('is zero for identical points', () => {
    expect(distanceMeters(pune, pune)).toBe(0);
  });
  it('matches one degree of latitude (~111.2 km)', () => {
    expect(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(111_195, -1);
  });
  it('Pune → Nashik straight line is ~163 km', () => {
    expect(distanceMeters(pune, nashik) / 1000).toBeCloseTo(163.4, 0);
  });
});

describe('initialBearing (great-circle)', () => {
  const o = { latitude: 18.5, longitude: 73.8 };
  it.each([
    ['north', { latitude: 18.6, longitude: 73.8 }, 0],
    ['south', { latitude: 18.4, longitude: 73.8 }, 180],
    ['west', { latitude: 18.5, longitude: 73.7 }, 270],
  ])('due %s', (_n, to, expected) => {
    expect(initialBearing(o, to)).toBeCloseTo(expected, 1);
  });

  it('due east is ~90° (great circle starts very slightly north of east)', () => {
    const b = initialBearing(o, { latitude: 18.5, longitude: 73.9 })!;
    expect(b).toBeGreaterThan(89.9);
    expect(b).toBeLessThan(90);
  });

  it('north-east at 45°-ish and always in [0, 360)', () => {
    const b = initialBearing(o, { latitude: 18.6, longitude: 73.9 })!;
    expect(b).toBeGreaterThan(43);
    expect(b).toBeLessThan(47);
  });

  it('just west of north gives ~359°, not a negative angle', () => {
    const b = initialBearing(o, { latitude: 18.6, longitude: 73.7999 })!;
    expect(b).toBeGreaterThan(359);
    expect(b).toBeLessThan(360);
  });

  it('matches a known reference: London → Paris ≈ 148.1°', () => {
    // Value from the Movable Type Scripts calculator for these coordinates.
    const b = initialBearing({ latitude: 51.5074, longitude: -0.1278 }, { latitude: 48.8566, longitude: 2.3522 })!;
    expect(b).toBeCloseTo(148.1, 0);
  });

  it('returns null for identical points', () => {
    expect(initialBearing(o, o)).toBeNull();
  });

  it('round-trips with destinationPoint', () => {
    for (const brg of [0, 37, 90, 181, 270, 359]) {
      const p = destinationPoint(o, brg, 500);
      expect(distanceMeters(o, p)).toBeCloseTo(500, 3);
      expect(Math.abs(angleDelta(brg, initialBearing(o, p)!))).toBeLessThan(1e-6);
    }
  });
});

describe('polyline', () => {
  it('decodes the reference example from the Google docs', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ]);
  });
  it('round-trips the Pune–Nashik waypoints', () => {
    const decoded = decodePolyline(encodePolyline(PUNE_NASHIK_WAYPOINTS));
    decoded.forEach((p, i) => {
      expect(p.latitude).toBeCloseTo(PUNE_NASHIK_WAYPOINTS[i]!.latitude, 5);
      expect(p.longitude).toBeCloseTo(PUNE_NASHIK_WAYPOINTS[i]!.longitude, 5);
    });
  });
  it('throws on a truncated polyline', () => {
    expect(() => decodePolyline('_p~iF~ps|U_')).toThrow('Malformed polyline');
  });
});

describe('path helpers', () => {
  const line = [
    { latitude: 18.5, longitude: 73.8 },
    destinationPoint({ latitude: 18.5, longitude: 73.8 }, 0, 1000),
  ];

  it('test route Pune → Nashik is roughly 185–230 km (approximate road waypoints)', () => {
    const km = pathLength(PUNE_NASHIK_WAYPOINTS) / 1000;
    expect(km).toBeGreaterThan(185);
    expect(km).toBeLessThan(230);
  });

  it('pointAlongPath interpolates and reports the segment bearing', () => {
    const r = pointAlongPath(line, 250);
    expect(distanceMeters(line[0]!, r.point)).toBeCloseTo(250, 0);
    expect(Math.abs(angleDelta(0, r.segmentBearing!))).toBeLessThan(1e-6);
    expect(r.atEnd).toBe(false);
    expect(pointAlongPath(line, 5000).atEnd).toBe(true);
  });

  it('trimPathFromEnd keeps exactly the trailing length', () => {
    const trimmed = trimPathFromEnd(line, 300);
    expect(pathLength(trimmed)).toBeCloseTo(300, 0);
    expect(trimmed[trimmed.length - 1]).toEqual(line[1]);
    expect(trimPathFromEnd(line, 5000)).toEqual(line);
  });
});
