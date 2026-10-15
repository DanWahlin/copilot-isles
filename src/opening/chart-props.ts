import {
  AdditiveBlending,
  BufferAttribute,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Sphere,
  SphereGeometry,
  BufferGeometry,
} from 'three/webgpu';
import {
  attribute,
  clamp,
  color,
  float,
  positionGeometry,
  pow,
  smoothstep,
  uniform,
  uv,
  vec3,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Tier } from '../world/contracts';
import { MERIDIAN, meridianWater } from '../world/islands/meridian';
import { meridianPlants } from '../world/islands/meridian-plants';
import { meridianTownPlants } from '../world/meridian-town/plantings';
import { COVE } from '../world/layout';
import {
  HARBOUR_FRONT_ROW,
  TERRACE_ROWS,
  terraceHasBackRow,
  terraceRun,
} from '../world/meridian-town/terraces';
import { buildHeadlandCliffGeometry, HEADLAND_CLIFF_DETAIL } from '../world/terrain/headland-cliff';
import { headlandCliffPlantSpots } from '../world/terrain/headland-cliff-shape';
import { buildSeaStackGeometry, createSeaStackMaterial } from '../world/terrain/sea-stack';
import { seaStackPlantSpots } from '../world/terrain/sea-stack-shape';
import { LIGHTHOUSE } from '../world/islands/anchorage/lighthouse-stair';
import { BUILDINGS, type BuildingSpec } from '../world/islands/anchorage/buildings';
import { VILLAGE_PALMS, villagePlantInstances } from '../world/islands/anchorage/plantings';
import { ANCHORAGE_VEGETATION } from '../world/islands/anchorage/vegetation-rules';
import { scatterVegetationAsync } from '../world/vegetation/scatter';
import type { PlantSpecies } from '../world/vegetation/types';
import { ARCHIPELAGO } from '../ui/chart/archipelago';
import {
  CHART_D,
  CHART_ISLANDS,
  CHART_LIFT,
  CHART_W,
  sheetUV,
  worldToPaper,
  type ChartIslandId,
} from './chart-map';
import { gridHeightField, popUpY, type IslandGrid } from './island-grid';

/**
 * Each real island's buildings, trees and rocks on its chart miniature
 * (docs/specs/OPENING-living-chart.md): built where they really stand, at their true footprints, and
 * raised with the chart's height lift so they keep their proportions against the hills. Houses take
 * the village's and the town's own specs and colours, the trees come from the game's own vegetation
 * scatter, and the headland cliff and sea stack are the game's own rock meshes. They stand up after
 * the island, each from its own base, overshooting a touch like a card unfolding.
 */
export interface IslandProps {
  group: Group;
  /** 0 → 1: the props unfold (after the island has risen). */
  rise: { value: number };
  /** The lighthouse lamp's glow and beam (Anchorage only), 0 → 1. */
  lamp: { value: number };
  /** The fog puffs over the islands still to come, 0 → 1. */
  fog: { value: number };
  update(dt: number, t: number): void;
  dispose(): void;
}

export interface IslandPropsOptions {
  grids: readonly IslandGrid[];
  /** Called between pieces of the build; resolves when there's frame time for more (sliced building). */
  breathe?: () => Promise<void>;
  hasFog: boolean;
  tier: Tier;
  /** Each island's rise (0 → 1+): its rocks stand up with it. */
  islandRise: ReadonlyMap<ChartIslandId, { value: number }>;
}

// three's fluent TSL typings don't cover a uniform passed in as plain `{ value }`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

const SRGB = new Color();
/** A colour from an sRGB hex, jittered in brightness by `k` (1 = as is). */
function rgb(hex: number, k = 1): [number, number, number] {
  SRGB.setHex(hex);
  return [SRGB.r * k, SRGB.g * k, SRGB.b * k];
}

const DECK = 0x8f6d48;
const STONE_FOOT = 0x8b8270;
const TRUNK = 0x7d6a52;
const FROND_DARK = 0x3f6a26;
const FROND_LIGHT = 0x6b9638;
const LEAF_DARK = 0x2f5a25;
const LEAF_LIGHT = 0x4f8133;
const LIMESTONE = 0xe4c991;
const LIGHTHOUSE_RED = 0xb3362b;
const LIGHTHOUSE_WHITE = 0xf1ede2;

/**
 * Collects props built in world metres round an anchor on the island, maps every vertex onto the
 * paper (with the chart's height lift), and merges them into one mesh.
 */
class PropParts {
  readonly list: BufferGeometry[] = [];
  /**
   * Widens what's added by this much round its foot. Plants take the chart's height lift across too,
   * so a palm keeps a palm's shape; buildings keep their true footprints (they'd crowd each other).
   */
  wide = 1;
  private readonly p = { x: 0, y: 0, z: 0 };

  constructor(private readonly grid: IslandGrid) {}

