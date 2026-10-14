import { readFileSync } from 'node:fs';
import { Mesh, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { BODY_CONFIG } from './index';
import {
  AUDIT_MODES,
  BodySurface,
  auditMode,
  buildAuditNpc,
  npcModes,
  parseCharacterGlb,
  type RigSource,
} from './prop-audit';
import type { NpcId, SourceKey } from './types';

/**
 * The held-prop audit on the real Pirate Kit rigs: every prop in a hand sits in its fist, and props
 * in a hand, on the belt or on the back stay out of the body (and a held one out of the clothes) in
 * the clips and talk the NPC really plays. Captain Rhea's spyglass once stuck out through her arm
 * while her spyglass hand went to her hip.
 */

const FILES: Record<SourceKey, string> = {
  captain: 'captain.glb',
  anne: 'anne.glb',
  henry: 'henry.glb',
  captain_npc: 'captain-npc.glb',
  anne_npc: 'anne-npc.glb',
  henry_npc: 'henry-npc.glb',
};
const loaded = new Map<SourceKey, Promise<RigSource>>();
function source(key: SourceKey): Promise<RigSource> {
  let rig = loaded.get(key);
  if (!rig) {
    const url = new URL(`../../../public/packs/testcove/characters/${FILES[key]}`, import.meta.url);
    rig = parseCharacterGlb(new Uint8Array(readFileSync(url)), key);
    loaded.set(key, rig);
  }
  return rig;
}

/** The part of each held prop that the fist closes on. */
const GRIPS = new Set([
  'ledger',
  'market basket handle',
  'vendor tray handle',
  'fishing rod',
  'pinwheel stick',
  'toy hoop',
  'merchant scales',
  'rolled map in hand',
  'shipwright mallet handle',
  'handheld spyglass',
  'astrolabe hand grip',
]);

/** Deeper than this (m) into the body or a held prop's way through the clothes is a fault. */
const TOLERANCE = 0.01;

const NPCS = Object.keys(BODY_CONFIG).filter((b) => b !== 'man' && b !== 'woman') as NpcId[];
const mode = (name: string) => AUDIT_MODES.find((m) => m.name === name)!;

describe('held-prop audit', () => {
  it('measures depth inside the skinned body, and nothing outside it', async () => {
    const npc = buildAuditNpc(await source('anne_npc'), 'rhea');
    npc.update(1 / 60);
    npc.group.updateMatrixWorld(true);
    let body: Mesh | null = null;
    npc.group.traverse((o) => {
      if (o instanceof Mesh && o.name !== 'npc accessories' && 'skeleton' in o) body ??= o;
    });
    const surface = new BodySurface(body!);
    surface.update();
    const elbow = npc.group.getObjectByName('LowerArmL')!.getWorldPosition(new Vector3());
    expect(surface.depth(elbow, null).depth).toBeGreaterThan(0.02);
    const chest = npc.group.getObjectByName('Torso')!.getWorldPosition(new Vector3());
    expect(surface.depth(chest.add(new Vector3(0, 0, -0.45)), null).depth).toBe(0);
    npc.dispose();
  });

  it('closes every NPC’s fist on what it carries', { timeout: 120_000 }, async () => {
    let checked = 0;
    for (const body of NPCS) {
      const rig = await source(BODY_CONFIG[body].source);
      const findings = auditMode(rig, body, mode('idle'), { seconds: 1, step: 0.5, sample: 0.05 });
      for (const f of findings) {
        if (!GRIPS.has(f.prop)) continue;
        expect(f.gap, `${body}: ${f.prop} is ${(f.gap * 100).toFixed(1)} cm from the palm`).toBeLessThan(
          0.045,
        );
        checked++;
      }
    }
    // Eighteen NPCs carry something in a hand.
    expect(checked).toBe(18);
  });

  it(
    'keeps Rhea’s spyglass in her fist and out of her arm and coat while she talks',
    { timeout: 120_000 },
    async () => {
      const rig = await source('anne_npc');
      for (const name of ['talk', 'listen', 'idle', 'wave']) {
        for (const f of auditMode(rig, 'rhea', mode(name), { seconds: 10, step: 0.1, sample: 0.025 })) {
          expect(f.depth, `${name}: ${f.prop} ${(f.depth * 100).toFixed(1)} cm into ${f.bone}`).toBeLessThan(
            TOLERANCE,
          );
          if (GRIPS.has(f.prop)) expect(f.gap).toBeLessThan(0.045);
        }
      }
    },
  );

  it(
    'keeps carried and worn props out of the body in the clips each NPC plays',
    { timeout: 300_000 },
    async () => {
      // One NPC per prop shape: a ledger, a basket while seated, a hanging astrolabe by a robe, scales,
      // a hoop while running, a lute while seated, a net while seated, a rod while seated, a satchel
      // with a chart, a belt mallet.
      const sample: readonly NpcId[] = [
        'nell',
        'merchant',
        'mer_matron',
        'oren',
        'tobias',
        'mer_kid_b',
        'lyra',
        'mer_fisher',
        'fisherman',
        'anders',
        'fen',
        'child',
      ];
      const faults: string[] = [];
      for (const body of sample) {
        const rig = await source(BODY_CONFIG[body].source);
        for (const m of npcModes(body)) {
          const seconds = Math.min(m.seconds, 8);
          for (const f of auditMode(rig, body, m, { seconds, step: 0.125, sample: 0.03 }))
            if (f.depth >= TOLERANCE)
              faults.push(`${body} ${m.name}: ${f.prop} ${(f.depth * 100).toFixed(1)} cm into ${f.bone}`);
        }
      }
      expect(faults).toEqual([]);
    },
  );
});
