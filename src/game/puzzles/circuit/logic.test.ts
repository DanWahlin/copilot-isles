import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CIRCUIT_PLACES } from './places';
import { activeLap, gateDark, LapRun, petitionReady, type CircuitFile } from './logic';

const load = (name: string) =>
  JSON.parse(readFileSync(`courses/copilot-app/puzzles/${name}.json`, 'utf8')) as CircuitFile;
const RING = load('drydock-ring');
const FLIGHT = load('lock-flight');

/** Plays a lap through with the right picks, every claim that sticks, and the seals. */
function playRight(run: LapRun): void {
  for (let guard = 0; !run.done && guard < 50; guard++) {
    const s = run.station!;
    if (s.options) run.choose(s.options.find((o) => o.right)!.id);
    else run.pass();
  }
}

describe('circuit logic', () => {
  for (const file of [RING, FLIGHT])
    it(`${file.id}: every station has a right pick, and every wrong one a way back with its reason`, () => {
      const acts = new Set(Object.values(file.places).map((p) => p.acts));
      expect([...acts].sort()).toEqual([...CIRCUIT_PLACES[file.circuit]].sort());
      for (const lap of file.laps)
        for (const s of lap.stations) {
          expect(file.places[s.at]).toBeDefined();
          if (!s.options) continue;
          const right = s.options.filter((o) => o.right);
          // The slate takes either fix: pry off the stray plank, or ask the crew to revise it.
          expect(right.length).toBe(lap.id === 'fix' && s.id === 'inspect' ? 2 : 1);
          for (const o of s.options.filter((x) => !x.right)) {
            expect(o.reason).toBeTruthy();
            expect(file.places[o.backTo!]).toBeDefined();
          }
        }
    });

  it('runs a lap through with the right picks', () => {
    for (const file of [RING, FLIGHT])
      for (const lap of file.laps) {
        const run = new LapRun(lap);
        playRight(run);
        expect(run.done).toBe(true);
        for (const lamp of run.lamps.values()) expect(lamp).toBe('ready');
      }
  });

  it('sends the hull back to the station that fixes it', () => {
    const run = new LapRun(RING.laps[0]!);
    run.choose('filtered');
    run.pass(); // the crew fits the planks (watch)
    expect(run.station!.id).toBe('inspect');
    const r = run.choose('approve');
    expect(r.right).toBe(false);
    expect(run.station!.id).toBe('change');
    expect(run.lamps.get('slate')).toBe('notReady');
    expect(run.lamps.get('stack')).toBe('dark');
    expect(run.lamps.get('post')).toBe('ready');
    run.pass();
    run.choose('revise');
    expect(run.lamps.get('slate')).toBe('ready');
    expect(run.station!.id).toBe('test');
  });

  it('keeps the hull at a station whose way back is the repair barge', () => {
    const part2 = FLIGHT.laps[1]!;
    const run = new LapRun(part2);
    expect(run.station!.id).toBe('note');
    run.choose('half');
    expect(run.station!.id).toBe('note');
    expect(run.lamps.get('note')).toBe('notReady');
    run.choose('whole');
    expect(run.station!.id).toBe('push1');
  });

  it('resumes a saved lap at its station, with the lamps before it ready', () => {
    const run = new LapRun(RING.laps[0]!, 3);
    expect(run.station!.id).toBe('test');
    expect(run.lamps.get('post')).toBe('ready');
    expect(run.lamps.get('slate')).toBe('ready');
    expect(run.lamps.get('caisson')).toBe('dark');
  });

  it('seals Gate 2 only when the three lamps before the seal are lit', () => {
    const gate = FLIGHT.laps[1]!.stations.find((s) => s.kind === 'gate')!;
    expect(gate.lamps!.length).toBe(4);
    expect(gateDark(gate, 0)?.id).toBe('diff');
    expect(gateDark(gate, 2)?.id).toBe('checks');
    expect(gateDark(gate, 3)).toBeNull();
  });

  it('hoists the petition only with every claim that sticks', () => {
    const p = FLIGHT.laps[0]!.stations.find((s) => s.kind === 'tiles')!;
    const stuck = new Set<string>();
    for (const t of p.tiles!.filter((x) => x.sticks)) {
      expect(petitionReady(p, stuck)).toBe(false);
      stuck.add(t.id);
    }
    expect(petitionReady(p, stuck)).toBe(true);
  });

  it('runs the lap whose quest is at its step', () => {
    expect(activeLap(RING.laps, { 'Q3.4': 'ring' })?.id).toBe('fix');
    expect(activeLap(RING.laps, { 'Q3.4': 'done', 'Q3.5': 'ring' })?.id).toBe('gauge');
    expect(activeLap(RING.laps, { 'Q3.4': 'solved' })).toBeNull();
  });

  it("doesn't allocate a result per pick", () => {
    const run = new LapRun(RING.laps[0]!);
    const a = run.choose('hide');
    const b = run.choose('test');
    expect(a).toBe(b);
  });
});