  /**
   * Adds `g` (metres, its foot at the origin) standing at world (x, y, z), turned `rotY` and sheared
   * by `lean` (metres of lean per metre up), coloured `c`.
   */
  add(
    g: BufferGeometry,
    c: readonly [number, number, number],
    x: number,
    y: number,
    z: number,
    delay: number,
    rotY = 0,
    leanX = 0,
    leanZ = 0,
  ): void {
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    for (const name of Object.keys(geo.attributes)) if (name !== 'position') geo.deleteAttribute(name);
    const pos = geo.getAttribute('position') as BufferAttribute;
    const n = pos.count;
    const colors = new Float32Array(n * 3);
    const bases = new Float32Array(n * 3);
    const delays = new Float32Array(n);
    const src = this.grid.src;
    worldToPaper(src, x, y, z, this.p);
    const bx = this.p.x;
    const by = this.p.y;
    const bz = this.p.z;
    const cr = Math.cos(rotY);
    const sr = Math.sin(rotY);
    for (let i = 0; i < n; i++) {
      const lx = pos.getX(i) * this.wide;
      const ly = pos.getY(i);
      const lz = pos.getZ(i) * this.wide;
      const wx = x + lx * cr + lz * sr + leanX * ly;
      const wz = z - lx * sr + lz * cr + leanZ * ly;
      worldToPaper(src, wx, y + ly, wz, this.p);
      pos.setXYZ(i, this.p.x, this.p.y, this.p.z);
      colors.set(c, i * 3);
      bases.set([bx, by, bz], i * 3);
      delays[i] = delay;
    }
    geo.computeVertexNormals();
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    geo.setAttribute('base', new BufferAttribute(bases, 3));
    geo.setAttribute('delay', new BufferAttribute(delays, 1));
    this.list.push(geo);
  }

  merge(): BufferGeometry | null {
    if (!this.list.length) return null;
    const g = mergeGeometries(this.list, false);
    for (const p of this.list) p.dispose();
    this.list.length = 0;
    return g;
  }
}

function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build detail for the trees (set per build). */
const detail = { light: false };

/** A drooping blade (a palm frond, a banana leaf): a strip out along +x from the origin. */
function blade(length: number, width: number, droop: number, segs = 4): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const w = width * Math.sin(Math.PI * Math.min(0.92, 0.12 + u)) * 0.5;
    const x = length * u;
    const y = length * 0.32 * Math.sin(u * Math.PI * 0.6) - droop * u * u;
    pos.push(x, y, -w, x, y + w * 0.35, 0, x, y, w);
    if (i > 0) {
      const a = (i - 1) * 3;
      const b = i * 3;
      idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  return g;
}

/** A palm: a slender curved trunk and a crown of drooping fronds (metres, foot at the origin). */
function palm(
  parts: PropParts,
  x: number,
  y: number,
  z: number,
  h: number,
  delay: number,
  r: () => number,
): void {
  const rot = r() * Math.PI * 2;
  const bend = (r() - 0.35) * 0.18;
  const trunk = new CylinderGeometry(0.2, 0.34, h, 5, detail.light ? 1 : 3);
  trunk.translate(0, h / 2, 0);
  // Curve it: the top leans further than the foot.
  const tp = trunk.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < tp.count; i++) {
    const u = tp.getY(i) / h;
    tp.setX(i, tp.getX(i) + bend * h * u * u);
  }
  parts.add(trunk, rgb(TRUNK, 0.9 + r() * 0.2), x, y, z, delay, rot);
  const fronds = detail.light ? 6 : 9;
  for (let i = 0; i < fronds; i++) {
    const f = blade(h * 0.42, h * 0.11, h * 0.2 + r() * h * 0.08, detail.light ? 2 : 4);
    f.rotateZ(0.25 - r() * 0.25);
    f.rotateY((i / fronds) * Math.PI * 2 + r() * 0.4);
    f.translate(bend * h, h * 0.98, 0);
    parts.add(f, rgb(i % 2 ? FROND_DARK : FROND_LIGHT, 0.85 + r() * 0.3), x, y, z, delay + 0.06, rot);
  }
}

/** A broadleaf tree: a short trunk under a few rounded masses of leaves. */
function broadleaf(
  parts: PropParts,
  x: number,
  y: number,
  z: number,
  s: number,
  delay: number,
  r: () => number,
): void {
  const h = 4.2 * s;
  const trunk = new CylinderGeometry(0.28 * s, 0.42 * s, h, 5);
  trunk.translate(0, h / 2, 0);
  parts.add(trunk, rgb(0x5a4632), x, y, z, delay);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + r();
    const rr = (2.4 + r() * 1.1) * s;
    const ball = new IcosahedronGeometry(rr, detail.light ? 0 : 1);
    ball.scale(1, 0.78, 1);
    ball.translate(Math.cos(a) * 1.3 * s, h + rr * 0.55 + (i === 0 ? 1.2 * s : 0), Math.sin(a) * 1.3 * s);
    parts.add(ball, rgb(i % 2 ? LEAF_DARK : LEAF_LIGHT, 0.85 + r() * 0.3), x, y, z, delay + 0.05);
  }
}

