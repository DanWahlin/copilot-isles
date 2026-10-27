import type { IslandCode, IslandContent } from './island-code';
import type { KeelhavenWorld } from '../world/islands/keelhaven/index';
import { createKeelhavenStream } from '../world/islands/keelhaven/stream';
import { KEELHAVEN_WAYS } from '../world/islands/keelhaven/waypoints';
import { storyHolds } from './story';
import {
  keelhavenCurrent,
  keelhavenLog,
  keelhavenOptionalTargets,
  keelhavenTarget,
  keelhavenTracker,
} from './keelhaven-quests';
import { createKeelhavenContent, KEELHAVEN_CHEST_IDS, type KeelhavenContent } from './keelhaven-session';
import { KEELHAVEN_NPCS, keelhavenExtras } from './keelhaven-npcs';
import { BOOTH_LAYOUT } from '../world/market-stall/booth';
import { KEELHAVEN_BOOTH } from '../world/islands/keelhaven/anchors';
import { KEELHAVEN } from '../world/islands/keelhaven/layout';

/** Each session's content, for its walk surfaces (made before the content, read once it's there). */
const own = new WeakMap<IslandContent, KeelhavenContent>();

/**
 * Keelhaven's code (Chapter 03; its registry entry is src/islands/keelhaven.ts): its stream, its quest
 * line, its quay, copings, gates and stairs, and its content (src/game/keelhaven-session.ts).
 */
export const KEELHAVEN_CODE: IslandCode = {
  stream: createKeelhavenStream,
  chests: KEELHAVEN_CHEST_IDS,
  // The cast and every islander (they all can appear).
  cast: (anchors) => [...KEELHAVEN_NPCS, ...keelhavenExtras(anchors)],
  ways: KEELHAVEN_WAYS,
  quests: {
    log: keelhavenLog,
    tracker: keelhavenTracker,
    target: keelhavenTarget,
    current: keelhavenCurrent,
    optionalTargets: keelhavenOptionalTargets,
    hintTask: (q) => keelhavenTracker(q).tasks.find((t) => t.status === 'active' && !t.optional),
    // Once Thousand-Bough's Seal is won, the compass points on to Keelhaven.
    sailHere: (q) => storyHolds('thousand-bough', 'sealed', q),
  },
  // Its quay, copings, gates' walkways, verandas and the stair, live once its world has streamed in
  // and its content is up.
  walk: ({ content }) => {
    const kh = () => {
      const c = content();
      return c ? (own.get(c) ?? null) : null;
    };
    return {
      box: KEELHAVEN.bounds,
      surfaces: [
        {
          heightAt: (x, z, y) => kh()?.surface.heightAt(x, z, y) ?? null,
          kind: (x, z) => {
            const k = kh()?.surface.kind ?? 'stone';
            return typeof k === 'function' ? k(x, z) : k;
          },
        },
      ],
      inland: (x, z, g, out) => kh()?.inland(x, z, g, out) ?? false,
    };
  },
  content: (host) => {
    const kh = createKeelhavenContent(host);
    const content: IslandContent = {
      get npcs() {
        return kh.npcs;
      },
      owns: (id) => kh.ids.has(id),
      script: (id) => kh.script(id),
      setup: (world) => kh.setup(world as KeelhavenWorld),
      // Bram's stall on the Old Town quay.
      market: () => ({ at: KEELHAVEN_BOOTH, layout: BOOTH_LAYOUT }),
      bottles: () => kh.bottles(),
      teardown: () => kh.teardown(),
      updateNpcs: (dt, at, eye) => kh.updateNpcs(dt, at, eye),
      update: (dt, t) => kh.update(dt, t),
      debug: kh.debug,
      dispose: () => kh.dispose(),
    };
    own.set(content, kh);
    return content;
  },
};
