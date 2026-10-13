import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  CylinderGeometry,
  Euler,
  Group,
  Mesh,
  Matrix4,
  MeshStandardNodeMaterial,
  OctahedronGeometry,
  Quaternion,
  Sprite,
  SphereGeometry,
  SpriteNodeMaterial,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { unreflected } from '../world/reflection';

const W = 0.92;
const H = 0.46;
const D = 0.58;
const LID_R = D / 2;

const WOOD = [0.42, 0.25, 0.13] as const;
const WOOD_DARK = [0.3, 0.17, 0.09] as const;
const IRON = [0.16, 0.15, 0.15] as const;
const GOLD = [0.86, 0.64, 0.22] as const;
/** The chest's hollow, seen once the lid's up (a dark inset over the body's top). */
const HOLLOW = [0.09, 0.055, 0.03] as const;
const WALL = 0.045;

function tint(g: BufferGeometry, c: readonly [number, number, number]): BufferGeometry {
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set(c, i * 3);
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  c: readonly [number, number, number],
) {
  const g = new BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return tint(g, c);
}

/** Half-cylinder shell along x (the curved chest lid), hinge at the back edge (z = -LID_R, y = 0). */
/** How much darker the inside of the lid is than its outside. */
const LID_INSIDE = 0.42;

/** The back of `g` as faces of their own: winding and normals flipped, colours scaled by `shade`. */
function insideFaces(g: BufferGeometry, shade: number): BufferGeometry {
  const inside = g.clone();
  const index = inside.index;
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, b);
    }
  }
  const normal = inside.getAttribute('normal');
  for (let i = 0; i < normal.count; i++) normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
  const color = inside.getAttribute('color');
  for (let i = 0; i < color.count; i++)
    color.setXYZ(i, color.getX(i) * shade, color.getY(i) * shade, color.getZ(i) * shade);
  return inside;
}

function lidShell(r: number, len: number, x: number, c: readonly [number, number, number]) {
  const g = new CylinderGeometry(r, r, len, 18, 1, false, 0, Math.PI);
  g.rotateZ(Math.PI / 2);
  g.translate(x, 0, LID_R);
  return tint(g, c);
}

/**
 * Coin faces, their milled edges, and the heap they sit on (so no gaps show the hollow), in linear
 * colour: a deep gold, since a pale one washes out to grey-green under the blue sky light.
 */
const COIN_FACE = [0.86, 0.52, 0.1] as const;
const COIN_EDGE = [0.5, 0.27, 0.05] as const;
const COIN_BED = [0.4, 0.22, 0.035] as const;
const COIN_R = 0.034;
const COIN_T = 0.007;

