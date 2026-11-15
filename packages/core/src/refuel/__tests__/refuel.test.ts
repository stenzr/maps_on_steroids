import type { LocationFix } from '../../types';
import { destinationPoint } from '../../geo/bearing';
import { DriveSimulator } from '../../sim/driveSimulator';
import { PUNE_NASHIK_WAYPOINTS } from '../../sim/fixtures/puneNashik';
import { dwellKey, initialDwellState, matchStation, updateDwell, type DwellEvent } from '../dwellDetector';
import { dueReminders } from '../reminders';

const O = { latitude: 18.76, longitude: 73.86 };
const fix = (p: { latitude: number; longitude: number }, t: number, accuracy = 8): LocationFix => ({
  ...p,
  timestamp: t,
  accuracy,
  speed: null,
  course: null,
});

function run(fixes: LocationFix[]): DwellEvent[] {
  let s = initialDwellState();
  const events: DwellEvent[] = [];
  for (const f of fixes) {
    const r = updateDwell(s, f);
    s = r.state;
    if (r.event) events.push(r.event);
  }
  return events;
}

describe('updateDwell', () => {
  it('confirms a 4-minute stop within 60 m and fires dwell-ended on driving away', () => {
    const stay = Array.from({ length: 240 }, (_, i) => fix(destinationPoint(O, (i * 47) % 360, (i % 4) * 8), i * 1000));
    const away = Array.from({ length: 30 }, (_, i) => fix(destinationPoint(O, 0, 40 + i * 15), 241_000 + i * 1000));
    const events = run([...stay, ...away]);
    expect(events.map((e) => e.kind)).toEqual(['dwell-confirmed', 'dwell-ended']);
    const ended = events[1] as Extract<DwellEvent, { kind: 'dwell-ended' }>;
    expect(ended.endedAt - ended.startedAt).toBeGreaterThanOrEqual(180_000);
  });

  it('does nothing for a 2-minute stop (traffic signal)', () => {
    const stay = Array.from({ length: 120 }, (_, i) => fix(O, i * 1000));
    const away = Array.from({ length: 20 }, (_, i) => fix(destinationPoint(O, 0, 100 + i * 20), 121_000 + i * 1000));
    expect(run([...stay, ...away])).toEqual([]);
  });

  it('ignores poor-accuracy fixes and doesn\'t end on brief drift', () => {
    const stay = Array.from({ length: 200 }, (_, i) => fix(O, i * 1000));
    const drift = [fix(destinationPoint(O, 90, 90), 201_000), fix(destinationPoint(O, 90, 400), 202_000, 80)];
    const back = Array.from({ length: 10 }, (_, i) => fix(O, 203_000 + i * 1000));
    expect(run([...stay, ...drift, ...back]).map((e) => e.kind)).toEqual(['dwell-confirmed']);
  });

  it('detects the 4-minute stop in the simulated Pune → Nashik drive', () => {
    const sim = new DriveSimulator(PUNE_NASHIK_WAYPOINTS, { stops: [{ atDistanceM: 25_000, durationMs: 240_000 }], speedKmh: 70 });
    const fixes: LocationFix[] = [];
    while (sim.progressMeters < 27_000) fixes.push(sim.next());
    expect(run(fixes).map((e) => e.kind)).toEqual(['dwell-confirmed', 'dwell-ended']);
  });
});

describe('matchStation', () => {
  it('picks the closest station within radius + slack', () => {
    const near = { id: 'near', location: destinationPoint(O, 0, 30) };
    const edge = { id: 'edge', location: destinationPoint(O, 0, 95) };
    const far = { id: 'far', location: destinationPoint(O, 0, 300) };
    expect(matchStation(O, [far, edge, near])!.id).toBe('near');
    expect(matchStation(O, [far, edge])!.id).toBe('edge');
    expect(matchStation(O, [far])).toBeNull();
  });

  it('dedupes prompts by place + start minute', () => {
    expect(dwellKey('P', 61_000)).toBe(dwellKey('P', 119_000));
    expect(dwellKey('P', 61_000)).not.toBe(dwellKey('P', 121_000));
  });
});

describe('dueReminders', () => {
  const DAY = 86_400_000;
  it('nudges after N days without a log, once per day', () => {
    const base = { now: 20 * DAY, lastLogAt: 9 * DAY, noLogDays: 10, rawFuelQuantity: 10, lastSent: {} };
    expect(dueReminders(base)).toEqual(['no-recent-log']);
    expect(dueReminders({ ...base, lastLogAt: 11 * DAY })).toEqual([]);
    expect(dueReminders({ ...base, lastSent: { 'no-recent-log': 19.5 * DAY } })).toEqual([]);
  });

  it('flags an impossible (negative) fuel estimate', () => {
    expect(dueReminders({ now: 0, lastLogAt: 0, noLogDays: 10, rawFuelQuantity: -3, lastSent: {} })).toEqual(['impossible-fuel']);
    expect(dueReminders({ now: 0, lastLogAt: 0, noLogDays: 10, rawFuelQuantity: -0.2, lastSent: {} })).toEqual([]);
  });
});