/** A banana plant: a few broad leaves. */
function banana(
  parts: PropParts,
  x: number,
  y: number,
  z: number,
  s: number,
  delay: number,
  r: () => number,
): void {
  for (let i = 0; i < 5; i++) {
    const f = blade(2.4 * s, 0.9 * s, 0.9 * s, 3);
    f.rotateZ(0.5);
    f.rotateY((i / 5) * Math.PI * 2 + r());
    f.translate(0, 1.4 * s, 0);
    parts.add(f, rgb(0x6aa23a, 0.85 + r() * 0.3), x, y, z, delay);
  }
}

/** Any plant the island's scatter made, by species (the small ones are below a pixel on the chart). */
function plant(
  parts: PropParts,
  species: PlantSpecies | string,
  x: number,
  y: number,
  z: number,
  scale: number,
  delay: number,
  r: () => number,
): void {
  parts.wide = CHART_LIFT;
  plantShape(parts, species, x, y, z, scale, delay, r);
  parts.wide = 1;
}

function plantShape(
  parts: PropParts,
  species: PlantSpecies | string,
  x: number,
  y: number,
  z: number,
  scale: number,
  delay: number,
  r: () => number,
): void {
  switch (species) {
    case 'palmTall':
      return palm(parts, x, y, z, 10 * scale, delay, r);
    case 'palmCluster':
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + r();
        const d = 1.4 * CHART_LIFT;
        palm(parts, x + Math.cos(a) * d, y, z + Math.sin(a) * d, (6.5 + r() * 2.5) * scale, delay, r);
      }
      return;
    case 'palmYoung':
      return palm(parts, x, y, z, 3.6 * scale, delay, r);
    case 'broadleafTree':
      return broadleaf(parts, x, y, z, scale, delay, r);
    case 'banana':
      return banana(parts, x, y, z, scale, delay, r);
    case 'shrub':
    case 'brush':
    case 'flowerBush': {
      // A rounded clump of brush (red-leaved shrubs, grey-green maquis, or blossom).
      const rr = (species === 'flowerBush' ? 0.8 : species === 'brush' ? 0.95 : 1.1) * scale;
      const g = new IcosahedronGeometry(rr, 0);
      g.scale(1.25, 0.8, 1.25);
      g.translate(0, rr * 0.6, 0);
      const hue = species === 'flowerBush' ? 0xb04a86 : species === 'shrub' ? 0x8a2a2e : 0x5a6e3a;
      parts.add(g, rgb(hue, 0.85 + r() * 0.3), x, y, z, delay);
      return;
    }
    case 'cypress': {
      // A dark green flame.
      const g = new ConeGeometry(0.7 * scale, 8 * scale, 6);
      g.translate(0, 4.4 * scale, 0);
      parts.add(g, rgb(0x2a4a2c, 0.85 + r() * 0.3), x, y, z, delay);
      return;
    }
    case 'cactus':
      // A prickly pear: a few upright pads.
      for (let i = 0; i < 3; i++) {
        const pad = new IcosahedronGeometry(0.55 * scale, 0);
        pad.scale(0.8, 1.1, 0.3);
        pad.rotateY(i * 1.9 + r());
        pad.translate((i - 1) * 0.4 * scale, (0.6 + (i === 1 ? 0.7 : 0)) * scale, 0);
        parts.add(pad, rgb(0x6f9a52, 0.85 + r() * 0.3), x, y, z, delay);
      }
      return;
    default:
      return;
  }
}

