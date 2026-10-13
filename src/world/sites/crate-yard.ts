import {
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardNodeMaterial,
  SRGBColorSpace,
  Vector3,
  type Material,
} from 'three/webgpu';
import { sharedInstancedMesh } from '../../engine/instancing';
import type { TierSettings } from '../../engine/quality';
import type { CircleObstacle } from '../contracts';
import { unreflected } from '../reflection';
import type { VillageAnchor, VillageBoxCollider, VillageKit } from '../village/kit';
import { UvQuadBuilder, box, cylinder, merge, poseFrame, type UvRect } from './geo';
import { plateAt, type YardLayout } from './crate-yard-logic';
import { InstanceProxies } from './proxies';
import { mergeWithRigidParts } from './rigid-parts';
import { palettedMaterial } from '../characters/stage-light';

/** Metres per yard cell (a crate is 1.1 m, so there's room to walk between them). */
export const YARD_CELL = 1.5;
const CRATE = 1.1;

export interface CrateYardSite {
  readonly group: Group;
  readonly colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] };
  /** One moving circle per crate, updated in place as they slide (for the walker). */
  readonly crateCircles: readonly CircleObstacle[];
  /** `crateLever` (stand here, facing the reset lever). */
  readonly anchors: Record<string, VillageAnchor>;
  readonly top: number;
  /** World centre of a cell. */
  cellCenter(x: number, z: number): { x: number; z: number };
  /** The cell a world point is in, or null outside the yard. */
  cellAt(x: number, z: number): [number, number] | null;
  /** The yard's own axes: which grid direction a world heading faces most. */
  facing(heading: number): 'n' | 's' | 'e' | 'w';
  /** Moves crate `i` to a cell (slides unless `snap`). */
  setCrate(i: number, cell: readonly [number, number], snap?: boolean): void;
  /** A refused push: the crate rocks and settles back. */
  wobble(i: number): void;
  /** Lights the plates under crates that are home. */
  setHome(home: readonly boolean[]): void;
  /** Highlights a crate (Wingman's hint), or -1 for none. */
  setHint(i: number): void;
  setLever(pulled: boolean): void;
  readonly sliding: boolean;
  update(dt: number, t: number): void;
  dispose(): void;
}

/**
 * The crate yard on the shipyard apron (P1.1): a paved grid with three Chat plates (a speech bubble,
 * tavern side) and three Project plates (a folder, slipway side), a tall sign over each row, six
 * wooden crates stencilled with their task on every face, and a reset lever by the gate. The crates
 * carry no hint of which plate they belong on.
 */
