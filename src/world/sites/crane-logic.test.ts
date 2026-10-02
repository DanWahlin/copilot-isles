import { describe, expect, it } from 'vitest';
import {
  CRANE_FACINGS,
  CRANE_START,
  YOUR_FACING,
  YOUR_REPOSITORY,
  confirmYes,
  craneHintTarget,
  dryRun,
  initialCrane,
  restoreCrane,
  saveCrane,
  lineTone,
  signLines,
  terminalLines,
  turnCapstan,
  type CraneState,
} from './crane-logic';

const turnTo = (s: CraneState, facing: number): CraneState => {
  while (s.facing !== facing) s = turnCapstan(s).state;
  return s;
};

describe('crane logic (P0.2)', () => {
  it('starts aimed at another captain’s berth with nothing previewed', () => {
    const s = initialCrane();
    expect(CRANE_FACINGS[s.facing]!.owner).toBe('captain');
    expect(s.facing).toBe(CRANE_START);
    expect(signLines(s)).toEqual(['Repository:', '(pull Dry-Run to preview)']);
  });

  it('has one facing per berth plus the quay, clockwise from the west', () => {
    expect(CRANE_FACINGS.map((f) => f.id)).toEqual(['berth2', 'berth3', 'berth1', 'quay']);
    expect(new Set(CRANE_FACINGS.map((f) => f.heading)).size).toBe(4);
    expect(CRANE_FACINGS[YOUR_FACING]!.repository).toBe(YOUR_REPOSITORY);
  });

  it('previews any repository, and the sign shows whose it is', () => {
    const { state, event } = dryRun(initialCrane());
    expect(event).toMatchObject({ kind: 'preview', owner: 'captain' });
    expect(signLines(state, event)[0]).toBe('Repository: m-reyes/copilot-app-for-beginners');
  });

  it('stops --yes until there is a preview for this facing', () => {
    expect(confirmYes(initialCrane()).event.kind).toBe('preview-first');
    let s = dryRun(turnTo(initialCrane(), YOUR_FACING)).state;
    s = turnCapstan(s).state;
    s = turnTo(s, YOUR_FACING);
    expect(s.preview).toBeNull();
    expect(confirmYes(s).event.kind).toBe('preview-first');
  });

  it('refuses --yes on another captain’s or the guild’s repository', () => {
    const other = dryRun(initialCrane()).state;
    const refusedOther = confirmYes(other);
    expect(refusedOther.event).toMatchObject({ kind: 'refused', owner: 'captain' });
    expect(refusedOther.state.complete).toBe(false);

    const guild = dryRun(turnCapstan(initialCrane()).state).state;
    const refusedGuild = confirmYes(guild);
    expect(refusedGuild.event).toMatchObject({ kind: 'refused', owner: 'guild' });
    expect(signLines(refusedGuild.state, refusedGuild.event)[0]).toBe('Refusing to change shared repository');
  });

  it('fails outside a clone (the quay), whichever lever you pull', () => {
    const quay = turnTo(
      initialCrane(),
      CRANE_FACINGS.findIndex((f) => f.id === 'quay'),
    );
    const d = dryRun(quay);
    expect(d.event.kind).toBe('not-a-repo');
    expect(d.state.preview).toBeNull();
    expect(confirmYes(quay).event.kind).toBe('not-a-repo');
    expect(signLines(d.state, d.event)[0]).toBe('Setup failed:');
  });

  it('completes on your own repository after a preview, then stays complete', () => {
    let s = turnTo(initialCrane(), YOUR_FACING);
    s = dryRun(s).state;
    expect(signLines(s)).toEqual([`Repository: ${YOUR_REPOSITORY}`, 'Default branch: main']);
    const done = confirmYes(s);
    expect(done.event.kind).toBe('complete');
    expect(done.state.complete).toBe(true);
    expect(signLines(done.state)[1]).toBe('Setup complete.');
    expect(turnCapstan(done.state).event.kind).toBe('already');
    expect(dryRun(done.state).event.kind).toBe('already');
    expect(confirmYes(done.state).event.kind).toBe('already');
  });

  it('round-trips a save and drops a stale preview', () => {
    const s = dryRun(turnTo(initialCrane(), YOUR_FACING)).state;
    expect(restoreCrane(saveCrane(s), false)).toEqual(s);
    expect(restoreCrane([YOUR_FACING, 0], false).preview).toBeNull();
    expect(restoreCrane([99, -1], false).facing).toBe(99 % CRANE_FACINGS.length);
    expect(restoreCrane(undefined, false)).toEqual(initialCrane());
    expect(restoreCrane(undefined, true)).toMatchObject({ facing: YOUR_FACING, complete: true });
  });

  it('counts the quarter turns to your berth for hints', () => {
    expect(craneHintTarget(initialCrane()).turnsNeeded).toBe(2);
    expect(craneHintTarget(turnTo(initialCrane(), YOUR_FACING)).turnsNeeded).toBe(0);
  });

  it('writes the terminal readout like the script prints it', () => {
    const start = initialCrane();
    expect(terminalLines(start).at(-1)).toBe('(pull Dry-Run to preview)');
    const other = dryRun(start);
    expect(terminalLines(other.state)).toEqual([
      '$ node …/setup-training-scenarios.js --dry-run',
      `Repository: ${CRANE_FACINGS[CRANE_START]!.repository}`,
      'Default branch: main',
      '[dry-run] would create 9 labels, 5 issues,',
      '[dry-run] 7 branches and 3 pull requests',
      'Dry run complete. No changes were made.',
    ]);
    const refused = confirmYes(other.state);
    expect(terminalLines(refused.state, refused.event).slice(2)).toEqual([
      'Refusing to change shared or',
      'upstream repository.',
    ]);
    const quay = CRANE_FACINGS.findIndex((f) => f.owner === null);
    const nothing = dryRun(turnTo(start, quay));
    expect(terminalLines(nothing.state, nothing.event)[1]).toBe('Run this script from the root');
    const done = confirmYes(dryRun(turnTo(start, YOUR_FACING)).state).state;
    expect(terminalLines(done)).toContain('Setup complete.');
    expect(terminalLines(done)[1]).toBe(`Repository: ${YOUR_REPOSITORY}`);
  });

  it('inks your fork, other owners, commands, and success differently', () => {
    expect(lineTone('$ node …/setup-training-scenarios.js')).toBe('cmd');
    expect(lineTone(`Repository: ${YOUR_REPOSITORY}`)).toBe('you');
    expect(lineTone('your-handle/')).toBe('you');
    expect(lineTone('Repository: m-reyes/copilot-app-for-beginners')).toBe('other');
    expect(lineTone('m-reyes/')).toBe('other');
    expect(lineTone('Refusing to change shared or')).toBe('other');
    expect(lineTone('Setup complete.')).toBe('ok');
    expect(lineTone('Default branch: main')).toBeUndefined();
    expect(lineTone('Repository:')).toBeUndefined();
  });
});