/** The same heap every time (a tiny LCG), so every chest and every test sees the same coins. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Colours a coin by face: bright faces, darker milled edges, so each disc reads on its own. */
function coin(): BufferGeometry {
  const g = new CylinderGeometry(COIN_R, COIN_R, COIN_T, 14, 1).toNonIndexed();
  const n = g.getAttribute('normal');
  const colors = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) colors.set(Math.abs(n.getY(i)) > 0.5 ? COIN_FACE : COIN_EDGE, i * 3);
  g.setAttribute('color', new BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

/**
 * A heap of gold coins over the open chest's hollow: a low bed, discs scattered over a mound and
 * tilted to its slope, a couple leaning on edge, and two gems on top.
 */
function coinHeap(): BufferGeometry {
  const rand = seeded(20260928);
  const inW = W - WALL * 2 - COIN_R * 2;
  const inD = D - WALL * 2 - COIN_R * 2;
  const mound = (x: number, z: number) =>
    0.035 + 0.1 * Math.max(0, 1 - (x / (inW * 0.56)) ** 2 - (z / (inD * 0.6)) ** 2);
  const parts: BufferGeometry[] = [];
  const bed = new SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
  bed.scale(inW * 0.55, 0.11, inD * 0.56);
  bed.translate(0, H - 0.012, 0);
  bed.deleteAttribute('uv');
  parts.push(tint(bed, COIN_BED));
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const one = new Vector3(1, 1, 1);
  const at = new Vector3();
  const place = (x: number, y: number, z: number, rx: number, ry: number, rz: number) => {
    const g = coin();
    m.compose(at.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz, 'YXZ')), one);
    g.applyMatrix4(m);
    parts.push(g);
  };
  for (let i = 0; i < 110; i++) {
    const x = (rand() - 0.5) * inW;
    const z = (rand() - 0.5) * inD;
    const h = mound(x, z);
    // Tilt with the mound's slope, plus a little tumble.
    const dx = (mound(x + 0.02, z) - mound(x - 0.02, z)) / 0.04;
    const dz = (mound(x, z + 0.02) - mound(x, z - 0.02)) / 0.04;
    const y = H + h - rand() * 0.012;
    place(
      x,
      y,
      z,
      Math.atan(dz) + (rand() - 0.5) * 0.5,
      rand() * Math.PI,
      -Math.atan(dx) + (rand() - 0.5) * 0.5,
    );
  }
  // Two coins leaning on edge against the heap.
  place(-0.2, H + 0.06, 0.1, 0.25, 0.4, Math.PI / 2 - 0.35);
  place(0.23, H + 0.05, -0.06, -0.2, -0.7, Math.PI / 2 + 0.4);
  for (const [x, z, r, c] of [
    [0.05, 0.02, 0.028, [0.72, 0.06, 0.12]],
    [-0.1, -0.07, 0.022, [0.08, 0.6, 0.32]],
  ] as const) {
    const gem = new OctahedronGeometry(r, 0);
    gem.scale(1, 1.3, 1);
    gem.translate(x, H + mound(x, z) + r * 0.9, z);
    gem.deleteAttribute('uv');
    parts.push(tint(gem, c));
  }
  const heap = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return heap;
}

let sharedMaterial: MeshStandardNodeMaterial | null = null;
/**
 * Gold for the coins and gems: a little metallic to catch the light, but mostly its own colour (a
 * fully metal coin mirrors the blue sky and reads green).
 */
let sharedCoinMaterial: MeshStandardNodeMaterial | null = null;
/** The lid's shell is one surface: drawn from both sides, with the inside of the lid darker. */
let sharedLidMaterial: MeshStandardNodeMaterial | null = null;
let sharedGlow: CanvasTexture | null = null;
/** Chests not yet disposed: the last one frees the shared GPU copies (kept for the next voyage). */
let liveChests = 0;

function glowTexture(): CanvasTexture {
  if (sharedGlow) return sharedGlow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255, 226, 150, 0.95)');
  g.addColorStop(0.35, 'rgba(255, 196, 90, 0.35)');
  g.addColorStop(1, 'rgba(255, 180, 60, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  sharedGlow = new CanvasTexture(c);
  sharedGlow.colorSpace = SRGBColorSpace;
  return sharedGlow;
}