/** A gable, hip or thatched roof over a w × d footprint, its eaves at `eave`. */
function roof(kind: string, w: number, d: number, eave: number): BufferGeometry {
  const o = 0.5;
  if (kind === 'gable') {
    // A prism: the ridge runs along the width.
    const h = d * 0.42;
    const hw = w / 2 + o;
    const hd = d / 2 + o;
    const pos = [
      -hw,
      0,
      -hd,
      hw,
      0,
      -hd,
      hw,
      h,
      0,
      -hw,
      0,
      -hd,
      hw,
      h,
      0,
      -hw,
      h,
      0,
      -hw,
      0,
      hd,
      -hw,
      h,
      0,
      hw,
      h,
      0,
      -hw,
      0,
      hd,
      hw,
      h,
      0,
      hw,
      0,
      hd,
      -hw,
      0,
      -hd,
      -hw,
      h,
      0,
      -hw,
      0,
      hd,
      hw,
      0,
      -hd,
      hw,
      0,
      hd,
      hw,
      h,
      0,
    ];
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.translate(0, eave, 0);
    return g;
  }
  const g = new CylinderGeometry(0.0001, 1, 1, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale((w + 2 * o) / Math.SQRT2, kind === 'thatch' ? d * 0.6 : d * 0.38, (d + 2 * o) / Math.SQRT2);
  g.translate(0, eave + (kind === 'thatch' ? d * 0.3 : d * 0.19), 0);
  return g;
}

/** A house: walls on a stone foot that reaches down the slope, under its roof. */
function house(
  parts: PropParts,
  x: number,
  y: number,
  z: number,
  rot: number,
  w: number,
  d: number,
  wallH: number,
  wall: number,
  roofColour: number,
  roofKind: string,
  delay: number,
): void {
  const foot = new BoxGeometry(w, 2, d);
  foot.translate(0, -1, 0);
  parts.add(foot, rgb(STONE_FOOT), x, y, z, delay, rot);
  const body = new BoxGeometry(w, wallH, d);
  body.translate(0, wallH / 2, 0);
  parts.add(body, rgb(wall), x, y, z, delay, rot);
  if (roofKind === 'flat') {
    const lid = new BoxGeometry(w + 0.3, 0.4, d + 0.3);
    lid.translate(0, wallH + 0.2, 0);
    parts.add(lid, rgb(roofColour), x, y, z, delay + 0.04, rot);
  } else parts.add(roof(roofKind, w, d, wallH), rgb(roofColour), x, y, z, delay + 0.04, rot);
}

/** The point lighthouse as it stands: a stone plinth, a tapered banded tower, gallery, watch room, lantern and dome. */
function pointLighthouse(parts: PropParts, x: number, y: number, z: number, delay: number): number {
  const T = LIGHTHOUSE;
  const plinth = new CylinderGeometry(T.plinthR, T.plinthR + 0.2, T.plinth + 1, 12);
  plinth.translate(0, (T.plinth - 1) / 2, 0);
  parts.add(plinth, rgb(STONE_FOOT), x, y, z, delay);
  const bands = [3.0, 2.4, 2.4, 2.4, 2.4, 2.4];
  let at = T.plinth;
  bands.forEach((h, i) => {
    const r0 = T.rBottom + ((T.rTop - T.rBottom) * (at - T.plinth)) / T.height;
    const r1 = T.rBottom + ((T.rTop - T.rBottom) * (at + h - T.plinth)) / T.height;
    const seg = new CylinderGeometry(r1, r0, h, 12);
    seg.translate(0, at + h / 2, 0);
    parts.add(seg, rgb(i % 2 ? LIGHTHOUSE_RED : LIGHTHOUSE_WHITE), x, y, z, delay);
    at += h;
  });
  const deck = new CylinderGeometry(T.galleryR, T.galleryR - 0.3, 0.4, 12);
  deck.translate(0, at + 0.2, 0);
  parts.add(deck, rgb(0x2b2622), x, y, z, delay + 0.03);
  const watch = new CylinderGeometry(T.watchR, T.watchR, T.watchH, 12);
  watch.translate(0, at + 0.4 + T.watchH / 2, 0);
  parts.add(watch, rgb(LIGHTHOUSE_WHITE), x, y, z, delay + 0.03);
  const lanternY = at + 0.4 + T.watchH;
  const lantern = new CylinderGeometry(1.25, 1.25, 2.2, 10);
  lantern.translate(0, lanternY + 1.1, 0);
  parts.add(lantern, rgb(0xe7c873), x, y, z, delay + 0.05);
  const dome = new ConeGeometry(1.55, 1.6, 12);
  dome.translate(0, lanternY + 2.2 + 0.8, 0);
  parts.add(dome, rgb(LIGHTHOUSE_RED), x, y, z, delay + 0.05);
  return lanternY + 1.1;
}

/** A flat timber deck (the quay, the pier) from `y0` (its foot) up to its top `y1`. */
function deck(
  parts: PropParts,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
  delay: number,
): void {
  const g = new BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate(0, (y1 - y0) / 2, 0);
  parts.add(g, rgb(DECK), (x0 + x1) / 2, y0, (z0 + z1) / 2, delay);
}

/** The cliff and stack meshes' detail on the chart (they're a few dozen pixels across there). */
const ROCK_TIER: Record<Tier, Tier> = { lite: 'lite', low: 'lite', medium: 'low', high: 'low', ultra: 'low' };

export async function createIslandProps(o: IslandPropsOptions): Promise<IslandProps> {
  const { grids, hasFog, tier } = o;
  const breathe = o.breathe ?? (() => Promise.resolve());
  // Lite and Low get lighter trees (fewer fronds); the chart is a few hundred pixels across there.
  detail.light = tier === 'lite' || tier === 'low';
  const group = new Group();
  group.name = 'chart pop-ups';
  const rise = uniform(0);
  const lamp = uniform(0);
  const fog = uniform(0);
  const time = uniform(0);
  const list: BufferGeometry[] = [];
  const lamps: { x: number; y: number; z: number }[] = [];
  const disposables: { dispose(): void }[] = [];

  for (const grid of grids) {
    const src = grid.src;
    const parts = new PropParts(grid);
    const hf = gridHeightField(grid);
    const r = mulberry(src.id === 'anchorage' ? 0x7a1a : 0x3e21);
    const span = Math.hypot(src.maxX - src.minX, src.maxZ - src.minZ) / 2;
    // Port Meridian rises after Anchorage, so its props wait a little longer.
    const late = src.id === 'anchorage' ? 0 : 0.35;
    const delayAt = (x: number, z: number) =>
      late + 0.6 * Math.min(1, Math.hypot(x - src.cx, z - src.cz) / span);
    if (src.id === 'anchorage') {
      // The village, house by house, from its own specs.
      for (const b of BUILDINGS) buildingOnChart(parts, hf.heightAt(b.x, b.z), b, delayAt(b.x, b.z));
      await breathe();
      const q = COVE.quay;
      deck(parts, q.x0, q.x1, q.z - 0.5, q.z + 5, -0.6, q.height, delayAt(-110, q.z));
      const pier = COVE.pier;
      deck(parts, pier.x - pier.width / 2, pier.x + pier.width / 2, pier.z1, pier.z0, -0.6, pier.deck, 0.25);
      // The point lighthouse, where it really stands.
      const L = COVE.lighthouse;
      const ly = hf.heightAt(L.x, L.z);
      const top = pointLighthouse(parts, L.x, ly, L.z, delayAt(L.x, L.z));
      lamps.push(paperPoint(grid, L.x, ly + top, L.z));
      // The island's own trees: the game's vegetation scatter on this terrain, the village's palms,
      // and the plants on the headland's clifftop and the sea stack.
      const exclude = (x: number, z: number): boolean =>
        Math.hypot(x - COVE.village.center.x, z - COVE.village.center.z) < COVE.village.radius + 6 ||
        (x > q.x0 - 2 && x < q.x1 + 2 && z > q.z - 3 && z < q.z + 7) ||
        (Math.abs(x - pier.x) < pier.width && z < pier.z0 && z > pier.z1 - 2) ||
        Math.hypot(x - L.x, z - L.z) < L.radius + 2 ||
        Math.hypot(x - COVE.mill.x, z - COVE.mill.z) < 10;
      const scatter = await scatterVegetationAsync(
        { heightField: hf, tier, island: ANCHORAGE_VEGETATION, exclude },
        breathe,
      );
      for (const [species, list] of Object.entries(scatter.plants))
        for (const p of list) {
          plant(parts, species, p.x, p.y, p.z, p.scale, delayAt(p.x, p.z), r);
          await breathe();
        }
      for (const p of villagePlantInstances(VILLAGE_PALMS, tier, hf.heightAt, hf.heightAt))
        plant(parts, p.species, p.x, p.y, p.z, p.scale, delayAt(p.x, p.z), r);
      for (const p of headlandCliffPlantSpots(hf, tier === 'lite' ? 0.5 : 1))
        plant(parts, p.species, p.x, p.y, p.z, p.scale, delayAt(p.x, p.z), r);
      for (const p of seaStackPlantSpots())
        plant(parts, p.species, p.x, p.y, p.z, p.scale, delayAt(p.x, p.z), r);
      await breathe();
      const rocks = chartRocks(grid, hf, tier, o.islandRise.get('anchorage'));
      await breathe();
      if (rocks) {
        group.add(rocks.mesh);
        disposables.push(rocks);
      }
    } else {
      // Port Meridian: the harbour front and the terraced streets, house by house as the town builds
      // them, the citadel's curtain wall on the hilltop, and the lighthouse on the mole.
      for (const row of [HARBOUR_FRONT_ROW, ...TERRACE_ROWS])
        for (const back of terraceHasBackRow(row, tier) ? [false, true] : [false])
          for (const h of terraceRun(row, back).houses) {
            await breathe();
            house(
              parts,
              h.x,
              row.height,
              h.z,
              h.rotY,
              h.w,
              h.d,
              h.storeys * 3,
              h.tint,
              h.roofTint,
              h.roof,
              late + 0.12 + delayAt(h.x, h.z) * 0.3,
            );
          }
      citadel(parts, late + 0.2);
      chartWater(parts, late + 0.15);
      // The island's hills, planted as the game plants them (on the chart's own baked ground).
      for (const p of [...meridianPlants(tier, hf), ...meridianTownPlants(tier)]) {
        plant(parts, p.species, p.x, p.y, p.z, p.scale, late + delayAt(p.x, p.z) * 0.7, r);
        await breathe();
      }
      const ml = MERIDIAN.mole.lighthouse;
      const my = hf.heightAt(ml.x, ml.z);
      moleLighthouse(parts, ml.x, my, ml.z, late + 0.25);
    }
    await breathe();
    const g = parts.merge();
    if (g) list.push(g);
    await breathe();
  }

  // The bounds a slice per island: the merged million points' bounding sphere, worked out on the
  // first compile, held the captain screen for ~50 ms.
  const bounds = new Sphere();
  for (const g of list) {
    g.computeBoundingSphere();
    if (g.boundingSphere) bounds.union(g.boundingSphere);
    await breathe();
  }
  const geo = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  if (geo) geo.boundingSphere = bounds;
  const mat = new MeshStandardNodeMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0,
    side: DoubleSide,
  });
  mat.name = 'chart props';
  const base = attribute('base', 'vec3');
  const delay = attribute('delay', 'float');
  const x = clamp(rise.sub(delay.mul(0.6)).div(0.4), 0, 1);
  const pop = float(1)
    .add(float(2.8).mul(x.sub(1).pow(3)))
    .add(float(1.8).mul(x.sub(1).pow(2)));
  mat.positionNode = base.add(positionGeometry.sub(base).mul(pop.max(0.0001)));
  const mesh = new Mesh(geo, mat);
  mesh.name = 'chart props';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // Anchorage's lamp: a warm glow, and a slow beam sweeping the chart's sea.
  const beam = new Group();
  const lampAt = lamps[0];
  const glowMat = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  glowMat.colorNode = color(0xffe1a0).mul(lamp.mul(3));
  const glow = new Mesh(new SphereGeometry(0.0026, 10, 8), glowMat);
  const beamMat = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: 2,
  });
  const along = uv().y;
  beamMat.colorNode = color(0xffe6b0);
  beamMat.opacityNode = lamp
    .mul(0.22)
    .mul(pow(along, 2))
    .mul(smoothstep(0, 0.4, along));
  const cone = new ConeGeometry(0.012, 0.16, 12, 1, true);
  cone.translate(0, -0.08, 0);
  cone.rotateZ(Math.PI / 2);
  const beamMesh = new Mesh(cone, beamMat);
  beamMesh.renderOrder = 7;
  beam.add(beamMesh);
  if (lampAt) {
    glow.position.set(lampAt.x, lampAt.y, lampAt.z);
    beam.position.set(lampAt.x, lampAt.y, lampAt.z);
  }
  group.add(glow, beam);

  // Paper clouds over the islands still to come.
  // (Paper clouds were tried over the islands still to come; the chart's own placeholders replaced them.)
  const clouds = hasFog ? createPaperClouds() : null;
  if (clouds) group.add(clouds.group);

  return {
    group,
    rise,
    lamp,
    fog,
    update(dt, t) {
      time.value = t;
      beam.rotation.y -= dt * 0.9;
      if (clouds) {
        clouds.pop.value = fog.value;
        clouds.update(t);
      }
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      glow.geometry.dispose();
      glowMat.dispose();
      cone.dispose();
      beamMat.dispose();
      clouds?.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}

function paperPoint(grid: IslandGrid, x: number, y: number, z: number): { x: number; y: number; z: number } {
  const p = { x: 0, y: 0, z: 0 };
  worldToPaper(grid.src, x, y, z, p);
  return p;
}

/** A village building from its spec: its footprint, storeys, walls and roof as the village builds it. */
function buildingOnChart(parts: PropParts, ground: number, b: BuildingSpec, delay: number): void {
  const y = b.quay ? Math.max(ground, COVE.quay.height) : ground;
  house(parts, b.x, y, b.z, b.rot, b.w, b.d, b.floors * 3.1, b.colour, b.roofColour, b.roof, delay);
}

/** The citadel on Port Meridian's hilltop: its elliptical curtain wall and four round towers. */
function citadel(parts: PropParts, delay: number): void {
  const c = MERIDIAN.pads.citadel;
  const rx = 39;
  const rz = 39 * 0.78;
  const y = 40;
  const n = 28;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const x0 = c.x + Math.cos(a0) * rx;
    const z0 = c.z + Math.sin(a0) * rz;
    const x1 = c.x + Math.cos(a1) * rx;
    const z1 = c.z + Math.sin(a1) * rz;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const wall = new BoxGeometry(len + 0.4, 7, 1.8);
    wall.translate(0, 1.5, 0);
    parts.add(
      wall,
      rgb(LIMESTONE, 0.92),
      (x0 + x1) / 2,
      y - 2,
      (z0 + z1) / 2,
      delay,
      -Math.atan2(z1 - z0, x1 - x0),
    );
  }
  // The paved court inside the walls.
  const court = new CylinderGeometry(1, 1, 1, 28);
  court.scale(rx * 0.97, 1, rz * 0.97);
  court.translate(0, -0.45, 0);
  parts.add(court, rgb(LIMESTONE, 0.95), c.x, y, c.z, delay);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const t = new CylinderGeometry(3.4, 3.8, 11, 10);
    t.translate(0, 3.5, 0);
    parts.add(t, rgb(LIMESTONE), c.x + Math.cos(a) * rx, y - 2, c.z + Math.sin(a) * rz, delay + 0.04);
  }
}

