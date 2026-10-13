import { float, positionWorld, saturate, smoothstep, vec2 } from 'three/tsl';

// TSL's fluent typings don't cover every mixed scalar/vector graph used by the terrain shader.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/** What an island's terrain masks can read: the ground's world position and height, and its bake. */
export interface TerrainRegionContext {
  /** The ground's world position (vec3 node). */
  readonly P: AnyNode;
  /** Its height (`P.y`). */
  readonly y: AnyNode;
  /** The baked grass mask (0-1). */
  readonly grassMask: AnyNode;
  /** The ground normal's up component (1 flat, 0 sheer). */
  readonly up: AnyNode;
  /** A broad 0-1 noise (features tens of metres across) that doesn't stretch on steep faces. */
  readonly noise: AnyNode;
  /** Drawn small on the opening's chart (masks may reach farther there). */
  readonly miniature: boolean;
}

/**
 * The places an island paints its ground differently, each a 0-1 TSL mask in world space. The shared
 * terrain material owns the looks; an island only says where they go. Leave out what it doesn't have.
 */
export interface TerrainRegionMasks {
  /** Lived-in village ground: lawns with fine turf, worn earth where the sand is trodden. */
  villageGround?: AnyNode;
  /** Footpaths drawn in the shader over the baked sand (worn earth, not beach). */
  paths?: AnyNode;
  /** One big smooth grassy hill: no height bands or strata, scrub on top, cliff colour only when sheer. */
  grassHill?: AnyNode;
  /** Other grassy slopes that keep cliff colouring off all but the near-sheer faces. */
  grassySlopes?: AnyNode;
  /** A sea cave's dark mouth in the cliff. */
  cave?: AnyNode;
  /** A pale patch of bare sand inland (a camp). */
  campSand?: AnyNode;
  /** Summer-dry golden grass instead of lush green. */
  dryGrass?: AnyNode;
  /** A town's ground: bare ground there is trodden earth, not pale sand. */
  town?: AnyNode;
  /** Sunlit bluffs with their own warm cliff colouring, scrub and light. */
  bluff?: AnyNode;
  /** A pale limestone ridge with soft bedding and dark-green maquis on its ledges. */
  limestoneRidge?: AnyNode;
  /** Wet, mossy basalt: dark columned faces with moss on every ledge (Thousand-Bough's cliffs). */
  basalt?: AnyNode;
}

export type TerrainRegionKey = keyof TerrainRegionMasks;

/** An island's terrain regions, built once per material from the context. */
export type TerrainRegions = (ctx: TerrainRegionContext) => TerrainRegionMasks;

const REGION_KEYS: readonly TerrainRegionKey[] = [
  'villageGround',
  'paths',
  'grassHill',
  'grassySlopes',
  'cave',
  'campSand',
  'dryGrass',
  'town',
  'bluff',
  'limestoneRidge',
  'basalt',
];

/**
 * Every island's masks merged into one set: each region is the max of the islands that have it (the
 * islands lie apart, so they don't overlap), a lone island's own node as is, or 0 where none has it.
 */
export function combineTerrainRegions(
  regions: readonly TerrainRegions[],
  ctx: TerrainRegionContext,
): Required<TerrainRegionMasks> {
  const built = regions.map((region) => region(ctx));
  const out = {} as Record<TerrainRegionKey, AnyNode>;
  for (const key of REGION_KEYS) {
    const nodes = built.map((masks) => masks[key]).filter((node) => node !== undefined);
    out[key] = nodes.length === 0 ? float(0) : nodes.reduce((a, b) => a.max(b));
  }
  return out;
}

/** 1 within `inner` metres of the segment a → b (in XZ), easing to 0 by `outer`. */
export function segmentMaskNode(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  inner: number,
  outer: number,
  world: AnyNode = positionWorld,
): AnyNode {
  const p = vec2(world.x, world.z);
  const a = vec2(ax, az);
  const ba = vec2(bx - ax, bz - az);
  const pa = p.sub(a);
  const t = saturate(pa.dot(ba).div((bx - ax) * (bx - ax) + (bz - az) * (bz - az)));
  return float(1).sub(smoothstep(inner, outer, pa.sub(ba.mul(t)).length()));
}
