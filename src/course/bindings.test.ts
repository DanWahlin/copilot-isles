import { afterAll, describe, expect, it } from 'vitest';
import { readCoursePack } from '../../tools/course-pack/read';
import { setActiveCourse } from './active';
import { activateCourse } from './load';
import type { CoursePack } from './pack';
import { HELM_ORDERS, MODE_INFO } from '../world/sites/helms-logic';
import { REVIEW_OPTIONS } from '../game/puzzles/three-helms';
import { CREW_LOOK } from '../game/puzzles/channel-routing/boards';
import { CREW_ORDERS, WORKSPACES } from '../game/puzzles/channel-routing/workspaces';
import { ChannelRoutingModel, TWIST_CHOICES } from '../game/puzzles/channel-routing/model';
import { MERIDIAN_YARD } from '../world/sites/crate-yard-logic';
import { DESTINATIONS, LETTERS } from '../game/puzzles/hall-letters';
import { CATEGORY_OF, TIER_OF, grade, jobById } from '../game/market/jobs';
import { FLAGS, halyardOf } from '../game/puzzles/flag-hoist';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Renames a record's keys (and the strings that name them) throughout a value. */
function renamed(v: unknown, ids: Readonly<Record<string, string>>): unknown {
  if (typeof v === 'string') return ids[v] ?? v;
  if (Array.isArray(v)) return v.map((x) => renamed(x, ids));
  if (v && typeof v === 'object')
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [ids[k] ?? k, renamed(x, ids)]));
  return v;
}

/**
 * A course binds its own ids to the game's mechanic ids (`acts`; COURSE-PACKS.md, "Step 5 as built"):
 * the Copilot app pack with every mode, review option, crew, place, twist answer, bin, tray and model
 * category renamed plays the same.
 */
describe('a course with its own mechanic ids', () => {
  afterAll(async () => {
    await activateCourse('copilot-app');
  });

  it('drives the game through its bindings', () => {
    const app = readCoursePack('copilot-app');
    const p = JSON.parse(JSON.stringify(app.puzzles)) as Any;
    p['three-helms'] = renamed(p['three-helms'], {
      interactive: 'hands-on',
      plan: 'chart-first',
      autopilot: 'hands-off',
      approve: 'yes',
      exit: 'no',
      suggest: 'change',
    });
    const crews = { feature: 'red-crew', bugfix: 'gold-crew', docs: 'grey-crew' };
    const places = { worktree: 'own-folder', checkout: 'main-folder', cloud: 'elsewhere' };
    p['channel-routing'] = renamed(p['channel-routing'], { ...crews, port5174: 'move', closeOne: 'shut' });
    p.workspaces = renamed(p.workspaces, { ...crews, ...places });
    p['crate-yard'] = renamed(p['crate-yard'], { chat: 'quick', project: 'deep' });
    const letters = p['lost-letters'];
    letters.items = renamed(letters.items, { tray: 'not-here' });
    letters.tray.id = 'not-here';
    p['flag-hoist'] = renamed(p['flag-hoist'], { '@': 'A', '#': 'B' });
    const cats = { Lightweight: 'Tiny', Versatile: 'Middling', Powerful: 'Mighty' };
    const pack: CoursePack = {
      ...app,
      puzzles: p,
      market: renamed(app.market, cats) as CoursePack['market'],
      models: renamed(app.models, cats) as CoursePack['models'],
    };
    setActiveCourse(pack);

    expect(MODE_INFO.steer.name).toBe('Interactive');
    expect(HELM_ORDERS.review.wrong.auto).toBe('mer.helm.wrong.plan.autopilot');
    expect(REVIEW_OPTIONS.map((o) => o.id)).toEqual(['accept', 'takeOver', 'amend']);
    expect(CREW_LOOK.blue.name).toBe('Feature');
    expect(WORKSPACES.map((w) => w.id)).toEqual(['channel', 'hall', 'gondola']);
    expect(CREW_ORDERS.green.best).toBe('gondola');
    expect(CREW_ORDERS.teal.accept).toEqual(['hall', 'channel']);
    expect(TWIST_CHOICES.find((c) => c.id === 'move')).toMatchObject({ acts: 'reroute', right: true });
    const m = new ChannelRoutingModel(3);
    m.pick('blue', 'channel');
    m.pick('green', 'gondola');
    m.pick('teal', 'hall');
    expect(m.runWorkspaces()!.solved).toBe(true);
    expect(MERIDIAN_YARD.crates.map((c) => c.kind)).toEqual(
      (app.puzzles['crate-yard'] as Any).items.map((c: Any) => (c.kind === 'chat' ? 'tavern' : 'slipway')),
    );
    expect(DESTINATIONS.at(-1)).toBe('tray');
    expect(LETTERS.some((l) => l.answer === 'tray')).toBe(true);
    expect(halyardOf('B')).toBe(1);
    expect(FLAGS[0]!.symbol).toBe('A');
    expect(TIER_OF).toEqual({ Tiny: 'small', Middling: 'medium', Mighty: 'large' });
    const hard = jobById('bug')!;
    expect(
      grade(hard, { auto: false, category: CATEGORY_OF.large, model: 'x', effort: 'default' }).outcome,
    ).toBe('right');
    expect(grade(hard, { auto: false, category: 'Tiny', model: 'x', effort: 'high' }).outcome).toBe('short');
  });
});