export interface TreasureChest {
  readonly group: Group;
  readonly opened: boolean;
  /** Plays the lid animation; resolves when it's open. */
  open(): Promise<void>;
  /** Shows it already open (loaded from a save). */
  setOpen(): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

/**
 * A small iron-banded treasure chest heaped with gold coins, with a warm shimmer until it's opened.
 * Three draws (the body, the coins, and the lid); every chest shares the materials.
 */
export function createChest(): TreasureChest {
  sharedMaterial ??= new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.18 });
  // The body's shader (only its roughness and metalness differ): the lid's inside is its own
  // darker faces (insideFaces), not a double-sided colour graph with shaders of its own.
  sharedLidMaterial ??= new MeshStandardNodeMaterial({
    vertexColors: true,
    roughness: 0.66,
    metalness: 0.12,
  });
  const group = new Group();
  group.name = 'treasure chest';
  // Not in the harbour mirror: what it stands on isn't reflected either, and each reflected look
  // needs its own mirror shaders (PLAN §15.4).
  unreflected.add(group);

  const parts: BufferGeometry[] = [
    box(W, H, D, 0, H / 2, 0, WOOD),
    box(W + 0.01, 0.05, D + 0.01, 0, H - 0.1, 0, WOOD_DARK),
    box(W + 0.01, 0.05, D + 0.01, 0, 0.12, 0, WOOD_DARK),
    box(W + 0.02, H * 0.98, 0.05, 0, H / 2, D / 2 - 0.02, WOOD_DARK),
  ];
  for (const x of [-W / 2 + 0.12, W / 2 - 0.12]) parts.push(box(0.06, H + 0.01, D + 0.03, x, H / 2, 0, IRON));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) parts.push(box(0.09, 0.09, 0.09, (sx * W) / 2, 0.045, (sz * D) / 2, GOLD));
  parts.push(box(0.12, 0.14, 0.03, 0, H - 0.06, D / 2 + 0.02, GOLD));
  // The open chest: a dark hollow inside the walls (the coins sit in it, under the lid until then).
  parts.push(box(W - WALL * 2, 0.004, D - WALL * 2, 0, H + 0.002, 0, HOLLOW));
  const bodyGeo = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  const body = new Mesh(bodyGeo, sharedMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  sharedCoinMaterial ??= new MeshStandardNodeMaterial({
    vertexColors: true,
    roughness: 0.42,
    metalness: 0.3,
  });
  const coinGeo = coinHeap();
  const coins = new Mesh(coinGeo, sharedCoinMaterial);
  coins.name = 'chest coins';
  coins.receiveShadow = true;

  const lidParts: BufferGeometry[] = [
    lidShell(LID_R, W, 0, WOOD),
    lidShell(LID_R + 0.012, 0.06, -W / 2 + 0.12, IRON),
    lidShell(LID_R + 0.012, 0.06, W / 2 - 0.12, IRON),
    box(0.1, 0.08, 0.03, 0, 0.02, D + 0.01, GOLD),
  ];
  const shell = mergeGeometries(lidParts)!;
  for (const p of lidParts) p.dispose();
  const inside = insideFaces(shell, LID_INSIDE);
  const lidGeo = mergeGeometries([shell, inside])!;
  shell.dispose();
  inside.dispose();
  const lid = new Mesh(lidGeo, sharedLidMaterial);
  lid.castShadow = true;
  const hinge = new Group();
  hinge.position.set(0, H, -D / 2);
  hinge.add(lid);
  group.add(body, coins, hinge);

  const glowMat = new SpriteNodeMaterial({
    map: glowTexture(),
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const glow = new Sprite(glowMat);
  liveChests++;
  glow.scale.setScalar(1.6);
  glow.position.set(0, H + 0.35, 0);
  glow.renderOrder = 2;
  group.add(glow);

  let opened = false;
  let anim = -1;
  let done: (() => void) | null = null;
  const OPEN_ANGLE = -1.95;
  const OPEN_TIME = 0.75;

  return {
    group,
    get opened() {
      return opened;
    },
    open() {
      if (opened) return Promise.resolve();
      opened = true;
      anim = 0;
      return new Promise((resolve) => (done = resolve));
    },
    setOpen() {
      opened = true;
      anim = -1;
      hinge.rotation.x = OPEN_ANGLE;
      glow.visible = false;
    },
    update(dt, t) {
      if (anim >= 0) {
        anim = Math.min(1, anim + dt / OPEN_TIME);
        const e = 1 - Math.pow(1 - anim, 3);
        // A little overshoot bounce at the end reads as a heavy lid.
        hinge.rotation.x = OPEN_ANGLE * e + Math.sin(e * Math.PI) * -0.12;
        glowMat.opacity = 1 - e;
        glow.scale.setScalar(1.6 + e * 1.2);
        if (anim >= 1) {
          anim = -1;
          glow.visible = false;
          done?.();
          done = null;
        }
      } else if (!opened) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
        glowMat.opacity = 0.55 + pulse * 0.35;
        glow.position.y = H + 0.35 + Math.sin(t * 1.3) * 0.05;
      }
    },
    dispose() {
      bodyGeo.dispose();
      coinGeo.dispose();
      lidGeo.dispose();
      glowMat.dispose();
      unreflected.delete(group);
      group.removeFromParent();
      if (--liveChests === 0) {
        // Every sprite shares one geometry; the glow's canvas stays drawn for the next upload.
        glow.geometry.dispose();
        sharedGlow?.dispose();
      }
    },
  };
}
