import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineSegments,
  Matrix4,
  Mesh,
  Vector3,
  type Material,
  type Object3D,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBuilder } from '../ship/mesh-builder';
import { halfBeamAt, keelHeightAt, sheerHeightAt } from '../ship/lines';
import { mulberry32 } from '../../util/math';

/**
 * A ship cut into pieces ahead of time (no CSG at run time): every visible part is clipped between
 * planes across her length (z = const in her own frame), triangles and lines split at the planes
 * with their attributes interpolated, and each cut is capped with a jagged face of raw planking (the
 * hull's own material and layout, so no new shader). Parts of one piece that share a material and a
 * vertex layout are merged, so a piece costs a few draws.
 *
 * Each piece's geometry stays in the ship's frame (her materials read `positionLocal`); a piece
 * turns about its `pivot` (the middle of its cut faces at the water line).
 */
export interface ShipPiece {
  /** Placed like the ship each frame (her pose), then moved apart by the scene. */
  readonly root: Group;
  /** Turns the piece about its pivot (flex, tilt), in the ship's frame. */
  readonly pivot: Group;
  /** The pivot's place in the ship's frame. */
  readonly centre: Vector3;
  /** The piece's span along the ship (ship-local z). */
  readonly z0: number;
  readonly z1: number;
  /** The piece's rigging lines (see-through: hidden once the piece goes under, or they'd show through the sea). */
  readonly lines: readonly Object3D[];
}

export interface ShipPieces {
  readonly group: Group;
  readonly pieces: readonly ShipPiece[];
  /** Triangles in all pieces. */
  readonly triangles: number;
  dispose(): void;
}

const _inv = new Matrix4();
const _rel = new Matrix4();

/**
 * Cuts `ship` (a built ship group, at any pose) at `cuts` (ship-local z, ascending) into
 * `cuts.length + 1` pieces, stern first. `capMaterial` is the hull's material (the caps are planking).
 */
export function cutShip(
  ship: Object3D,
  cuts: readonly number[],
  capMaterial: Material,
  seed = 7,
): ShipPieces {
  ship.updateMatrixWorld(true);
  _inv.copy(ship.matrixWorld).invert();
  const bounds = [-Infinity, ...cuts, Infinity];
  const parts: { material: Material; lines: boolean; geometry: BufferGeometry; shadow: boolean }[][] = [];
  for (let k = 0; k < bounds.length - 1; k++) parts.push([]);
  ship.traverseVisible((object) => {
    const mesh = object as Mesh;
    const lines = (object as LineSegments).isLineSegments === true;
    if (!mesh.isMesh && !lines) return;
    if ((mesh as Mesh & { isInstancedMesh?: boolean }).isInstancedMesh) return;
    const material = mesh.material as Material;
    if (Array.isArray(material)) return;
    _rel.multiplyMatrices(_inv, object.matrixWorld);
    const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    source.applyMatrix4(_rel);
    for (let k = 0; k < bounds.length - 1; k++) {
      const g = lines
        ? clipLines(source, bounds[k]!, bounds[k + 1]!)
        : clipTriangles(source, bounds[k]!, bounds[k + 1]!);
      if (g) parts[k]!.push({ material, lines, geometry: g, shadow: mesh.castShadow });
    }
    source.dispose();
  });

  const rand = mulberry32(seed);
  const group = new Group();
  group.name = 'ship pieces';
  const pieces: ShipPiece[] = [];
  const owned: BufferGeometry[] = [];
  let triangles = 0;
  for (let k = 0; k < bounds.length - 1; k++) {
    const z0 = Math.max(-14, bounds[k]!);
    const z1 = Math.min(14, bounds[k + 1]!);
    // Caps on the piece's cut ends: the stern piece's bow end, the bow piece's stern end, both for a middle.
    const caps = new MeshBuilder();
    if (k > 0) addCap(caps, bounds[k]!, -1, rand);
    if (k < bounds.length - 2) addCap(caps, bounds[k + 1]!, 1, rand);
    const list = parts[k]!;
    if (caps.positions.length) {
      const indexed = caps.build();
      list.push({ material: capMaterial, lines: false, geometry: indexed.toNonIndexed(), shadow: true });
      indexed.dispose();
    }
    const pivotZ =
      k === 0 ? bounds[1]! : k === bounds.length - 2 ? bounds[k]! : (bounds[k]! + bounds[k + 1]!) / 2;
    const centre = new Vector3(0, 0.4, pivotZ);
    const root = new Group();
    root.name = `ship piece ${k}`;
    root.rotation.order = 'YXZ';
    const pivot = new Group();
    pivot.position.copy(centre);
    const inner = new Group();
    inner.position.copy(centre).negate();
    pivot.add(inner);
    root.add(pivot);
    const lines: Object3D[] = [];
    for (const merged of mergeAlike(list)) {
      const draw = merged.lines
        ? new LineSegments(merged.geometry, merged.material)
        : new Mesh(merged.geometry, merged.material);
      draw.castShadow = merged.shadow;
      draw.receiveShadow = true;
      draw.name = `piece ${k} ${merged.material.name || merged.material.type}`;
      inner.add(draw);
      if (merged.lines) lines.push(draw);
      owned.push(merged.geometry);
      if (!merged.lines) triangles += merged.geometry.getAttribute('position').count / 3;
    }
    group.add(root);
    pieces.push({ root, pivot, centre, z0, z1, lines });
  }
  return {
    group,
    pieces,
    triangles: Math.round(triangles),
    dispose() {
      for (const g of owned) g.dispose();
    },
  };
}

