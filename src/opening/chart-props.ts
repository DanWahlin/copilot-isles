import {
  AdditiveBlending,
  BufferAttribute,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  BufferGeometry,
} from 'three/webgpu';
import { attribute, clamp, color, float, positionGeometry, pow, smoothstep, uniform, uv } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MERIDIAN } from '../world/islands/meridian';
import { COVE } from '../world/layout';
import { ARCHIPELAGO } from '../ui/chart/archipelago';
import { CHART_D, CHART_W, worldToPaper, type ChartIslandSource } from './chart-map';
import type { IslandGrid } from './island-grid';

/**
 * The pop-up book's paper-craft on each real island (docs/specs/OPENING-living-chart.md): palms where
 * the island's own grass is, the village and town where they really stand, and the lighthouses with
 * their lamps lit. They stand up after the island itself, each from its own base, overshooting a
 * touch like a card unfolding. Sizes are exaggerated (true scale would be specks).
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

/** Props stand this much larger than true scale. */
const EX = 2.6;

type RGB = readonly [number, number, number];
const TRUNK: RGB = [0.45, 0.32, 0.2];
const FROND: RGB = [0.24, 0.5, 0.2];
const FROND_LIGHT: RGB = [0.36, 0.62, 0.26];
const WALL: RGB = [0.93, 0.88, 0.76];
const ROOF: RGB = [0.72, 0.28, 0.18];
const TERRACOTTA: RGB = [0.8, 0.42, 0.26];
const STONE: RGB = [0.78, 0.72, 0.6];
const RED: RGB = [0.78, 0.18, 0.14];

class PropParts {
  readonly list: BufferGeometry[] = [];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly one = new Vector3(1, 1, 1);

  /** Adds `g` (built in metres at the origin) at a base point in paper space, scaled for the chart. */
  add(g: BufferGeometry, c: RGB, base: Vector3, scale: number, delay: number, rotY = 0, tilt = 0): void {
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    geo.deleteAttribute('uv');
    const n = geo.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    const bases = new Float32Array(n * 3);
    const delays = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      colors.set(c, i * 3);
      bases.set([base.x, base.y, base.z], i * 3);
      delays[i] = delay;
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    geo.setAttribute('base', new BufferAttribute(bases, 3));
    geo.setAttribute('delay', new BufferAttribute(delays, 1));
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), rotY);
    if (tilt) this.q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), tilt));
    this.m.compose(base, this.q, this.one.setScalar(scale));
    geo.applyMatrix4(this.m);
    this.list.push(geo);
  }

  merge(): BufferGeometry | null {
    if (!this.list.length) return null;
    const g = mergeGeometries(this.list)!;
    for (const p of this.list) p.dispose();
    this.list.length = 0;
    return g;
  }
}

function heightAt(grid: IslandGrid, x: number, z: number): number {
  const { src, nx, nz, heights } = grid;
  const fx = Math.min(nx - 1.001, Math.max(0, (x - src.minX) / src.cell));
  const fz = Math.min(nz - 1.001, Math.max(0, (z - src.minZ) / src.cell));
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const h = (i: number, j: number) => heights[j * nx + i]!;
  return (
    (h(ix, iz) * (1 - tx) + h(ix + 1, iz) * tx) * (1 - tz) +
    (h(ix, iz + 1) * (1 - tx) + h(ix + 1, iz + 1) * tx) * tz
  );
}

function palm(parts: PropParts, base: Vector3, s: number, delay: number, r: () => number): void {
  const lean = (r() - 0.5) * 0.5;
  const rot = r() * Math.PI * 2;
  const H = 8 + r() * 3;
  parts.add(new CylinderGeometry(0.22, 0.38, H, 5), TRUNK, base, s, delay, rot, lean * 0.4);
  // The crown: six fronds as folded paper blades drooping from the top.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r() * 0.4;
    const blade = new ConeGeometry(0.9, 5.2, 3, 1);
    blade.translate(0, 2.6, 0);
    blade.rotateZ(-1.15 - r() * 0.35);
    blade.rotateY(a);
    blade.translate(0, H * 0.96, 0);
    parts.add(blade, i % 2 ? FROND : FROND_LIGHT, base, s, delay + 0.08, rot, lean * 0.4);
  }
}

function house(
  parts: PropParts,
  base: Vector3,
  s: number,
  delay: number,
  rot: number,
  roof: RGB,
  w = 8,
  d = 6,
  h = 5,
): void {
  const body = new CylinderGeometry(1, 1, 1, 4, 1);
  body.rotateY(Math.PI / 4);
  body.scale(w / Math.SQRT2, h, d / Math.SQRT2);
  body.translate(0, h / 2, 0);
  parts.add(body, WALL, base, s, delay, rot);
  const r = new CylinderGeometry(0.0001, 1, 1, 4, 1);
  r.rotateY(Math.PI / 4);
  r.scale((w + 1) / Math.SQRT2, 3, (d + 1) / Math.SQRT2);
  r.translate(0, h + 1.5, 0);
  parts.add(r, roof, base, s, delay + 0.05, rot);
}

function lighthouse(parts: PropParts, base: Vector3, s: number, delay: number): number {
  const H = 15;
  for (let i = 0; i < 5; i++) {
    const y0 = (i / 5) * H;
    const seg = new CylinderGeometry(2.6 - ((i + 1) / 5) * 0.9, 2.6 - (i / 5) * 0.9, H / 5, 10);
    seg.translate(0, y0 + H / 10, 0);
    parts.add(seg, i % 2 ? RED : WALL, base, s, delay);
  }
  const gallery = new CylinderGeometry(2.3, 2.3, 0.6, 10);
  gallery.translate(0, H + 0.3, 0);
  parts.add(gallery, [0.15, 0.13, 0.12], base, s, delay + 0.05);
  const cap = new ConeGeometry(1.9, 2.2, 10);
  cap.translate(0, H + 3.6, 0);
  parts.add(cap, RED, base, s, delay + 0.05);
  return (H + 1.6) * s;
}