export function createCrateYardSite(o: {
  tier: TierSettings;
  kit: VillageKit;
  /** The yard's centre, standing height, and facing (+z local runs from the gate into the yard). */
  origin: VillageAnchor;
  layout: YardLayout;
}): CrateYardSite {
  const { layout } = o;
  const group = new Group();
  group.name = 'crate yard (P1.1)';
  // A Meridian site, so never in the Anchorage harbour mirror: leaving it out spares the mirror's
  // copies of its shaders (PLAN §15.4).
  unreflected.add(group);
  const frame = poseFrame({ x: o.origin.x, z: o.origin.z, rot: o.origin.heading });
  const top = o.origin.y;
  // Local cell centres: x across (column 0, the chat plates, on local +x: the town side when the yard
  // faces east), z from the far row (−z) to the gate.
  const SX = -1;
  const local = (x: number, z: number) => ({
    x: SX * (x - (layout.cols - 1) / 2) * YARD_CELL,
    z: (z - (layout.rows - 1) / 2) * YARD_CELL,
  });
  const cellCenter = (x: number, z: number) => {
    const l = local(x, z);
    return frame.toWorld(l.x, l.z);
  };
  const c = Math.cos(o.origin.heading),
    s = Math.sin(o.origin.heading);
  const toLocal = (wx: number, wz: number) => {
    const dx = wx - o.origin.x,
      dz = wz - o.origin.z;
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  };

  const atlas = createYardAtlas(layout);
  const materials: Record<'wood' | 'stone' | 'metal', Material> = {
    wood: o.kit.materials.wood,
    stone: o.kit.materials.paving,
    metal: o.kit.materials.metal,
  };

  // The paved floor, a low kerb round three sides, posts and a rope along the kerb.
  const w = layout.cols * YARD_CELL,
    d = layout.rows * YARD_CELL;
  const floorParts = [box(w + 0.6, 0.06, d + 0.6, { y: -0.04 }, 0xb59b72)];
  const kerb: ReturnType<typeof box>[] = [];
  kerb.push(box(w + 1.2, 0.22, 0.3, { z: -d / 2 - 0.45, y: -0.04 }, 0x8f7f63));
  kerb.push(box(0.3, 0.22, d + 1.2, { x: -w / 2 - 0.45, y: -0.04 }, 0x8f7f63));
  kerb.push(box(0.3, 0.22, d + 1.2, { x: w / 2 + 0.45, y: -0.04 }, 0x8f7f63));
  const floor = new Mesh(merge([...floorParts, ...kerb]), materials.stone);
  floor.name = 'crate yard floor';
  floor.receiveShadow = true;
  const yard = new Group();
  yard.position.set(o.origin.x, top, o.origin.z);
  yard.rotation.y = o.origin.heading;
  yard.add(floor);
  group.add(yard);

  // Plates: raised slabs with the Chat or Project emblem, lit when a crate's home.
  const plateQuads = new UvQuadBuilder(1024, 1024);
  const plateCells: { cell: [number, number]; kind: 'chat' | 'project' }[] = [];
  for (const [x, z] of layout.chatPlates) plateCells.push({ cell: [x, z], kind: 'chat' });
  for (const [x, z] of layout.projectPlates) plateCells.push({ cell: [x, z], kind: 'project' });
  const plateParts = plateCells.map(({ cell, kind }) => {
    const l = local(cell[0], cell[1]);
    plateQuads.plane(
      new Vector3(l.x, 0.075, l.z),
      new Vector3(0.62, 0, 0),
      new Vector3(0, 0, -0.62),
      atlas.rects[kind === 'chat' ? 'chatPlate' : 'projectPlate'],
    );
    return box(1.36, 0.07, 1.36, { x: l.x, z: l.z }, kind === 'chat' ? 0x1f4e86 : 0x2c6b3c);
  });
  const plates = new Mesh(merge(plateParts), materials.stone);
  plates.name = 'crate yard plates';
  plates.receiveShadow = true;
  yard.add(plates);
  // One glow per plate, shown when its crate is home.
  const glowMat = atlas.glow;
  const glows = plateCells.map(({ cell }) => {
    const l = local(cell[0], cell[1]);
    const g = new Mesh(merge([box(1.44, 0.02, 1.44, { x: l.x, y: 0.071, z: l.z }, 0xffffff)]), glowMat);
    g.visible = false;
    yard.add(g);
    return g;
  });

  // Tall signs over each side (readable from across the yard): what each plate is for.
  const signQuads = new UvQuadBuilder(1024, 1024);
  const signParts: ReturnType<typeof box>[] = [];
  const sideSign = (side: -1 | 1, rect: UvRect) => {
    const x = side * (w / 2 + 0.9);
    for (const dz of [-1.6, 1.6]) signParts.push(cylinder(0.09, 0.09, 2.7, { x, z: dz }, 0x5a3b22, 8));
    signParts.push(box(0.12, 1.3, 3.5, { x, y: 1.35 }, 0x6d4a2c));
    const face = new Vector3(x - side * 0.075, 2.0, 0);
    // The board faces into the yard.
    signQuads.plane(face, new Vector3(0, 0, side * 1.62), new Vector3(0, 0.6, 0), rect);
  };
  sideSign(-SX as -1 | 1, atlas.rects.chatSign);
  sideSign(SX as -1 | 1, atlas.rects.projectSign);
  // The reset lever by the gate (local +z side, at the tavern end).
  const lever = { x: -w / 2 + 0.4, z: d / 2 + 1.1 };
  signParts.push(box(0.5, 0.5, 0.5, { x: lever.x, z: lever.z }, 0x5d4a38));
  signParts.push(box(1.2, 0.06, 0.02, { x: lever.x + 0.9, y: 1.18, z: lever.z }, 0x3a2716));
  signQuads.plane(
    new Vector3(lever.x + 0.9, 1.0, lever.z + 0.02),
    new Vector3(0.6, 0, 0),
    new Vector3(0, 0.18, 0),
    atlas.rects.resetSign,
  );
  signParts.push(cylinder(0.05, 0.05, 1.3, { x: lever.x + 0.9, z: lever.z - 0.05 }, 0x5a3b22, 6));
  const signs = new Mesh(merge(signParts), materials.wood);
  signs.name = 'crate yard signs';
  signs.castShadow = true;
  yard.add(signs);
  const handle = new Group();
  handle.position.set(lever.x, 0.5, lever.z);
  const handleMesh = new Mesh(
    merge([cylinder(0.04, 0.04, 0.8, { y: 0 }, 0x2b2b2b, 6), box(0.16, 0.16, 0.16, { y: 0.8 }, 0x8b1f1f)]),
    materials.metal,
  );
  handle.add(handleMesh);
  handle.rotation.x = -0.5;
  yard.add(handle);

  // Crates: wood with the task on every side and the top.
  const crateQuads = layout.crates.map((_, i) => {
    const q = new UvQuadBuilder(1024, 1024);
    const r = atlas.rects[`crate${i}` as AtlasKey];
    const h = CRATE / 2 + 0.005;
    const up = new Vector3(0, 0.38, 0);
    q.plane(new Vector3(0, CRATE / 2, h), new Vector3(0.48, 0, 0), up, r);
    q.plane(new Vector3(0, CRATE / 2, -h), new Vector3(-0.48, 0, 0), up, r);
    q.plane(new Vector3(h, CRATE / 2, 0), new Vector3(0, 0, -0.48), up, r);
    q.plane(new Vector3(-h, CRATE / 2, 0), new Vector3(0, 0, 0.48), up, r);
    q.plane(new Vector3(0, CRATE + 0.005, 0), new Vector3(0.48, 0, 0), new Vector3(0, 0, -0.38), r);
    return q.geometry();
  });
  const crateBody = merge([
    box(CRATE, CRATE, CRATE, {}, 0x9c6c3c, 3.25, true),
    // Corner battens so it reads as a crate, not a block.
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) =>
        box(
          0.1,
          CRATE + 0.02,
          0.1,
          { x: (sx * CRATE) / 2, z: (sz * CRATE) / 2, y: -0.01 },
          0x6a4524,
          3.25,
          true,
        ),
      ),
    ),
  ]);
  // Each crate is a placeholder group: the bodies draw as one instanced mesh, and the stencils join
  // the emblems and sign faces in one mesh (a crate's stencils follow it as it slides or rocks).
  const crates = layout.crates.map(() => {
    const g = new Group();
    yard.add(g);
    return { group: g, from: new Vector3(), to: new Vector3(), t: 1, wobble: 0, moved: true };
  });
  const bodies = sharedInstancedMesh(crateBody, materials.wood, crates.length);
  bodies.name = 'crate yard crates';
  bodies.castShadow = bodies.receiveShadow = true;
  yard.add(bodies);
  const crateProxies = new InstanceProxies(
    bodies,
    crates.map((k) => k.group),
  );
  const lettering = mergeWithRigidParts([plateQuads.geometry(), signQuads.geometry()], crateQuads, {
    bounds: true,
  });
  const letters = new Mesh(lettering.geometry, atlas.material);
  letters.name = 'crate yard lettering';
  yard.add(letters);
  const placeCrates = () => {
    let any = false;
    crates.forEach((k, i) => {
      if (!k.moved) return;
      k.moved = false;
      k.group.updateMatrix();
      lettering.set(i, k.group.matrix);
      any = true;
    });
    if (!any) return;
    lettering.commit();
    crateProxies.update();
  };
  placeCrates();
  const crateCircles: CircleObstacle[] = layout.crates.map(() => ({
    x: 0,
    z: 0,
    r: 0.72,
    height: CRATE + 0.2,
  }));
  const hint = new Mesh(merge([box(1.3, 0.02, 1.3, {}, 0xffffff)]), atlas.hint);
  hint.visible = false;
  yard.add(hint);

  const setCircle = (i: number) => {
    const p = crates[i]!.group.position;
    const wpt = frame.toWorld(p.x, p.z);
    crateCircles[i]!.x = wpt.x;
    crateCircles[i]!.z = wpt.z;
  };
  let hintIndex = -1;

  const leverWorld = frame.toWorld(lever.x + 0.9, lever.z + 1.2);
  const signBoxes: VillageBoxCollider[] = [-1, 1].map((side) => {
    const p = frame.toWorld(side * (w / 2 + 0.9), 0);
    return { x: p.x, z: p.z, hx: 0.2, hz: 1.8, rot: o.origin.heading, height: 2.7 };
  });
  const leverBase = frame.toWorld(lever.x, lever.z);
  const colliders = { circles: [{ x: leverBase.x, z: leverBase.z, r: 0.4 }], boxes: signBoxes };

  return {
    group,
    colliders,
    crateCircles,
    anchors: {
      crateLever: { x: leverWorld.x, y: top, z: leverWorld.z, heading: o.origin.heading + Math.PI },
    },
    top,
    cellCenter,
    cellAt(x, z) {
      const l = toLocal(x, z);
      const i = Math.round((SX * l.x) / YARD_CELL + (layout.cols - 1) / 2);
      const j = Math.round(l.z / YARD_CELL + (layout.rows - 1) / 2);
      return i >= 0 && j >= 0 && i < layout.cols && j < layout.rows ? [i, j] : null;
    },
    facing(heading) {
      // Local forward of a world heading: yard +x is east ('e'), −z is north ('n').
      const a = heading - o.origin.heading;
      const fx = Math.sin(a),
        fz = Math.cos(a);
      if (Math.abs(fx) > Math.abs(fz)) return SX * fx > 0 ? 'e' : 'w';
      return fz > 0 ? 's' : 'n';
    },
    setCrate(i, cell, snap = false) {
      const k = crates[i]!;
      const l = local(cell[0], cell[1]);
      k.from.copy(k.group.position);
      k.to.set(l.x, 0, l.z);
      k.t = snap ? 1 : 0;
      if (snap) {
        k.group.position.copy(k.to);
        k.moved = true;
        placeCrates();
      }
      setCircle(i);
      // The circle moves at once: the walker can't slip into the cell the crate's sliding to.
      const wpt = frame.toWorld(l.x, l.z);
      crateCircles[i]!.x = wpt.x;
      crateCircles[i]!.z = wpt.z;
      if (hintIndex === i) hint.position.set(l.x, 0.075, l.z);
    },
    wobble(i) {
      crates[i]!.wobble = 1;
    },
    setHome(home) {
      plateCells.forEach((p, j) => {
        const on = layout.crates.findIndex((_, i) => {
          const g = crates[i]!.to;
          const l = local(p.cell[0], p.cell[1]);
          return Math.abs(g.x - l.x) < 0.01 && Math.abs(g.z - l.z) < 0.01 && home[i];
        });
        glows[j]!.visible = on >= 0 && plateAt(layout, p.cell[0], p.cell[1]) !== null;
      });
    },
    setHint(i) {
      hintIndex = i;
      hint.visible = i >= 0;
      if (i >= 0) {
        const p = crates[i]!.to;
        hint.position.set(p.x, 0.075, p.z);
      }
    },
    setLever(pulled) {
      handle.rotation.x = pulled ? 0.5 : -0.5;
    },
    get sliding() {
      return crates.some((k) => k.t < 1);
    },
    update(dt, t) {
      for (const k of crates) {
        if (k.t < 1) {
          k.t = Math.min(1, k.t + dt / 0.28);
          const e = k.t * k.t * (3 - 2 * k.t);
          k.group.position.lerpVectors(k.from, k.to, e);
          k.moved = true;
        }
        if (k.wobble > 0) {
          k.wobble = Math.max(0, k.wobble - dt * 2.4);
          k.group.rotation.z = Math.sin(t * 38) * 0.06 * k.wobble;
          k.moved = true;
        } else if (k.group.rotation.z !== 0) {
          k.group.rotation.z = 0;
          k.moved = true;
        }
      }
      placeCrates();
      if (hint.visible) (atlas.hint as MeshStandardNodeMaterial).opacity = 0.35 + 0.25 * Math.sin(t * 4);
    },
    dispose() {
      unreflected.delete(group);
      floor.geometry.dispose();
      plates.geometry.dispose();
      for (const g of glows) g.geometry.dispose();
      signs.geometry.dispose();
      lettering.geometry.dispose();
      bodies.dispose();
      handleMesh.geometry.dispose();
      crateBody.dispose();
      hint.geometry.dispose();
      atlas.dispose();
      group.clear();
    },
  };
}