/** Parts of one piece that share a material, a kind and an attribute layout, merged into one. */
function mergeAlike(
  list: { material: Material; lines: boolean; geometry: BufferGeometry; shadow: boolean }[],
): { material: Material; lines: boolean; geometry: BufferGeometry; shadow: boolean }[] {
  const sets = new Map<string, typeof list>();
  for (const p of list) {
    const layout = Object.keys(p.geometry.attributes)
      .sort()
      .map((n) => {
        const a = p.geometry.getAttribute(n);
        return `${n}:${a.itemSize}:${a.array.constructor.name}`;
      })
      .join(',');
    const key = `${p.material.uuid}|${p.lines}|${layout}`;
    const set = sets.get(key) ?? [];
    set.push(p);
    sets.set(key, set);
  }
  const out: typeof list = [];
  for (const set of sets.values()) {
    if (set.length === 1) {
      out.push(set[0]!);
      continue;
    }
    const merged = mergeGeometries(
      set.map((p) => p.geometry),
      false,
    );
    if (!merged) {
      out.push(...set);
      continue;
    }
    for (const p of set) p.geometry.dispose();
    out.push({
      material: set[0]!.material,
      lines: set[0]!.lines,
      geometry: merged,
      shadow: set.some((p) => p.shadow),
    });
  }
  return out;
}

interface Attr {
  name: string;
  size: number;
  /** Where this attribute starts in a vertex row. */
  offset: number;
  /** Float data interpolates; integer data takes the nearer vertex's value. */
  lerp: boolean;
  src: BufferAttribute;
  out: number[];
}

/** A vertex while clipping: every attribute's components in one row. */
type Row = number[];

function attrsOf(g: BufferGeometry): { attrs: Attr[]; width: number; zAt: number } {
  const attrs: Attr[] = [];
  let width = 0;
  let zAt = 2;
  for (const name of Object.keys(g.attributes)) {
    const src = g.getAttribute(name) as BufferAttribute;
    if (name === 'position') zAt = width + 2;
    attrs.push({
      name,
      size: src.itemSize,
      offset: width,
      lerp: src.array instanceof Float32Array,
      src,
      out: [],
    });
    width += src.itemSize;
  }
  return { attrs, width, zAt };
}

function rowOf(attrs: Attr[], width: number, i: number): Row {
  const row: Row = new Array<number>(width);
  for (const a of attrs) for (let c = 0; c < a.size; c++) row[a.offset + c] = a.src.getComponent(i, c);
  return row;
}

function mix(attrs: Attr[], p: Row, q: Row, t: number): Row {
  const row: Row = new Array<number>(p.length);
  for (const a of attrs)
    for (let c = 0; c < a.size; c++) {
      const k = a.offset + c;
      row[k] = a.lerp ? p[k]! + (q[k]! - p[k]!) * t : t < 0.5 ? p[k]! : q[k]!;
    }
  return row;
}

function emit(attrs: Attr[], row: Row): void {
  for (const a of attrs) for (let c = 0; c < a.size; c++) a.out.push(row[a.offset + c]!);
}

function finish(attrs: Attr[]): BufferGeometry | null {
  if (!attrs[0] || attrs[0].out.length === 0) return null;
  const out = new BufferGeometry();
  for (const a of attrs) {
    const Ctor = a.src.array.constructor as new (n: number[]) => Float32Array;
    out.setAttribute(a.name, new BufferAttribute(new Ctor(a.out), a.size, a.src.normalized));
  }
  out.computeBoundingSphere();
  return out;
}

/** Sutherland–Hodgman against one plane z = at, keeping z ≥ at (`above`) or z ≤ at. */
function clipPolygon(poly: Row[], at: number, above: boolean, attrs: Attr[], zAt: number): Row[] {
  const out: Row[] = [];
  const inside = (v: Row) => (above ? v[zAt]! >= at : v[zAt]! <= at);
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i]!;
    const prev = poly[(i + poly.length - 1) % poly.length]!;
    const ci = inside(cur);
    if (ci !== inside(prev)) out.push(mix(attrs, prev, cur, (at - prev[zAt]!) / (cur[zAt]! - prev[zAt]!)));
    if (ci) out.push(cur);
  }
  return out;
}