export function createIslandProps(grids: readonly IslandGrid[], hasFog: boolean): IslandProps {
  const group = new Group();
  group.name = 'chart pop-ups';
  const rise = uniform(0);
  const lamp = uniform(0);
  const fog = uniform(0);
  const time = uniform(0);
  const parts = new PropParts();
  const p = { x: 0, y: 0, z: 0 };
  const at = (src: ChartIslandSource, grid: IslandGrid, x: number, z: number, out: Vector3) => {
    worldToPaper(src, x, Math.max(0, heightAt(grid, x, z)), z, p);
    return out.set(p.x, p.y, p.z);
  };
  const lamps: Vector3[] = [];
  let seed = 0x7a1a;
  const r = () => {
    seed = (Math.imul(seed ^ (seed >>> 13), 0x5bd1e995) + 0x6d2b79f5) >>> 0;
    return seed / 4294967296;
  };

  for (const grid of grids) {
    const src = grid.src;
    const s = src.scale * EX;
    const b = new Vector3();
    const span = Math.hypot(src.maxX - src.minX, src.maxZ - src.minZ) / 2;
    // Port Meridian rises after Anchorage, so its paper-craft waits a little longer.
    const late = src.id === 'anchorage' ? 0 : 0.35;
    const delayAt = (x: number, z: number) =>
      late + 0.6 * Math.min(1, Math.hypot(x - src.cx, z - src.cz) / span);
    // Palms on the island's own grass, mostly on the low ground near the shore.
    const want = src.id === 'anchorage' ? 48 : 30;
    let placed = 0;
    for (let tries = 0; tries < 4000 && placed < want; tries++) {
      const x = src.minX + r() * (src.maxX - src.minX);
      const z = src.minZ + r() * (src.maxZ - src.minZ);
      const h = heightAt(grid, x, z);
      if (h < 1.6 || h > (src.id === 'anchorage' ? 22 : 30)) continue;
      const m = src.masks(x, z);
      if (m.grass < 0.55 || m.cliff > 0.2) continue;
      if (src.id === 'anchorage' && Math.hypot(x - COVE.village.center.x, z - COVE.village.center.z) < 34)
        continue;
      palm(parts, at(src, grid, x, z, b), s * (0.85 + r() * 0.3), delayAt(x, z), r);
      placed++;
    }
    if (src.id === 'anchorage') {
      // The village round its plaza, and the point lighthouse on the quay.
      const v = COVE.village.center;
      for (let i = 0; i < 11; i++) {
        // A loose cluster round the plaza (the middle stays open), streets roughly east-west.
        const a = i * 2.39996;
        const d = 13 + Math.sqrt(i / 11) * 18;
        const x = v.x + Math.cos(a) * d;
        const z = v.z + Math.sin(a) * d * 0.8;
        house(parts, at(src, grid, x, z, b), s * (0.85 + r() * 0.3), 0.2 + i * 0.02, (r() - 0.5) * 0.5, ROOF);
      }
      const lx = COVE.quay.x1 - 2.7;
      const lz = COVE.quay.z + 0.8;
      const top = lighthouse(parts, at(src, grid, lx, lz, b), s * 1.2, 0.2);
      lamps.push(b.clone().setY(b.y + top * 1.2));
    } else {
      // Port Meridian: terraced houses up the hill, the citadel, and the mole's lighthouse.
      for (const t of MERIDIAN.terraces) {
        const n = Math.round(Math.hypot(t.bx - t.ax, t.bz - t.az) / 18);
        for (let i = 0; i <= n; i++) {
          const x = t.ax + ((t.bx - t.ax) * i) / n;
          const z = t.az + ((t.bz - t.az) * i) / n;
          house(parts, at(src, grid, x, z, b), s, late + 0.15 + i * 0.01, 0, TERRACOTTA, 9, 7, 6);
        }
      }
      const c = MERIDIAN.pads.citadel;
      house(parts, at(src, grid, c.x, c.z, b), s, late + 0.1, 0.3, STONE, 30, 22, 14);
      const ml = MERIDIAN.mole.lighthouse;
      lighthouse(parts, at(src, grid, ml.x, ml.z, b), s * 1.1, late + 0.2);
    }
  }

  const geo = parts.merge()!;
  const mat = new MeshStandardNodeMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
    flatShading: true,
  });
  const base = attribute('base', 'vec3');
  const delay = attribute('delay', 'float');
  const x = clamp(rise.sub(delay.mul(0.6)).div(0.4), 0, 1);
  const pop = float(1)
    .add(float(2.8).mul(x.sub(1).pow(3)))
    .add(float(1.8).mul(x.sub(1).pow(2)));
  mat.positionNode = base.add(positionGeometry.sub(base).mul(pop.max(0.0001)));
  const mesh = new Mesh(geo, mat);
  mesh.name = 'chart paper-craft';
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
    glow.position.copy(lampAt);
    beam.position.copy(lampAt);
  }
  group.add(glow, beam);

  // Paper clouds over the islands still to come.
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
  const locked = ARCHIPELAGO.filter((i) => i.id !== 'anchorage' && i.id !== 'meridian');
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
    g.position.set((isl.x - 0.5) * CHART_W, 0, (isl.y - 0.5) * CHART_D);
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