/** The harbour light at the end of Port Meridian's mole. */
/** Meridian's tarn, cascade, brook, lake and outflow: flat water on the chart's ground, white where steep. */
function chartWater(parts: PropParts, delay: number): void {
  const water = meridianWater();
  const wide = parts.wide;
  parts.wide = 1;
  const teal = rgb(0x2f8c94, 1);
  for (const b of Object.values(water.basins)) {
    const pos: number[] = [];
    const n = 28;
    for (let i = 0; i < n; i++) {
      const [ax, az] = water.rimPoint(b, (i / n) * Math.PI * 2, 1.02);
      const [bx, bz] = water.rimPoint(b, ((i + 1) / n) * Math.PI * 2, 1.02);
      pos.push(0, 0, 0, bx - b.x, 0, bz - b.z, ax - b.x, 0, az - b.z);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    parts.add(g, teal, b.x, b.level + 0.35, b.z, delay);
  }
  for (const s of water.streams) {
    const x0 = s.x[0]!;
    const z0 = s.z[0]!;
    const y0 = s.surface[0]!;
    const pos: number[] = [];
    const col: number[] = [];
    for (let i = 0; i < s.count - 1; i++) {
      const w = s.spec.halfWidth * 1.3;
      const quad: number[][] = [];
      for (const j of [i, i + 1]) {
        const a = Math.max(0, j - 1);
        const c = Math.min(s.count - 1, j + 1);
        const dx = s.x[c]! - s.x[a]!;
        const dz = s.z[c]! - s.z[a]!;
        const len = Math.hypot(dx, dz) || 1;
        const y = s.surface[j]! + 0.35 - y0;
        quad.push([s.x[j]! - x0 - (dz / len) * w, y, s.z[j]! - z0 + (dx / len) * w]);
        quad.push([s.x[j]! - x0 + (dz / len) * w, y, s.z[j]! - z0 - (dx / len) * w]);
      }
      const [a, b, c, d] = quad as [number[], number[], number[], number[]];
      pos.push(...a, ...c, ...b, ...b, ...c, ...d);
      const steep = Math.min(1, (s.surface[i]! - s.surface[i + 1]!) / 1.6);
      col.push(steep);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    // The white of falling water can't ride on one colour per part, so steep runs go in their own part.
    parts.add(g, teal, x0, y0, z0, delay);
    const white: number[] = [];
    for (let i = 0; i < col.length; i++)
      if (col[i]! > 0.45)
        white.push(...pos.slice(i * 18, i * 18 + 18).map((v, k) => (k % 3 === 1 ? v + 0.15 : v)));
    if (white.length) {
      const fall = new BufferGeometry();
      fall.setAttribute('position', new BufferAttribute(new Float32Array(white), 3));
      parts.add(fall, rgb(0xdfeeee, 1), x0, y0, z0, delay);
    }
  }
  parts.wide = wide;
}

function moleLighthouse(parts: PropParts, x: number, y: number, z: number, delay: number): void {
  const tower = new CylinderGeometry(1.7, 2.3, 11, 10);
  tower.translate(0, 5.5, 0);
  parts.add(tower, rgb(LIMESTONE), x, y, z, delay);
  const lantern = new CylinderGeometry(1.1, 1.1, 1.8, 8);
  lantern.translate(0, 11.9, 0);
  parts.add(lantern, rgb(0xe7c873), x, y, z, delay + 0.04);
  const dome = new ConeGeometry(1.4, 1.4, 10);
  dome.translate(0, 13.5, 0);
  parts.add(dome, rgb(0xc8703a), x, y, z, delay + 0.04);
}

/**
 * Anchorage's headland cliff and sea stack: the game's own meshes (coarse), mapped onto the paper,
 * wearing the game's limestone material fed their true heights. They rise with the island.
 */
function chartRocks(
  grid: IslandGrid,
  hf: ReturnType<typeof gridHeightField>,
  tier: Tier,
  islandRise: { value: number } | undefined,
): { mesh: Mesh; dispose(): void } | null {
  const rockTier = ROCK_TIER[tier];
  const parts: BufferGeometry[] = [];
  const cliff = buildHeadlandCliffGeometry(hf, HEADLAND_CLIFF_DETAIL[rockTier]);
  if (cliff) parts.push(cliff);
  parts.push(buildSeaStackGeometry({ columns: 48, rows: 30, rings: 3, blocks: 0 }));
  for (const g of parts)
    for (const name of Object.keys(g.attributes))
      if (!['position', 'uv', 'karst'].includes(name)) g.deleteAttribute(name);
  const geo = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!geo) return null;
  const pos = geo.getAttribute('position') as BufferAttribute;
  const world = new Float32Array(pos.array as Float32Array);
  const p = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < pos.count; i++) {
    worldToPaper(grid.src, pos.getX(i), pos.getY(i), pos.getZ(i), p);
    // Under the sea, tuck just below the paper, like the island's own shallows.
    pos.setXYZ(i, p.x, pos.getY(i) > 0 ? p.y + 0.0004 : -0.0012 * Math.min(1, -pos.getY(i) / 2), p.z);
  }
  geo.setAttribute('worldPos', new BufferAttribute(world, 3));
  geo.computeVertexNormals();
  const worldPos = attribute('worldPos', 'vec3');
  const mat = createSeaStackMaterial(rockTier, { worldY: worldPos.y, miniature: true });
  if (islandRise) {
    // The island's own pop-up curve, as for ground about this far out from its middle.
    const x = clamp((islandRise as unknown as AnyNode).sub(0.21).div(0.65), 0, 1);
    mat.positionNode = vec3(positionGeometry.x, popUpY(positionGeometry.y, x), positionGeometry.z);
  }
  const mesh = new Mesh(geo, mat);
  mesh.name = 'chart rocks';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return {
    mesh,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

/**
 * Paper cloud cut-outs over the islands still to come (pop-up book style): a white cloud with an ink
 * rim, standing on the chart and bobbing, which pops up as the sea comes alive.
 */
function createPaperClouds(): {
  group: Group;
  pop: { value: number };
  update(t: number): void;
  dispose(): void;
} {
  const group = new Group();
  group.name = 'paper clouds';
  const locked = ARCHIPELAGO.filter((i) => !CHART_ISLANDS.some((c) => c.id === i.id));
  const bumps = [
    [-0.03, 0, 0.012],
    [-0.016, 0.008, 0.016],
    [0.004, 0.012, 0.019],
    [0.022, 0.006, 0.015],
    [0.034, -0.001, 0.01],
  ] as const;
  // The outline: arcs over the top and a flat paper base, as a fan from the base's middle (the
  // shape is star-shaped from there), so no triangulator is needed.
  const outline: [number, number][] = [[-0.042, -0.006]];
  for (const [x, y, r] of bumps)
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI - (k / 10) * Math.PI;
      outline.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
  outline.push([0.044, -0.006]);
  const fan = (grow: number, dz: number): BufferGeometry => {
    const pos: number[] = [0, -0.006 * grow, dz];
    for (const [x, y] of outline) pos.push(x * grow, y * grow, dz);
    const index: number[] = [];
    for (let i = 1; i < outline.length; i++) index.push(0, i, i + 1);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setIndex(index);
    return g;
  };
  const face = fan(1, 0);
  const rim = fan(1.09, -0.0006);
  // Paper lit from the front (the sun is behind them, and a dark cloud reads as a storm).
  const faceMat = new MeshBasicNodeMaterial({ color: 0xf2ebdc, side: 2 });
  const rimMat = new MeshBasicNodeMaterial({ color: 0x4a3218, side: 2 });
  const pop = uniform(0);
  const items: { obj: Group; phase: number; y: number }[] = [];
  locked.forEach((isl, i) => {
    const g = new Group();
    const card = new Group();
    card.add(new Mesh(rim, rimMat), new Mesh(face, faceMat));
    // A thin paper stalk holding it up off the chart.
    g.add(card);
    const k = 1.15 + ((i * 37) % 10) / 22;
    g.scale.setScalar(k);
    const at = sheetUV(isl.x, isl.y);
    g.position.set((at.u - 0.5) * CHART_W, 0, (at.v - 0.5) * CHART_D);
    g.rotation.y = ((i % 3) - 1) * 0.25;
    // Leaning back a little toward the viewer, like a pop-up card.
    card.rotation.x = -0.45;
    group.add(g);
    items.push({ obj: card, phase: i * 1.7, y: 0.022 + (i % 2) * 0.006 });
  });
  for (const it of items) it.obj.traverse((o) => ((o as Mesh).castShadow = true));
  return {
    group,
    pop,
    update(t) {
      const p = pop.value;
      for (const it of items) {
        const s = Math.max(1e-4, p < 1 ? 1 + 2.6 * (p - 1) ** 3 + 1.6 * (p - 1) ** 2 : 1);
        it.obj.scale.setScalar(s);
        it.obj.position.y = it.y * s + Math.sin(t * 0.8 + it.phase) * 0.002;
        it.obj.rotation.z = Math.sin(t * 0.6 + it.phase) * 0.03;
        it.obj.rotation.x = -0.45 + Math.sin(t * 0.5 + it.phase) * 0.03;
      }
    },
    dispose() {
      face.dispose();
      rim.dispose();
      faceMat.dispose();
      rimMat.dispose();
    },
  };
}