/** Triangles of `g` (non-indexed) between lo ≤ z ≤ hi, split at the planes. */
function clipTriangles(g: BufferGeometry, lo: number, hi: number): BufferGeometry | null {
  const pos = g.getAttribute('position');
  const { attrs, width, zAt } = attrsOf(g);
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const z0 = pos.getZ(i),
      z1 = pos.getZ(i + 1),
      z2 = pos.getZ(i + 2);
    const min = Math.min(z0, z1, z2);
    const max = Math.max(z0, z1, z2);
    if (max < lo || min > hi) continue;
    let poly: Row[] = [rowOf(attrs, width, i), rowOf(attrs, width, i + 1), rowOf(attrs, width, i + 2)];
    if (min < lo) poly = clipPolygon(poly, lo, true, attrs, zAt);
    if (max > hi && poly.length) poly = clipPolygon(poly, hi, false, attrs, zAt);
    for (let k = 1; k + 1 < poly.length; k++) {
      emit(attrs, poly[0]!);
      emit(attrs, poly[k]!);
      emit(attrs, poly[k + 1]!);
    }
  }
  return finish(attrs);
}

/** Line segments of `g` (non-indexed pairs) between lo ≤ z ≤ hi, cut at the planes. */
function clipLines(g: BufferGeometry, lo: number, hi: number): BufferGeometry | null {
  const pos = g.getAttribute('position');
  const { attrs, width, zAt } = attrsOf(g);
  for (let i = 0; i + 1 < pos.count; i += 2) {
    let p = rowOf(attrs, width, i);
    let q = rowOf(attrs, width, i + 1);
    if (Math.max(p[zAt]!, q[zAt]!) < lo || Math.min(p[zAt]!, q[zAt]!) > hi) continue;
    if (p[zAt]! > q[zAt]!) [p, q] = [q, p];
    const pz = p[zAt]!;
    const qz = q[zAt]!;
    const np = pz < lo ? mix(attrs, p, q, (lo - pz) / (qz - pz)) : p;
    const nq = qz > hi ? mix(attrs, p, q, (hi - pz) / (qz - pz)) : q;
    emit(attrs, np);
    emit(attrs, nq);
  }
  return finish(attrs);
}

/**
 * A jagged cap of raw planking over the hull's section at `z`, facing `dir` (+1 toward the bow): its
 * outline follows the hull's lines from keel to sheer, each point torn a little along z, with a few
 * sprung plank ends standing out of the break.
 */
function addCap(b: MeshBuilder, z: number, dir: number, rand: () => number): void {
  b.setRegion(1);
  b.setColor(0xd8c2a0);
  const keel = keelHeightAt(z) + 0.05;
  const top = sheerHeightAt(z) + 0.05;
  const steps = 9;
  const ring: { x: number; y: number; z: number }[] = [];
  const tear = () => z + dir * (rand() - 0.35) * 0.55;
  for (let i = 0; i <= steps; i++) {
    const y = keel + ((top - keel) * i) / steps;
    ring.push({ x: halfBeamAt(z, y) * 0.98, y, z: tear() });
  }
  for (let i = steps; i >= 0; i--) {
    const y = keel + ((top - keel) * i) / steps;
    ring.push({ x: -halfBeamAt(z, y) * 0.98, y, z: tear() });
  }
  const c = b.addVertex(0, (keel + top) * 0.5, z + dir * 0.05, 0.5, 0.5);
  const first = b.positions.length / 3;
  for (const p of ring) b.addVertex(p.x, p.y, p.z, 0, 0);
  for (let i = 0; i < ring.length; i++) {
    const a = first + i;
    const n = first + ((i + 1) % ring.length);
    if (dir > 0) b.indices.push(c, a, n);
    else b.indices.push(c, n, a);
  }
  // Sprung plank ends: thin slats standing out of the break.
  b.setColor(0xc9a679);
  for (let k = 0; k < 10; k++) {
    const side = k % 2 ? 1 : -1;
    const y = keel + 0.4 + rand() * (top - keel - 0.5);
    const x = side * halfBeamAt(z, y) * (0.82 + rand() * 0.12);
    const len = 0.5 + rand() * 0.9;
    b.addBox(x, y, z + dir * len * 0.5, 0.09, 0.05 + rand() * 0.05, len);
  }
  // A torn deck beam across the break.
  b.addBox(0, top - 0.55, z + dir * 0.35, halfBeamAt(z, top - 0.5) * 1.6, 0.16, 0.7);
}
