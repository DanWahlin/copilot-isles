import { describe, expect, it } from 'vitest';
import {
  GEAR_IDS,
  gearPhase,
  gearTone,
  initialGear,
  ledgerTerminal,
  looseLeft,
  nearestLoose,
  pickUp,
  rackAction,
  rackTerminal,
  readLedger,
  restoreGear,
  saveGear,
  signIn,
  useRack,
  type GearState,
  type LooseId,
} from './gear-logic';

const pickAll = (s: GearState, ids: readonly LooseId[]) => ids.reduce((a, id) => pickUp(a, id).state, s);

describe('gear rack logic', () => {
  it('starts with four loose pieces and no lens in sight', () => {
    const s = initialGear();
    expect(looseLeft(s)).toEqual(['compass', 'lantern', 'rope', 'spyglass']);
    expect(gearPhase(s)).toBe('gather');
    expect(rackAction(s)).toBeNull();
    expect(useRack(s).event.kind).toBe('nothing');
  });

  it('hangs carried pieces in rack order, one version check per press', () => {
    let s = pickAll(initialGear(), ['rope', 'compass']);
    let step = useRack(s);
    expect(step.event).toEqual({ kind: 'checked', id: 'compass' });
    s = step.state;
    step = useRack(s);
    expect(step.event).toEqual({ kind: 'checked', id: 'rope' });
    expect(rackTerminal(step.state)).toEqual(['$ git --version', 'git version 2.49.0', '$ npm -v', '10.9.2']);
  });

  it('fails the spyglass check until the lens is fetched, then re-checks', () => {
    let s = pickAll(initialGear(), ['compass', 'lantern', 'rope', 'spyglass']);
    for (let k = 0; k < 3; k++) s = useRack(s).state;
    const miss = useRack(s);
    expect(miss.event).toEqual({ kind: 'missing', id: 'spyglass' });
    s = miss.state;
    expect(s.lens).toBe('loose');
    expect(gearPhase(s)).toBe('lens');
    expect(rackTerminal(s).slice(-1)).toEqual(['zsh: command not found: gh']);
    expect(looseLeft(s)).toEqual(['lens']);
    s = pickUp(s, 'lens').state;
    expect(rackAction(s)).toEqual({ kind: 'fit' });
    const fit = useRack(s);
    expect(fit.event.kind).toBe('all-checked');
    expect(rackTerminal(fit.state).slice(-2)).toEqual(['$ gh --version', 'gh version 2.74.0']);
    expect(gearPhase(fit.state)).toBe('ledger');
  });

  it('can’t pick up the lens before the spyglass check turns it up', () => {
    expect(pickUp(initialGear(), 'lens').event.kind).toBe('nothing');
  });

  it('reads the wrong signature, then signs in as you', () => {
    let s = pickAll(initialGear(), ['compass', 'lantern', 'rope', 'spyglass']);
    for (let k = 0; k < 4; k++) s = useRack(s).state;
    s = useRack(pickUp(s, 'lens').state).state;
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
  });

  it('round-trips saves and repairs inconsistent ones', () => {
    let s = pickAll(initialGear(), ['compass', 'spyglass']);
    s = useRack(s).state;
    s = useRack(s).state;
    expect(restoreGear(saveGear(s), false)).toEqual(s);
    expect(restoreGear([0, 0, 0, 0, 3, 1, 1], false).lens).toBe('carried');
    expect(restoreGear([0, 0, 0, 2, 0, 0, 0], false).lens).toBe('loose');
    expect(restoreGear([2, 2, 0, 2, 3, 1, 1], false).signed).toBe(false);
    const solved = restoreGear(undefined, true);
    expect(GEAR_IDS.every((id) => solved.pieces[id] === 'hung')).toBe(true);
    expect(gearPhase(solved)).toBe('done');
  });

  it('inks commands, failures, successes, and your account', () => {
    expect(gearTone('$ node -v')).toBe('cmd');
    expect(gearTone('zsh: command not found: gh')).toBe('other');
    expect(gearTone('v22.16.0')).toBe('ok');
    expect(gearTone('✓ Logged in as your-handle')).toBe('you');
    expect(gearTone('github.com')).toBeUndefined();
  });

  it('points hints at the nearest loose piece', () => {
    const at = (id: LooseId) =>
      ({ compass: { x: 0, z: 0 }, lantern: { x: 10, z: 0 } })[id as 'compass'] ?? { x: 99, z: 99 };
    expect(nearestLoose(initialGear(), { x: 8, z: 0 }, at)).toBe('lantern');
    expect(nearestLoose(pickUp(initialGear(), 'lantern').state, { x: 8, z: 0 }, at)).toBe('compass');
  });
});
