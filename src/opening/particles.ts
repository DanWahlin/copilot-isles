import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicNodeMaterial,
  Vector3,
} from 'three/webgpu';
import { attribute, float, max, positionLocal, uniform, vec2 } from 'three/tsl';
import type { Node } from 'three/webgpu';

/**
 * Camera-facing particles for the opening (dust in the sunbeams, the chest's puff and sparkles):
 * one static quad per particle, turned to the camera in the vertex shader from two shared uniforms
 * the opening sets once per frame. Nothing is allocated per frame.
 */
export const camRight = uniform(new Vector3(1, 0, 0));
export const camUp = uniform(new Vector3(0, 1, 0));

export interface BillboardAttrs {
  /** Each particle's centre (object space). */
  centre: Node<'vec3'>;
  /** The quad corner (−1…1). */
  corner: Node<'vec2'>;
  /** A random 0-1 per particle. */
  seed: Node<'float'>;
  /** A soft round mask (1 in the middle → 0 at the rim). */
  round: Node<'float'>;
}

export function billboardGeometry(count: number, place: (i: number, out: Vector3) => void): BufferGeometry {
  const pos = new Float32Array(count * 12);
  const corner = new Float32Array(count * 8);
  const seed = new Float32Array(count * 4);
  const index: number[] = [];
  const p = new Vector3();
  let s = 0x9e3779b9;
  for (let i = 0; i < count; i++) {
    place(i, p);
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    const r = s / 4294967296;
    for (let c = 0; c < 4; c++) {
      pos.set([p.x, p.y, p.z], (i * 4 + c) * 3);
      corner.set([c === 0 || c === 3 ? -1 : 1, c < 2 ? -1 : 1], (i * 4 + c) * 2);
      seed[i * 4 + c] = r;
    }
    const b = i * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('corner', new BufferAttribute(corner, 2));
  g.setAttribute('seed', new BufferAttribute(seed, 1));
  g.setIndex(index);
  return g;
}

export function billboardAttrs(): BillboardAttrs {
  const corner = attribute('corner', 'vec2');
  return {
    centre: positionLocal,
    corner,
    seed: attribute('seed', 'float'),
    round: max(float(0), float(1).sub(vec2(corner.x, corner.y).length())),
  };
}

/**
 * A billboard material: `offset(centre, seed)` moves each particle, `size(seed)` sets its half-size in
 * metres; colour and opacity come from the caller.
 */
export function billboardMesh(
  geometry: BufferGeometry,
  build: (a: BillboardAttrs, m: MeshBasicNodeMaterial) => { centre: Node<'vec3'>; size: Node<'float'> },
  additive = true,
): Mesh {
  const m = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    ...(additive ? { blending: AdditiveBlending } : {}),
  });
  const a = billboardAttrs();
  const { centre, size } = build(a, m);
  m.positionNode = centre.add(camRight.mul(a.corner.x.mul(size))).add(camUp.mul(a.corner.y.mul(size)));
  const mesh = new Mesh(geometry, m);
  mesh.frustumCulled = false;
  return mesh;
}