type AtlasKey =
  'chatPlate' | 'projectPlate' | 'chatSign' | 'projectSign' | 'resetSign' | `crate${0 | 1 | 2 | 3 | 4 | 5}`;

interface YardAtlas {
  material: MeshStandardNodeMaterial;
  glow: MeshStandardNodeMaterial;
  hint: MeshStandardNodeMaterial;
  rects: Record<AtlasKey, UvRect>;
  dispose(): void;
}

/**
 * One canvas for the yard's words and emblems: the six crate stencils (dark on pale wood), the two
 * plate emblems (the app's speech bubble and folder), the two side signs, and the reset plaque.
 */
function createYardAtlas(layout: YardLayout): YardAtlas {
  const rects: Record<AtlasKey, UvRect> = {
    crate0: { x: 0, y: 0, w: 340, h: 272 },
    crate1: { x: 342, y: 0, w: 340, h: 272 },
    crate2: { x: 684, y: 0, w: 340, h: 272 },
    crate3: { x: 0, y: 274, w: 340, h: 272 },
    crate4: { x: 342, y: 274, w: 340, h: 272 },
    crate5: { x: 684, y: 274, w: 340, h: 272 },
    chatPlate: { x: 0, y: 548, w: 256, h: 256 },
    projectPlate: { x: 258, y: 548, w: 256, h: 256 },
    resetSign: { x: 516, y: 548, w: 508, h: 150 },
    chatSign: { x: 0, y: 806, w: 510, h: 218 },
    projectSign: { x: 514, y: 806, w: 510, h: 218 },
  };
  const tex = new CanvasTexture(
    typeof document === 'undefined' ? undefined : document.createElement('canvas'),
  );
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  const canvas = tex.image as HTMLCanvasElement | undefined;
  if (canvas) {
    canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    layout.crates.forEach((crate, i) => stencil(ctx, rects[`crate${i}` as AtlasKey], crate.label));
    emblem(ctx, rects.chatPlate, 'chat');
    emblem(ctx, rects.projectPlate, 'project');
    signBoard(ctx, rects.chatSign, 'CHAT', 'Questions · ideas · summaries', '#1f4e86', 'chat');
    signBoard(ctx, rects.projectSign, 'PROJECT', 'Changes to your repository', '#2c6b3c', 'project');
    signBoard(ctx, rects.resetSign, 'RESET THE YARD', '', '#6d3a1f', null);
    tex.needsUpdate = true;
  }
  // The atlas as a palette, like the other painted signs: their shadows share one plain shader.
  const material = palettedMaterial(
    new MeshStandardNodeMaterial({
      map: tex,
      roughness: 0.82,
      metalness: 0,
      side: DoubleSide,
    }),
  );
  const glow = new MeshStandardNodeMaterial({
    color: 0xffd36b,
    emissive: 0xffb43a,
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const hint = new MeshStandardNodeMaterial({
    color: 0x9fe8ff,
    emissive: 0x4fd0ff,
    emissiveIntensity: 1,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  return {
    material,
    glow,
    hint,
    rects,
    dispose() {
      tex.dispose();
      material.dispose();
      glow.dispose();
      hint.dispose();
    },
  };
}

function stencil(ctx: CanvasRenderingContext2D, r: UvRect, lines: readonly [string, string]): void {
  const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  g.addColorStop(0, '#e2c08c');
  g.addColorStop(1, '#cfa76c');
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#5b3216';
  ctx.lineWidth = 10;
  ctx.strokeRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16);
  ctx.fillStyle = '#2a170a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [k, text] of lines.entries()) {
    let size = 64;
    ctx.font = `700 ${size}px Georgia, 'Times New Roman', serif`;
    while (size > 30 && ctx.measureText(text).width > r.w - 40) {
      size -= 4;
      ctx.font = `700 ${size}px Georgia, 'Times New Roman', serif`;
    }
    ctx.fillText(text, r.x + r.w / 2, r.y + r.h * (k === 0 ? 0.36 : 0.66));
  }
}

/** The app's icons, drawn simply: a speech bubble for Chat, a folder for Project. */
function drawIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  kind: 'chat' | 'project',
): void {
  ctx.lineWidth = s * 0.09;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (kind === 'chat') {
    ctx.ellipse(cx, cy - s * 0.05, s * 0.42, s * 0.34, 0, 0, Math.PI * 2);
    ctx.moveTo(cx - s * 0.22, cy + s * 0.22);
    ctx.lineTo(cx - s * 0.34, cy + s * 0.42);
    ctx.lineTo(cx - s * 0.02, cy + s * 0.27);
  } else {
    ctx.moveTo(cx - s * 0.42, cy - s * 0.26);
    ctx.lineTo(cx - s * 0.12, cy - s * 0.26);
    ctx.lineTo(cx - s * 0.04, cy - s * 0.16);
    ctx.lineTo(cx + s * 0.42, cy - s * 0.16);
    ctx.lineTo(cx + s * 0.42, cy + s * 0.3);
    ctx.lineTo(cx - s * 0.42, cy + s * 0.3);
    ctx.closePath();
  }
  ctx.stroke();
}

function emblem(ctx: CanvasRenderingContext2D, r: UvRect, kind: 'chat' | 'project'): void {
  ctx.fillStyle = kind === 'chat' ? '#1f4e86' : '#2c6b3c';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#f4ead2';
  drawIcon(ctx, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.8, kind);
}

function signBoard(
  ctx: CanvasRenderingContext2D,
  r: UvRect,
  title: string,
  sub: string,
  colour: string,
  icon: 'chat' | 'project' | null,
): void {
  ctx.fillStyle = colour;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#e9c77f';
  ctx.lineWidth = 8;
  ctx.strokeRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16);
  ctx.fillStyle = '#fbf2dc';
  ctx.strokeStyle = '#fbf2dc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const iconW = icon ? r.h * 0.6 : 0;
  if (icon) drawIcon(ctx, r.x + 20 + iconW / 2, r.y + r.h * (sub ? 0.36 : 0.5), iconW, icon);
  const cx = r.x + (r.w + iconW) / 2 + (icon ? 6 : 0);
  ctx.font = `700 ${sub ? 64 : 58}px Georgia, 'Times New Roman', serif`;
  ctx.fillText(title, cx, r.y + r.h * (sub ? 0.36 : 0.52));
  if (sub) {
    let size = 34;
    ctx.font = `600 ${size}px Georgia, 'Times New Roman', serif`;
    while (size > 20 && ctx.measureText(sub).width > r.w - iconW - 40) {
      size -= 2;
      ctx.font = `600 ${size}px Georgia, 'Times New Roman', serif`;
    }
    ctx.fillText(sub, r.x + r.w / 2, r.y + r.h * 0.74);
  }
}
