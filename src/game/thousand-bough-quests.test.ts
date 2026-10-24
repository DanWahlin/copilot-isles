import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolvedLines } from '../../tools/voice/lines';
import { CHAPTERS } from '../learn/content/index';
import { CHESTS, PAGES, QUIZZES, TRIALS, GLOSSARY } from '../learn/content/index';
import { THOUSAND_BOUGH } from '../world/islands/thousand-bough/layout';
import type { QuestState } from './cove-quests';
import { MERIDIAN_ISLAND } from './meridian-quests';
import { parseProgress } from '../learn/progress';
import { noteMeridianSeal, thousandBoughOpen } from './thousand-bough-open';
import type { ScriptStep } from './script';
import { THOUSAND_BOUGH_NPCS, thousandBoughExtras } from './thousand-bough-npcs';
import {
  FEN_SOLVED,
  THOUSAND_BOUGH_LINES,
  THOUSAND_BOUGH_QUESTS,
  THOUSAND_BOUGH_TARGETS,
  thousandBoughCurrent,
  thousandBoughNpcScript,
  thousandBoughTarget,
  thousandBoughTracker,
} from './thousand-bough-quests';

const CH02 = CHAPTERS.find((c) => c.chapter === '02-sessions-worktrees-context')!;

const ROOT = join(__dirname, '../..');
/** Every line with its speaker's cast (courses/copilot-app/voice/cast.json). */
const lines = { lines: resolvedLines('copilot-app') };
const manifest = JSON.parse(
  readFileSync(join(ROOT, 'courses/copilot-app/public/voice/manifest.json'), 'utf8'),
) as {
  lines: { id: string; speaker: string; text: string; duration: number }[];
};
const lipsync = JSON.parse(
  readFileSync(join(ROOT, 'courses/copilot-app/public/voice/lipsync.json'), 'utf8'),
) as {
  lines: Record<string, unknown>;
};
const byId = new Map(lines.lines.map((l) => [l.id, l]));
const ORDER = ['tamsin', 'lyra_bough', 'saffi', 'oak', 'fen', 'ines', 'rook', 'pip', 'elder'];

/** Plays an NPC's beat as the session would: quest steps set, cues and quizzes pass. */
function play(steps: readonly ScriptStep[], q: Record<string, string>): void {
  for (const s of steps) if ('quest' in s) q[s.quest] = s.step;
}
function talk(npc: string, q: Record<string, string>): readonly ScriptStep[] {
  const beat = thousandBoughNpcScript(npc, q);
  if (!beat) throw new Error(`no beat for ${npc}`);
  play(beat.steps, q);
  // The puzzle sets Channel Routing's own steps; the closing beat runs once it's solved.
  if (q['Q2.5'] === 'channels') {
    q['Q2.5'] = 'solved';
    play(FEN_SOLVED, q);
  }
  return beat.steps;
}
/** A stop as you'd play it: talk, and talk again after each exercise you're sent to do in the app. */
function visit(npc: string, q: Record<string, string>): readonly ScriptStep[] {
  const steps: ScriptStep[] = [];
  let last: readonly ScriptStep[];
  do {
    last = talk(npc, q);
    steps.push(...last);
  } while (last.some((s) => 'quest' in s && s.step === APP));
  return steps;
}
/** The step an exercise waits on while you do it in the app (the course pack's quest step). */
const APP = 'app';

