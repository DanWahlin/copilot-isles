import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardNodeMaterial,
  Sprite,
  SphereGeometry,
  SpriteNodeMaterial,
  SRGBColorSpace,
  type BufferGeometry,
} from 'three/webgpu';
import { float, frontFacing, select, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
function lidShell(r: number, len: number, x: number, c: readonly [number, number, number]) {
  const g = new CylinderGeometry(r, r, len, 18, 1, false, 0, Math.PI);
  g.rotateZ(Math.PI / 2);
  g.translate(x, 0, LID_R);
  return tint(g, c);
}

let sharedMaterial: MeshStandardNodeMaterial | null = null;
/** The lid's shell is one surface: drawn from both sides, with the inside of the lid darker. */
let sharedLidMaterial: MeshStandardNodeMaterial | null = null;
let sharedGlow: CanvasTexture | null = null;

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
 * A small iron-banded treasure chest (2 draws: the body, and a double-sided lid; both materials are
 * shared by every chest)
 * with a warm shimmer until it's opened.
 */
export function createChest(): TreasureChest {
  sharedMaterial ??= new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.18 });
  if (!sharedLidMaterial) {
    sharedLidMaterial = new MeshStandardNodeMaterial({
      vertexColors: true,
      roughness: 0.66,
      metalness: 0.12,
      side: DoubleSide,
    });
    sharedLidMaterial.colorNode = vec3(select(frontFacing, float(1), float(0.42)));
  }
  const group = new Group();
  group.name = 'treasure chest';

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
  // The open chest: a dark hollow inside the walls, heaped with coins (hidden under the lid until then).
  parts.push(box(W - WALL * 2, 0.004, D - WALL * 2, 0, H + 0.002, 0, HOLLOW));
  for (const [x, z, r, sy] of [
    [-0.14, 0.02, 0.16, 0.42],
    [0.12, -0.04, 0.14, 0.38],
    [0.02, 0.08, 0.1, 0.5],
  ] as const) {
    const heap = new SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    heap.scale(1, sy, 1);
    heap.translate(x, H, z);
    parts.push(tint(heap, GOLD));
  }
  const bodyGeo = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  const body = new Mesh(bodyGeo, sharedMaterial);
  body.castShadow = true;
  body.receiveShadow = true;

  const lidParts: BufferGeometry[] = [
    lidShell(LID_R, W, 0, WOOD),
    lidShell(LID_R + 0.012, 0.06, -W / 2 + 0.12, IRON),
    lidShell(LID_R + 0.012, 0.06, W / 2 - 0.12, IRON),
    box(0.1, 0.08, 0.03, 0, 0.02, D + 0.01, GOLD),
  ];
  const lidGeo = mergeGeometries(lidParts)!;
  for (const p of lidParts) p.dispose();
  const lid = new Mesh(lidGeo, sharedLidMaterial);
  lid.castShadow = true;
  const hinge = new Group();
  hinge.position.set(0, H, -D / 2);
  hinge.add(lid);
  group.add(body, hinge);

  const glowMat = new SpriteNodeMaterial({
    map: glowTexture(),
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const glow = new Sprite(glowMat);
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
      lidGeo.dispose();
      glowMat.dispose();
      group.removeFromParent();
    },
  };
}
