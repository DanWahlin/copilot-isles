import { describe, expect, it } from 'vitest';
import {
  gearPhase,
  gearTone,
  initialGear,
  ledgerTerminal,
  looseLeft,
  pickUp,
  rackAction,
  rackTerminal,
  readLedger,
  restoreGear,
  saveGear,
  signIn,
  useRack,
  type GearState,
} from './gear-logic';

/** Runs the checks, fetches the lens, and fits it: every tool checks out. */
const checkedOut = (): GearState => useRack(pickUp(useRack(initialGear()).state, 'lens').state).state;

describe('gear rack logic', () => {
  it('starts with the gear on the rack, nothing lying around, and the checks not yet run', () => {
    const s = initialGear();
    expect(looseLeft(s)).toEqual([]);
    expect(gearPhase(s)).toBe('check');
    expect(rackAction(s)).toEqual({ kind: 'run' });
    expect(rackTerminal(s)).toEqual(['(run the version checks at the rack)']);
  });

  it('runs all four version checks at once, and the missing GitHub CLI sends you for a lens', () => {
    const miss = useRack(initialGear());
    expect(miss.event).toEqual({ kind: 'missing', id: 'spyglass' });
    expect(rackTerminal(miss.state)).toEqual([
      '$ git --version',
      'git version 2.49.0',
      '$ node -v',
      'v22.16.0',
      '$ npm -v',
      '10.9.2',
      '$ gh --version',
      'zsh: command not found: gh',
    ]);
    expect(gearPhase(miss.state)).toBe('lens');
    expect(looseLeft(miss.state)).toEqual(['lens']);
    expect(rackAction(miss.state)).toBeNull();
  });

  it('fits the lens and checks GitHub CLI again', () => {
    const s = pickUp(useRack(initialGear()).state, 'lens').state;
    expect(rackAction(s)).toEqual({ kind: 'fit' });
    const fit = useRack(s);
    expect(fit.event.kind).toBe('all-checked');
    expect(rackTerminal(fit.state).slice(-4)).toEqual([
      '$ gh --version',
      'zsh: command not found: gh',
      '$ gh --version',
      'gh version 2.74.0',
    ]);
    expect(gearPhase(fit.state)).toBe('ledger');
    expect(useRack(fit.state).event.kind).toBe('nothing');
  });

  it('can’t pick up the lens before the spyglass check turns it up', () => {
    expect(pickUp(initialGear(), 'lens').event.kind).toBe('nothing');
    expect(pickUp(useRack(initialGear()).state, 'compass').event.kind).toBe('nothing');
  });

  it('reads the wrong signature, then signs in as you', () => {
    const s = checkedOut();
    expect(signIn(s).event.kind).toBe('nothing');
    const read = readLedger(s);
    expect(read.event.kind).toBe('ledger-wrong');
    expect(ledgerTerminal(read.state)).toContain('  ✓ Logged in to github.com account someone-else');
    const signed = signIn(read.state);
    expect(signed.event.kind).toBe('signed');
    expect(gearPhase(signed.state)).toBe('done');
    expect(ledgerTerminal(signed.state).slice(-1)).toEqual(['✓ Logged in to github.com account your-handle']);
  });

  it('won’t read the ledger before the gear checks out', () => {
    expect(readLedger(initialGear()).event.kind).toBe('nothing');
    expect(readLedger(useRack(initialGear()).state).event.kind).toBe('nothing');
  });

  it('round-trips saves and repairs inconsistent ones', () => {
    const mid = useRack(initialGear()).state;
    expect(restoreGear(saveGear(mid), false)).toEqual(mid);
    expect(restoreGear(saveGear(checkedOut()), false)).toEqual(checkedOut());
    // A found lens means the checks ran; a run check means the lens is out there.
    expect(restoreGear([0, 2, 0, 0], false)).toMatchObject({ ran: true, lens: 'carried' });
    expect(restoreGear([1, 0, 0, 0], false).lens).toBe('loose');
    // No signature without reading the ledger, and no ledger before the gear checks out.
    expect(restoreGear([1, 1, 1, 1], false)).toMatchObject({ ledgerRead: false, signed: false });
    expect(gearPhase(restoreGear(undefined, true))).toBe('done');
  });

  it('restores saves from the old gear hunt', () => {
    expect(restoreGear([0, 1, 2, 0, 0, 0, 0], false)).toEqual(initialGear());
    expect(restoreGear([2, 2, 2, 2, 1, 0, 0], false)).toMatchObject({ ran: true, lens: 'loose' });
    expect(restoreGear([2, 2, 2, 2, 3, 1, 1], false)).toEqual({
      ran: true,
      lens: 'fitted',
      ledgerRead: true,
      signed: true,
    });
  });

  it('inks commands, failures, successes, and your account', () => {
    expect(gearTone('$ node -v')).toBe('cmd');
    expect(gearTone('zsh: command not found: gh')).toBe('other');
    expect(gearTone('v22.16.0')).toBe('ok');
    expect(gearTone('✓ Logged in as your-handle')).toBe('you');
    expect(gearTone('github.com')).toBeUndefined();
  });
});