describe('Thousand-Bough quests (Chapter 02)', () => {
  it('plays the nine stops in the course’s order, each pointing on to the next', () => {
    const q: Record<string, string> = { 'Q2.1': 'start' };
    const order: string[] = [];
    for (const npc of ORDER) {
      const before = thousandBoughCurrent(q)!.id;
      order.push(before);
      visit(npc, q);
      expect(q[before], `${npc} finishes ${before}`).toBe('done');
    }
    expect(order).toEqual(['Q2.1', 'Q2.2', 'Q2.3', 'Q2.4', 'Q2.5', 'Q2.6', 'Q2.7', 'Q2.8', 'Q2.9']);
    expect(thousandBoughCurrent(q)).toBeNull();
    // The optional assignment opens after the Seal.
    expect(q['Q2.A']).toBe('start');
    expect(thousandBoughTracker(q).tasks.at(-1)).toMatchObject({
      id: 'Q2.A',
      status: 'active',
      optional: true,
    });
  });

  it('asks each stop’s one check, in order, and ends with the Trial', () => {
    const q: Record<string, string> = {};
    const asked: string[] = [];
    for (const npc of ORDER) {
      const steps = visit(npc, q);
      for (const s of steps) {
        if ('quiz' in s) asked.push(s.quiz);
        if ('trial' in s) asked.push(s.trial);
      }
    }
    expect(asked).toEqual([
      'K2.1',
      'K2.2',
      'M2.1',
      'K2.4',
      'K2.6',
      'H2.1',
      'K2.3',
      'K2.9',
      'H2.3',
      'K2.5',
      'H2.6',
      'K2.7',
      'T2',
    ]);
  });

  it('sends you to do each exercise in the app, and asks what you saw when you come back', () => {
    const q: Record<string, string> = {};
    for (const npc of ORDER.slice(0, 6)) visit(npc, q);
    for (const [npc, quest, saw, task, when] of [
      ['rook', 'Q2.7', 'K2.5', 'A2.2', 'branch:given'],
      ['pip', 'Q2.8', 'K2.7', 'A2.3', 'app:A2.3'],
    ] as const) {
      const brief = talk(npc, q);
      expect(q[quest], `${npc}'s brief ends at the app step`).toBe(APP);
      // The brief hands the exercise off quietly (it joins the App checklist); the card comes back with you.
      expect(brief).toContainEqual({ appTask: task, quiet: true });
      // The brief's cards hold what you'll need at the keyboard; nothing asks what you saw yet.
      expect(brief.filter((s) => 'page' in s).length, npc).toBeGreaterThanOrEqual(3);
      expect(brief.some((s) => 'askSetup' in s || ('quiz' in s && s.quiz === saw))).toBe(false);
      // The tracker and the compass send you back to them, with the course one click away.
      expect(thousandBoughCurrent(q)).toMatchObject({ id: quest, step: APP });
      expect(thousandBoughTarget(q)).toMatchObject({ ids: [`npc:${npc}`] });
      expect(THOUSAND_BOUGH_QUESTS.find((d) => d.id === quest)!.link?.url).toMatch(/#exercise-/);
      // The next stop waits.
      const next = ORDER[ORDER.indexOf(npc) + 1]!;
      expect(thousandBoughNpcScript(next, q)!.steps).toEqual([{ say: `tb.${next}.wait` }]);
      const back = talk(npc, q);
      // One prompt: the "Do this in the app" card (I did it, or Later for not yet), then what you saw,
      // only for players who did it.
      expect(back[1]).toEqual({ appTask: task });
      expect(back).toContainEqual({ quiz: saw, when });
      expect(q[quest]).toBe('done');
    }
    // Rook's return asks for the session's working branch (Skip: not done it yet), then the issue.
    const rookBack = thousandBoughNpcScript('rook', { ...q, 'Q2.7': APP })!.steps;
    expect(rookBack.filter((s) => 'askSetup' in s)).toEqual([
      { askSetup: 'branch', when: 'app:A2.2' },
      { askSetup: 'issue', when: 'branch:given' },
    ]);
  });

  it('gives the assignment at the Crown, and finishes it there with your report', () => {
    const q: Record<string, string> = {};
    for (const npc of ORDER) visit(npc, q);
    expect(q['Q2.A']).toBe('start');
    expect(thousandBoughTarget(q)).toBeNull();
    expect(THOUSAND_BOUGH_TARGETS['Q2.A:start']).toMatchObject({ ids: ['npc:elder'] });
    expect(THOUSAND_BOUGH_TARGETS['Q2.A:try']).toMatchObject({ ids: ['npc:elder'] });
    // Rook has nothing more to give: no walk back down the tree.
    expect(thousandBoughNpcScript('rook', q)!.steps).toEqual([{ say: 'tb.rook.done' }]);
    const brief = talk('elder', q);
    expect(brief).toContainEqual({ page: 'pg2.assignment', doubloons: 15 });
    expect(q['Q2.A']).toBe('try');
    const report = talk('elder', q);
    // The card first: Later ends the talk with Q2.A still open (one way to finish it: here).
    expect(report[1]).toEqual({ appTask: 'A2.4', orStop: true });
    expect(report).toContainEqual({ quiz: 'K2.8' });
    expect(q['Q2.A']).toBe('done');
    expect(thousandBoughTracker(q).tasks.at(-1)).toMatchObject({ id: 'Q2.A', status: 'done' });
    expect(thousandBoughNpcScript('elder', q)!.steps).toEqual([{ say: 'tb.elder.done' }]);
  });

  it('sends anyone ahead of the story back, and gives everyone a line once they’re done', () => {
    const q: QuestState = {};
    for (const npc of ORDER.slice(1)) {
      const beat = thousandBoughNpcScript(npc, q)!;
      expect(beat.steps, npc).toHaveLength(1);
      expect('say' in beat.steps[0]! && beat.steps[0].say.endsWith('.wait'), npc).toBe(true);
    }
    const all: Record<string, string> = {};
    for (const npc of ORDER) visit(npc, all);
    // After the Seal, the Elder offers the assignment once, and takes your report.
    expect(talk('elder', all).some((st) => 'page' in st && st.page === 'pg2.assignment')).toBe(true);
    expect(all['Q2.A']).toBe('try');
    talk('elder', all);
    expect(all['Q2.A']).toBe('done');
    for (const npc of ORDER) {
      const beat = thousandBoughNpcScript(npc, all)!;
      expect(beat.steps.length, npc).toBeLessThanOrEqual(2);
    }
  });

  it('has a compass target for every step, aimed at a real interaction', () => {
    const known = new Set([
      ...THOUSAND_BOUGH_NPCS.map((n) => `npc:${n.id}`),
      'flume:board',
      'basket:bottom',
      'basket:top',
    ]);
    for (const d of THOUSAND_BOUGH_QUESTS) {
      if (d.optional) continue;
      for (const step of Object.keys(d.steps)) {
        if (step === 'done') continue;
        const t = THOUSAND_BOUGH_TARGETS[`${d.id}:${step}`];
        expect(t, `${d.id}:${step}`).toBeDefined();
        for (const id of t!.ids) expect(known.has(id), id).toBe(true);
      }
    }
    expect(thousandBoughTarget({})).toMatchObject({ ids: ['npc:tamsin'] });
  });

  it('puts every NPC at an island anchor', () => {
    const anchors = THOUSAND_BOUGH.anchors as Record<string, unknown>;
    for (const n of THOUSAND_BOUGH_NPCS) expect(anchors[n.anchor], n.id).toBeDefined();
    for (const n of thousandBoughExtras(THOUSAND_BOUGH.anchors, true))
      expect(anchors[n.anchor], n.id).toBeDefined();
  });

  it('only uses content that exists', () => {
    const steps = ORDER.flatMap((npc) => {
      const q: Record<string, string> = {};
      for (const prev of ORDER.slice(0, ORDER.indexOf(npc))) visit(prev, q);
      return [...visit(npc, q), ...visit('elder', q)];
    });
    for (const s of [...steps, ...FEN_SOLVED]) {
      if ('quiz' in s) expect(QUIZZES.has(s.quiz), s.quiz).toBe(true);
      if ('trial' in s) expect(TRIALS.has(s.trial), s.trial).toBe(true);
      if ('page' in s) expect(PAGES.has(s.page), s.page).toBe(true);
      if ('file' in s) expect(PAGES.has(s.file), s.file).toBe(true);
      if ('term' in s) expect(GLOSSARY.has(s.term), s.term).toBe(true);
      if ('show' in s)
        expect(
          CH02.images.some((i) => i.id === s.show),
          s.show,
        ).toBe(true);
    }
    for (const c of ['C2.1', 'C2.2', 'B2.1', 'B2.2', 'B2.3']) expect(CHESTS.has(c), c).toBe(true);
  });

  it('voices every line it plays, with a lipsync entry, in short friendly lines', () => {
    const voiced = new Map(manifest.lines.map((l) => [l.id, l]));
    for (const id of THOUSAND_BOUGH_LINES) {
      const line = byId.get(id);
      expect(line, id).toBeDefined();
      expect(voiced.get(id)?.text, `${id} is generated from its current text`).toBe(line!.text);
      expect(voiced.get(id)!.duration, id).toBeGreaterThan(0.5);
      // Wingman's a parrot: no mouth cues.
      if (line!.speaker !== 'Wingman') expect(lipsync.lines[id], `${id} lipsync`).toBeDefined();
      // Snappy (the cast mustn't lecture): 24 words and two sentences at most.
      expect(line!.text.split(/\s+/).length, id).toBeLessThanOrEqual(24);
      expect(line!.text.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length, id).toBeLessThanOrEqual(3);
    }
  });

  it('cites a course section for every voiced teaching line', () => {
    const teaching = Object.keys(CH02.voiced ?? {});
    for (const id of teaching) expect(THOUSAND_BOUGH_LINES, id).toContain(id);
    // Every scripted line of the stops' teaching beats is cited, except greetings, directions and banter.
    const untaught =
      /\.(wait|done|next|chest|01|channels|deadend|round1|retry|pass|flag\.ok|order\.\d|twist\.0\d|go|back)$|^juno\.tb\.|^wingman\.tb\.0|^wingman\.starfish|^tb\.elder\.0[12]$|^tb\.saffi\.01$|^tb\.tamsin\.01$|^tb\.fen\.03$/;
    for (const id of THOUSAND_BOUGH_LINES)
      if (!untaught.test(id)) expect(teaching, `${id} cites its section`).toContain(id);
  });

  it('gives each new islander their own voice', () => {
    const voices = new Map<string, string>();
    for (const l of lines.lines) if (l.voice && !voices.has(l.speaker)) voices.set(l.speaker, l.voice);
    const cast = ['Tamsin', 'Saffi', 'Oak', 'Fen', 'Ines', 'Rook', 'Pip', 'Maren'];
    const used = cast.map((c) => voices.get(c));
    expect(new Set(used).size).toBe(cast.length);
    for (const [speaker, v] of voices) if (!cast.includes(speaker)) expect(used, speaker).not.toContain(v);
  });

  it('points Port Meridian on to Thousand-Bough', () => {
    expect(MERIDIAN_ISLAND.next).toMatch(/Thousand-Bough/);
  });

  it('loads saves from before the island, and keeps the island’s own steps', () => {
    // A Chapter 01 save (no Thousand-Bough keys) starts the island at Tamsin.
    const old = parseProgress(
      JSON.stringify({
        v: 1,
        quests: { 'Q0.11': 'done', 'Q1.8': 'done' },
        pages: ['pg1.why'],
        seals: ['Seal of Meridian'],
      }),
    );
    expect(thousandBoughCurrent(old.quests)).toMatchObject({ id: 'Q2.1', step: 'start' });
    expect(thousandBoughTracker(old.quests).tasks.filter((t) => t.status === 'done')).toHaveLength(0);
    // A save mid-puzzle keeps its step and the round checkpoint.
    const mid = parseProgress(
      JSON.stringify({ v: 1, quests: { 'Q2.4': 'done', 'Q2.5': 'channels', 'P2.1': 'r3' }, pages: [] }),
    );
    expect(mid.quests['P2.1']).toBe('r3');
    expect(thousandBoughNpcScript('fen', mid.quests)!.steps).toEqual([{ say: 'tb.fen.channels' }]);
    // Saves from before the exercises were done in the app keep every step they had: Rook's and
    // Pip's are the same steps (a save at `start` hears the brief), and the assignment Rook gave
    // (`start` or `try`) is the Elder's now, at the Crown.
    const sealed = { 'Q2.6': 'done', 'Q2.7': 'done', 'Q2.8': 'done', 'Q2.9': 'done' };
    expect(thousandBoughNpcScript('rook', { 'Q2.6': 'done', 'Q2.7': 'start' })!.steps).toContainEqual({
      quest: 'Q2.7',
      step: APP,
    });
    expect(thousandBoughNpcScript('elder', { ...sealed, 'Q2.A': 'start' })!.steps).toContainEqual({
      page: 'pg2.assignment',
      doubloons: 15,
    });
    expect(thousandBoughNpcScript('elder', { ...sealed, 'Q2.A': 'try' })!.steps).toContainEqual({
      quiz: 'K2.8',
    });
    expect(thousandBoughNpcScript('rook', { ...sealed, 'Q2.A': 'try' })!.steps).toEqual([
      { say: 'tb.rook.done' },
    ]);
  });

  it('opens once the Seal of Meridian is won (and always in dev)', () => {
    noteMeridianSeal(true);
    expect(thousandBoughOpen()).toBe(true);
    noteMeridianSeal(false);
  });
});
