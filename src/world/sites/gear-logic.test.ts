import { describe, expect, it } from 'vitest';
import {
  GEAR_IDS,
  GEAR_START,
  gearContent,
  gearDef,
  gearReadout,
  gearTone,
  runGearCheck,
  signInLines,
  YOUR_HANDLE,
} from './gear-logic';

describe('gear check', () => {
  it('hangs one piece per course version check, in the course’s order', () => {
    expect(GEAR_IDS.map((id) => gearDef(id).command)).toEqual([
      'git --version',
      'node -v',
      'npm -v',
      'gh --version',
    ]);
  });

  it('prints a version for every check, then your own GitHub CLI sign-in', () => {
    const lines = gearReadout();
    expect(lines.filter((l) => l.startsWith('$'))).toEqual([
      '$ git --version',
      '$ node -v',
      '$ npm -v',
      '$ gh --version',
      '$ gh auth status',
    ]);
    expect(lines.join('\n')).not.toMatch(/not found|missing/i);
    expect(lines.at(-1)).toContain(YOUR_HANDLE);
    expect(lines.map((l) => gearTone(l))).toEqual([
      'cmd',
      'ok',
      'cmd',
      'ok',
      'cmd',
      'ok',
      'cmd',
      'ok',
      'cmd',
      'you',
    ]);
  });

  it('names the account that owns your fork, once you’ve given it', () => {
    const lines = gearReadout('dan-sample', 'octo.ghe.com');
    expect(lines.at(-1)).toBe('✓ Logged in to octo.ghe.com account dan-sample');
    expect(gearTone(lines.at(-1)!, 'dan-sample')).toBe('you');
    expect(gearTone(lines.at(-1)!)).toBeUndefined();
  });
});

describe('running the checks yourself', () => {
  const checks = gearContent().checks;

  it('runs one check per press, in the rack’s order, and catches the out-of-date Node.js once', () => {
    let run = GEAR_START;
    const printed: string[] = [];
    const stales: string[] = [];
    let done = false;
    for (let press = 0; press < 10 && !done; press++) {
      const r = runGearCheck(run, checks);
      run = r.run;
      done = r.done;
      printed.push(run.lines.at(-1)!);
      if (r.stale) stales.push(r.check!.id);
    }
    expect(done).toBe(true);
    // Four checks, and the lantern twice: its old version first, then the LTS after you install it.
    expect(stales).toEqual(['lantern']);
    const lantern = gearDef('lantern');
    expect(printed).toEqual([
      gearDef('compass').output,
      lantern.stale!.output,
      lantern.output,
      gearDef('rope').output,
      gearDef('spyglass').output,
    ]);
    expect(run.lines.filter((l) => l === '$ node -v')).toHaveLength(2);
    expect(gearTone(lantern.stale!.output)).toBe('other');
    expect(gearTone(lantern.output)).toBe('ok');
    // Done is done: another press runs nothing.
    expect(runGearCheck(run, checks)).toMatchObject({ check: null, done: true, run });
  });

  it('shows Node’s rule: the stale major is lower than the LTS one it prints next', () => {
    const lantern = gearDef('lantern');
    const major = (v: string) => Number(/^v(\d+)\./.exec(v)![1]);
    expect(major(lantern.stale!.output)).toBeLessThan(major(lantern.output));
    expect(gearContent().scripts?.[lantern.stale!.script]?.some((s) => 'quiz' in s)).toBe(true);
  });

  it('notes the npm fix for Windows only, and ends with GitHub CLI’s own sign-in', () => {
    expect(Object.keys(gearDef('rope').notes ?? {})).toEqual(['windows']);
    expect(gearDef('rope').notes?.windows).toMatch(/npm\.cmd/);
    expect(signInLines('dan-sample')).toEqual([
      '$ gh auth status',
      '✓ Logged in to github.com account dan-sample',
    ]);
    const closing = gearContent().scripts?.checked ?? [];
    expect(closing).toContainEqual({ quiz: 'S0.1' });
    expect(closing.at(-1)).toMatchObject({ step: 'actions' });
  });
});
