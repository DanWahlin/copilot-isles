import { BOOTH_LAYOUT } from '../world/market-stall/booth';
import type { ThousandBoughSystem } from '../world/islands/thousand-bough/contract';
import type { IslandContent, IslandCode } from './island-code';
import { THOUSAND_BOUGH } from '../world/islands/thousand-bough/layout';
import { createThousandBoughStream } from '../world/islands/thousand-bough/stream';
import { THOUSAND_BOUGH_WAYS } from '../world/islands/thousand-bough/waypoints';
import { THOUSAND_BOUGH_NPCS, thousandBoughExtras } from './thousand-bough-npcs';
import { storyHolds } from './story';
import { islandOpen } from '../islands/open';
import { ISLAND_LIST } from '../islands/registry';
import {
  THOUSAND_BOUGH_ISLAND,
  thousandBoughCurrent,
  thousandBoughLog,
  thousandBoughOptionalTargets,
  thousandBoughTarget,
  thousandBoughTracker,
} from './thousand-bough-quests';
import { createThousandBoughContent, type ThousandBoughContent } from './thousand-bough-session';

/** The island that opens once Thousand-Bough's Seal is won (none until it's in the registry). */
const NEXT_ISLAND = ISLAND_LIST.find((e) => e.open?.after?.island === 'thousand-bough') ?? null;

/** Each session's content, for its walk surfaces (made before the content, read once it's there). */
const own = new WeakMap<IslandContent, ThousandBoughContent>();

/**
 * Thousand-Bough Isle's code (Chapter 02; its registry entry is src/islands/thousand-bough.ts): its
 * stream, its quest line, its decks and pools, and its content (src/game/thousand-bough-session.ts).
 */
export const THOUSAND_BOUGH_CODE: IslandCode = {
  stream: createThousandBoughStream,
  chests: [...THOUSAND_BOUGH.chests, ...THOUSAND_BOUGH.bottles].map((c) => c.id),
  // The extras after the Spire's twist too (they all can appear).
  cast: (anchors) => [...THOUSAND_BOUGH_NPCS, ...thousandBoughExtras(anchors, true)],
  ways: THOUSAND_BOUGH_WAYS,
  quests: {
    log: thousandBoughLog,
    // The task list points on to the next island once it's open.
    tracker: (q) => {
      const t = thousandBoughTracker(q);
      const sail = THOUSAND_BOUGH_ISLAND.nextSail;
      return sail && NEXT_ISLAND && islandOpen(NEXT_ISLAND.id) ? { ...t, next: sail } : t;
    },
    target: thousandBoughTarget,
    current: thousandBoughCurrent,
    optionalTargets: thousandBoughOptionalTargets,
    hintTask: (q) => thousandBoughTracker(q).tasks.find((t) => t.status === 'active' && !t.optional),
    // Once Meridian's Seal is won, the compass points on to Thousand-Bough.
    sailHere: (q) => storyHolds('meridian', 'sealed', q),
  },
  // Its decks, the stair and its pools, live once its world has streamed in and its content is up.
  walk: ({ content }) => {
    const tb = () => {
      const c = content();
      return c ? (own.get(c) ?? null) : null;
    };
    return {
      box: THOUSAND_BOUGH.bounds,
      surfaces: [
        {
          heightAt: (x, z, y) => tb()?.surface.heightAt(x, z, y) ?? null,
          kind: (x, z) => {
            const k = tb()?.surface.kind ?? 'wood';
            return typeof k === 'function' ? k(x, z) : k;
          },
        },
      ],
      inland: (x, z, g, out) => tb()?.inland(x, z, g, out) ?? false,
    };
  },
  content: (host) => {
    const tb = createThousandBoughContent(host);
    const content: IslandContent = {
      get npcs() {
        return tb.npcs;
      },
      owns: (id) => tb.ids.has(id),
      script: (id) => tb.script(id),
      setup: (world) => tb.setup(world as ThousandBoughSystem),
      // Lani's stall on Bough Landing.
      market: (world) => {
        const at = (world as ThousandBoughSystem).anchors.modelMarket;
        return at ? { at, layout: BOOTH_LAYOUT } : null;
      },
      teardown: () => tb.teardown(),
      updateNpcs: (dt, at, eye) => tb.updateNpcs(dt, at, eye),
      update: (dt, t) => tb.update(dt, t),
      bottles: () => tb.bottles(),
      debug: tb.debug,
      dispose: () => tb.dispose(),
    };
    own.set(content, tb);
    return content;
  },
};
