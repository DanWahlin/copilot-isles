import {
  BufferAttribute,
  BufferGeometry,
  LOD,
  Matrix4,
  Mesh,
  MeshStandardNodeMaterial,
  Quaternion,
  Euler,
  Vector3,
  type Object3D,
} from 'three/webgpu';
import {
  attribute,
  bumpMap,
  cameraPosition,
  color,
  float,
  mix,
  positionWorld,
  saturate,
  smoothstep,
  texture as textureNode,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type { Tier } from '../contracts';
import { world } from '../uniforms';
import { clamp01, smoothstep as smooth } from '../../util/math';
import { ROCK_ASSETS } from './rock-assets';
import { terrainNoiseTexture } from './noise-texture';
import {
  SEA_STACK_BASE_Y,
  SEA_STACK_CAP_RISE,
  seaStackCenterAt,
  seaStackGroove,
  seaStackRadius,
  seaStackRimHeight,
  seaStackWaterlineRadius,
} from './sea-stack-shape';
import { COVE } from '../layout';
import { terrainTexture } from './terrain-material';

// TSL's fluent typings don't cover every mixed scalar/vector graph used here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

const TAU = Math.PI * 2;

/** Mesh resolution per tier: columns around, side rows, and dome rings. */
interface StackDetail {
  columns: number;
  rows: number;
  rings: number;
  blocks: number;
}

const DETAIL: Record<Tier, StackDetail> = {
  lite: { columns: 48, rows: 30, rings: 3, blocks: 0 },
  low: { columns: 64, rows: 40, rings: 4, blocks: 3 },
  medium: { columns: 88, rows: 56, rings: 5, blocks: 4 },
  high: { columns: 112, rows: 72, rings: 6, blocks: 5 },
  ultra: { columns: 128, rows: 84, rings: 6, blocks: 5 },
};
/** Past this distance every tier draws the coarse mesh (the stack is a few dozen pixels tall there). */
const FAR_DISTANCE = 230;
const FAR_DETAIL: StackDetail = { columns: 48, rows: 30, rings: 3, blocks: 0 };

/**
 * Fallen limestone blocks at the foot (angle, distance past the waterline, scale, yaw, asset).
 * Angles keep clear of u = 0 so a block never straddles the texture seam.
 */
const BLOCKS = [
  { a: 0.95, out: 1.6, s: 3.4, yaw: 0.4, asset: 2 },
  { a: 3.3, out: 2.4, s: 2.7, yaw: 1.9, asset: 0 },
  { a: 5.2, out: 1.2, s: 3.0, yaw: 2.8, asset: 1 },
  { a: 2.15, out: 3.1, s: 2.2, yaw: 0.9, asset: 1 },
  { a: 4.15, out: 2.0, s: 2.5, yaw: 4.1, asset: 2 },
] as const;

/**
 * Builds the pillar: a lathe-like grid around the leaning axis (sides, then dome rings, then a centre
 * vertex) plus a few fallen blocks. Per-vertex `karst` = (cavity AO, run-off flow, moss, flute depth)
 * is baked here from the same shape functions, so the shader only adds per-pixel detail.
 */
export function buildSeaStackGeometry(detail: StackDetail): BufferGeometry {
  const { columns, rows, rings } = detail;
  const stride = columns + 1;
  const sideRows = rows + 1;
  const totalRows = sideRows + rings;
  const vertexCount = totalRows * stride + 1;
  const pos = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const karst = new Float32Array(vertexCount * 4);
  const centre = { x: 0, z: 0 };
  const top = seaStackCenterAt(COVE.seaStack.height, { x: 0, z: 0 });
  let rimSum = 0;

  for (let i = 0; i <= columns; i++) {
    const a = ((i % columns) / columns) * TAU;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const rim = seaStackRimHeight(a);
    rimSum += i < columns ? rim : 0;
    for (let j = 0; j <= rows; j++) {
      const y = SEA_STACK_BASE_Y + (rim - SEA_STACK_BASE_Y) * (j / rows);
      seaStackCenterAt(y, centre);
      const r = seaStackRadius(y, a);
      const v = j * stride + i;
      pos[v * 3] = centre.x + ca * r;
      pos[v * 3 + 1] = y;
      pos[v * 3 + 2] = centre.z + sa * r;
      uvs[v * 2] = i / columns;
      uvs[v * 2 + 1] = y;
    }
    const rimV = rows * stride + i;
    const rx = pos[rimV * 3]! - top.x;
    const rz = pos[rimV * 3 + 2]! - top.z;
    for (let k = 1; k <= rings; k++) {
      const theta = (k / (rings + 1)) * Math.PI * 0.5;
      const s = Math.cos(theta);
      const v = (sideRows + k - 1) * stride + i;
      pos[v * 3] = top.x + rx * s;
      pos[v * 3 + 1] = rim + SEA_STACK_CAP_RISE * Math.sin(theta);
      pos[v * 3 + 2] = top.z + rz * s;
      uvs[v * 2] = i / columns;
      uvs[v * 2 + 1] = pos[v * 3 + 1]!;
    }
  }
  const apex = totalRows * stride;
  pos[apex * 3] = top.x;
  pos[apex * 3 + 1] = rimSum / columns + SEA_STACK_CAP_RISE;
  pos[apex * 3 + 2] = top.z;
  uvs[apex * 2] = 0.5;
  uvs[apex * 2 + 1] = pos[apex * 3 + 1]!;

  const indices: number[] = [];
  for (let j = 0; j < totalRows - 1; j++) {
    for (let i = 0; i < columns; i++) {
      const a = j * stride + i;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const lastRow = (totalRows - 1) * stride;
  for (let i = 0; i < columns; i++) indices.push(lastRow + i, apex, lastRow + i + 1);

  const ledge = new Float32Array(vertexCount);
  // Cavity AO and run-off: look up each column for overhangs (the visor over the notch, bedding lips).
  for (let i = 0; i <= columns; i++) {
    const a = ((i % columns) / columns) * TAU;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    let flow = 1;
    for (let j = rows; j >= 0; j--) {
      const v = j * stride + i;
      const y = pos[v * 3 + 1]!;
      let occ = 0;
      let lip = 0;
      for (let k = j + 1; k <= rows; k++) {
        const w = k * stride + i;
        const dy = pos[w * 3 + 1]! - y;
        if (dy > 16) break;
        const e = (pos[w * 3]! - pos[v * 3]!) * ca + (pos[w * 3 + 2]! - pos[v * 3 + 2]!) * sa;
        const o = e / dy;
        if (o > occ) occ = o;
        if (dy < 2.6 && o > lip) lip = o;
      }
      let shelf = 0;
      if (j < rows) {
        const w = v + stride;
        const dy = pos[w * 3 + 1]! - y;
        const e = (pos[w * 3]! - pos[v * 3]!) * ca + (pos[w * 3 + 2]! - pos[v * 3 + 2]!) * sa;
        shelf = smooth(0.4, 1.4, -e / Math.max(0.01, dy));
      }
      const dy = j < rows ? pos[(v + stride) * 3 + 1]! - y : 0;
      flow = Math.max(flow * Math.exp(-dy / 10), smooth(0.2, 0.75, lip), shelf * 0.8);
      const groove = seaStackGroove(a, y);
      let ao = 1 - 0.62 * smooth(0.06, 0.95, occ);
      ao *= 1 - 0.3 * groove;
      ao *= 1 - 0.35 * smooth(0, -6, y);
      karst[v * 4] = clamp01(ao);
      karst[v * 4 + 1] = clamp01(flow) * smooth(1.5, 4.5, y);
      karst[v * 4 + 3] = groove;
      ledge[v] = shelf;
    }
    for (let k = 1; k <= rings; k++) {
      const v = (sideRows + k - 1) * stride + i;
      karst[v * 4] = 0.88;
      karst[v * 4 + 1] = 0;
      karst[v * 4 + 3] = 0;
    }
  }
  karst[apex * 4] = 0.88;

  let geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setAttribute('karst', new BufferAttribute(karst, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // Weld the seam's lighting: column 0 and column `columns` are the same points.
  const normal = geometry.getAttribute('normal') as BufferAttribute;
  const n = normal.array as Float32Array;
  for (let j = 0; j < totalRows; j++) {
    const a = j * stride;
    const b = a + columns;
    for (let c = 0; c < 3; c++) {
      const m = (n[a * 3 + c]! + n[b * 3 + c]!) * 0.5;
      n[a * 3 + c] = m;
      n[b * 3 + c] = m;
    }
  }
  // Moss on up-facing ledges, bedding steps and the dome.
  for (let v = 0; v < vertexCount; v++) {
    const ny = n[v * 3 + 1]! / Math.max(1e-6, Math.hypot(n[v * 3]!, n[v * 3 + 1]!, n[v * 3 + 2]!));
    const y = pos[v * 3 + 1]!;
    // Soil and moss also spill over the lip of each shelf, so a ledge reads from straight on.
    karst[v * 4 + 2] = Math.max(smooth(0.42, 0.8, ny), ledge[v]! * 0.85) * smooth(4, 8.5, y);
  }

  if (detail.blocks > 0) geometry = mergeBlocks(geometry, detail.blocks);
  geometry.computeBoundingSphere();
  return geometry;
}

function mergeBlocks(stack: BufferGeometry, count: number): BufferGeometry {
  const parts: { pos: Float32Array; nrm: Float32Array; idx: ArrayLike<number> }[] = [];
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const p = new Vector3();
  const sc = new Vector3();
  const nm = new Matrix4();
  const v = new Vector3();
  for (let b = 0; b < Math.min(count, BLOCKS.length); b++) {
    const block = BLOCKS[b]!;
    const asset = ROCK_ASSETS[block.asset]!;
    const r = seaStackWaterlineRadius(block.a) + block.out;
    p.set(
      COVE.seaStack.x + Math.cos(block.a) * r,
      -0.9 + block.s * 0.12,
      COVE.seaStack.z + Math.sin(block.a) * r,
    );
    e.set(0.15 * Math.sin(b * 2.1), block.yaw, 0.2 * Math.cos(b * 1.7), 'YXZ');
    q.setFromEuler(e);
    sc.set(block.s * 1.25, block.s * 0.8, block.s);
    m.compose(p, q, sc);
    nm.extractRotation(m);
    const count3 = asset.positions.length / 3;
    const pos = new Float32Array(count3 * 3);
    const nrm = new Float32Array(count3 * 3);
    for (let i = 0; i < count3; i++) {
      v.fromArray(asset.positions, i * 3)
        .applyMatrix4(m)
        .toArray(pos, i * 3);
      v.fromArray(asset.normals, i * 3)
        .applyMatrix4(nm)
        .normalize()
        .toArray(nrm, i * 3);
    }
    parts.push({ pos, nrm, idx: asset.indices });
  }

  const basePos = stack.getAttribute('position').array as Float32Array;
  const baseNrm = stack.getAttribute('normal').array as Float32Array;
  const baseUv = stack.getAttribute('uv').array as Float32Array;
  const baseKarst = stack.getAttribute('karst').array as Float32Array;
  const baseIdx = stack.getIndex()!.array;
  const baseCount = basePos.length / 3;
  const extra = parts.reduce((s, part) => s + part.pos.length / 3, 0);
  const total = baseCount + extra;
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  const karst = new Float32Array(total * 4);
  pos.set(basePos);
  nrm.set(baseNrm);
  uvs.set(baseUv);
  karst.set(baseKarst);
  const idx = Array.from(baseIdx);
  let offset = baseCount;
  for (const part of parts) {
    const n = part.pos.length / 3;
    pos.set(part.pos, offset * 3);
    nrm.set(part.nrm, offset * 3);
    for (let i = 0; i < n; i++) {
      const x = part.pos[i * 3]! - COVE.seaStack.x;
      const y = part.pos[i * 3 + 1]!;
      const z = part.pos[i * 3 + 2]! - COVE.seaStack.z;
      const a = Math.atan2(z, x);
      uvs[(offset + i) * 2] = (a < 0 ? a + TAU : a) / TAU;
      uvs[(offset + i) * 2 + 1] = y;
      karst[(offset + i) * 4] = 0.62 + 0.3 * smooth(-1.5, 1.5, y) * clamp01(part.nrm[i * 3 + 1]! + 0.6);
      karst[(offset + i) * 4 + 1] = 0.15;
      karst[(offset + i) * 4 + 2] = 0;
      karst[(offset + i) * 4 + 3] = 0.2;
    }
    for (let i = 0; i < part.idx.length; i++) idx.push(part.idx[i]! + offset);
    offset += n;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new BufferAttribute(nrm, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setAttribute('karst', new BufferAttribute(karst, 4));
  geometry.setIndex(idx);
  stack.dispose();
  return geometry;
}

/**
 * Limestone karst material: pale grey-cream stone, dark rain/algae streaks and rust stains running down
 * from every lip, a wet band and a barnacle line at the waterline, green-brown weed below it, and moss
 * on the ledges and the dome. All masks come from the baked `karst` attribute and two tileable-noise
 * samples stretched along the pillar (u = around, y = up), so it costs about the same as the rock
 * material. Close detail (bump) is Medium and up only.
 */
export function createSeaStackMaterial(
  tier: Tier,
  opts: { worldY?: AnyNode; miniature?: boolean } = {},
): MeshStandardNodeMaterial {
  const detail = tier === 'lite' ? 0 : tier === 'low' ? 1 : 2;
  const material = new MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  material.name = 'sea-stack-karst';
  const k = attribute('karst', 'vec4') as AnyNode;
  const ao = k.x;
  const flow = k.y;
  const moss = k.z;
  const u = uv().x;
  // The rock's true height (the opening chart's miniature passes it; the mesh there is tiny).
  const y = (opts.worldY ?? positionWorld.y) as AnyNode;
  const noise = terrainNoiseTexture();
  const streakA = textureNode(noise, vec2(u.mul(13), y.mul(0.0085))) as AnyNode;
  const streakB = textureNode(noise, vec2(u.mul(31), y.mul(0.022).add(0.37))) as AnyNode;
  const patch = textureNode(noise, vec2(u.mul(4), y.mul(0.028).add(0.61))) as AnyNode;

  // Pale grey-cream limestone, mottled with cooler grey weathering.
  // Rock grain from the shared cliff texture (Medium and up), mapped around the pillar.
  const grain =
    detail >= 1
      ? (textureNode(terrainTexture('rocks.webp'), vec2(u.mul(9), y.mul(0.11))) as AnyNode).rgb.dot(
          vec3(0.32, 0.43, 0.25),
        )
      : float(0.5);
  const tone = patch.r.mul(0.5).add(streakA.b.mul(0.3)).add(grain.mul(0.35)).sub(0.08);
  let base: AnyNode = mix(color(0x9a8d78), color(0xddc9a4), smoothstep(0.3, 0.72, tone));
  base = mix(base, color(0x857d70), smoothstep(0.5, 0.74, patch.g).mul(0.5));
  // Rust-orange iron stains in broad bands down the upper faces.
  const rust = smoothstep(0.5, 0.74, streakA.g)
    .mul(smoothstep(4, 12, y))
    .mul(float(1).sub(moss));
  base = mix(base, color(0xa8683a), rust.mul(0.55));
  // Dark rain/algae streaks: bold where water runs off a lip, thinner everywhere else.
  const stripe = smoothstep(0.46, 0.68, streakA.r.mul(0.55).add(streakB.r.mul(0.45)));
  const runs = smoothstep(0.42, 0.7, streakA.a);
  const streak = saturate(
    stripe.mul(flow.mul(0.8).add(runs.mul(0.4))).add(flow.mul(stripe.add(0.2)).mul(0.2)),
  );
  base = mix(base, color(0x2e2b25), streak.mul(0.8));
  base = base.mul(mix(float(0.5), float(1), ao));

  // Waterline: a dark wet band with a ragged top, the barnacle/algae line, green-brown weed below.
  const edge = streakB.g;
  const wet = float(1).sub(smoothstep(1.3, float(3.0).add(edge.mul(1.4)), y));
  base = base.mul(float(1).sub(wet.mul(0.42)));
  const barnacle = smoothstep(-0.6, -0.05, y).mul(
    float(1).sub(smoothstep(float(0.75).add(edge.mul(0.5)), float(1.25).add(edge.mul(0.8)), y)),
  );
  base = mix(base, color(0x4a4630), barnacle.mul(0.7));
  base = mix(base, color(0x46563a), smoothstep(-0.3, -2.8, y).mul(0.55));
  // Moss and leaf litter on ledges and the dome.
  const mossTone = mix(color(0x34491f), color(0x5e5f33), patch.b);
  base = mix(base, mossTone, moss.mul(0.9));

  material.colorNode = base;
  material.roughnessNode = float(0.93).sub(wet.mul(0.4)).sub(barnacle.mul(0.08));
  material.aoNode = ao;
  if (detail >= 2 && !opts.miniature) {
    const near = float(1).sub(smoothstep(40, 160, cameraPosition.sub(positionWorld).length()));
    const relief = grain.mul(0.7).add(streakB.r.mul(0.3)).add(k.w.mul(-0.5));
    material.normalNode = bumpMap(relief, near.mul(1.4));
  }
  // Skylight on the shaded faces by day (pale limestone in shade is still pale, not charcoal), and a
  // faint cool fill after sunset, so the shaded side reads as stone, not a black cut-out.
  material.emissiveNode = base
    .mul(
      vec3(world.skyColor.r, world.skyColor.g, world.skyColor.b)
        .mul(float(0.3).mul(float(1).sub(world.night)))
        .add(vec3(0.05, 0.055, 0.07).mul(world.night.mul(0.8).add(0.2))),
    )
    .mul(ao);
  return material;
}

function stackMesh(geometry: BufferGeometry, material: MeshStandardNodeMaterial, name: string): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

/** The sea stack: one draw (a near/far LOD on Medium and up, one coarse mesh on Low and Lite). */
export function createSeaStack(
  tier: Tier,
  material: MeshStandardNodeMaterial = createSeaStackMaterial(tier),
): Object3D {
  const near = DETAIL[tier];
  if (tier === 'lite' || tier === 'low') {
    return stackMesh(buildSeaStackGeometry(near), material, 'terrain-rocks-sea-stack');
  }
  const lod = new LOD();
  lod.name = 'terrain-rocks-sea-stack';
  lod.addLevel(stackMesh(buildSeaStackGeometry(near), material, 'terrain-rocks-sea-stack-near'), 0);
  lod.addLevel(
    stackMesh(buildSeaStackGeometry(FAR_DETAIL), material, 'terrain-rocks-sea-stack-far'),
    FAR_DISTANCE,
  );
  return lod;
}
