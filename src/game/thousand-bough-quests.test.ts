import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CH02 } from '../learn/content/ch02';
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

const ROOT = join(__dirname, '../..');
const lines = JSON.parse(readFileSync(join(ROOT, 'tools/voice/lines.testcove.json'), 'utf8')) as {
  lines: { id: string; speaker: string; text: string; voice?: string; tts?: string }[];
};
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/voice/testcove/manifest.json'), 'utf8')) as {
  lines: { id: string; speaker: string; text: string; duration: number }[];
};
const lipsync = JSON.parse(readFileSync(join(ROOT, 'public/voice/testcove/lipsync.json'), 'utf8')) as {
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

describe('Thousand-Bough quests (Chapter 02)', () => {
  it('plays the nine stops in the course’s order, each pointing on to the next', () => {
    const q: Record<string, string> = { 'Q2.1': 'start' };
    const order: string[] = [];
    for (const npc of ORDER) {
      const before = thousandBoughCurrent(q)!.id;
      order.push(before);
      talk(npc, q);
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
      const steps = talk(npc, q);
      for (const s of steps) {
        if ('quiz' in s) asked.push(s.quiz);
        if ('trial' in s) asked.push(s.trial);
      }
    }
    expect(asked).toEqual(['K2.1', 'K2.2', 'M2.1', 'H2.1', 'M2.2', 'H2.3', 'H2.6', 'T2']);
  });

  it('sends anyone ahead of the story back, and gives everyone a line once they’re done', () => {
    const q: QuestState = {};
    for (const npc of ORDER.slice(1)) {
      const beat = thousandBoughNpcScript(npc, q)!;
      expect(beat.steps, npc).toHaveLength(1);
      expect('say' in beat.steps[0]! && beat.steps[0].say.endsWith('.wait'), npc).toBe(true);
    }
    const all: Record<string, string> = {};
    for (const npc of ORDER) talk(npc, all);
    // After the Seal, Rook offers the assignment once.
    expect(talk('rook', all).some((st) => 'page' in st && st.page === 'pg2.assignment')).toBe(true);
    expect(all['Q2.A']).toBe('try');
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
      for (const prev of ORDER.slice(0, ORDER.indexOf(npc))) talk(prev, q);
      return [...thousandBoughNpcScript(npc, q)!.steps];
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
      /\.(wait|done|next|chest|01|channels|deadend|round1|rain|retry|pass|flag\.ok|order\.\d|twist\.0\d)$|^juno\.tb\.|^wingman\.tb\.0|^wingman\.starfish|^tb\.elder\.0[12]$|^tb\.saffi\.01$|^tb\.tamsin\.01$|^tb\.fen\.03$/;
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
  });

  it('opens once the Seal of Meridian is won (and always in dev)', () => {
    noteMeridianSeal(true);
    expect(thousandBoughOpen()).toBe(true);
    noteMeridianSeal(false);
  });
});
