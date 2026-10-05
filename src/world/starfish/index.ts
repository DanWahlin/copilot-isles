import {
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshStandardNodeMaterial,
  Quaternion,
  Vector3,
  type Camera,
} from 'three/webgpu';
import { color, float, mix, positionLocal, sin, smoothstep } from 'three/tsl';
import { world } from '../uniforms';
import { STARFISH, type StarfishSpot } from './spots';

// three's fluent TSL typings don't cover every scalar/vector mix used below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/** How high a starfish floats over the ground, how far it bobs, and how fast it turns (rad/s). */
const FLOAT = 0.95;
const BOB = 0.15;
const SPIN = 1.6;
/** Arm reach (m). */
const SIZE = 0.55;

export interface StarfishSystem {
  readonly mesh: InstancedMesh;
  readonly spots: readonly StarfishSpot[];
  /** Sets where starfish `i` rests (its ground height), once the ground under it is known. */
  setGround(i: number, y: number): void;
  /** Whether starfish `i` has a ground height yet. */
  grounded(i: number): boolean;
  /** Hides the starfish whose ids are in `found` (and shows the rest). */
  setFound(found: readonly string[]): void;
  /** Starfish `i`'s centre (where you pick it up), written to `out`. */
  centre(i: number, out: Vector3): Vector3;
  update(dt: number, t: number, camera: Camera): void;
  dispose(): void;
}

/**
 * The starfish to collect (Dan: "like Mario's stars"): a chubby five-armed star that floats, bobs and
 * turns where it lies, coral with a warm gold heart that glows a little at dusk and night so it's
 * easy to spot. All twelve are one instanced mesh (one draw, one shader program). It joins the scene
 * before the island compiles, so the first starfish you see doesn't stall the frame.
 */
export function createStarfish(): StarfishSystem {
  const spots = STARFISH;
  const geometry = starGeometry();
  const material = createStarfishMaterial();
  const mesh = new InstancedMesh(geometry, material, spots.length);
  mesh.name = 'starfish';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // The instances span both islands; the whole set is a few thousand triangles, so it isn't culled.
  mesh.frustumCulled = false;
  const ground = new Float32Array(spots.length).fill(Number.NaN);
  const hidden = new Uint8Array(spots.length);
  const m = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const s = new Vector3();
  const up = new Vector3(0, 1, 0);
  const zero = new Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < spots.length; i += 1) mesh.setMatrixAt(i, zero);

  return {
    mesh,
    spots,
    setGround(i, y) {
      ground[i] = y;
    },
    grounded: (i) => !Number.isNaN(ground[i]!),
    setFound(found) {
      for (let i = 0; i < spots.length; i += 1) hidden[i] = found.includes(spots[i]!.id) ? 1 : 0;
    },
    centre(i, out) {
      const sp = spots[i]!;
      return out.set(sp.x, (Number.isNaN(ground[i]!) ? (sp.y ?? 0) : ground[i]!) + FLOAT, sp.z);
    },
    update(_dt, t) {
      for (let i = 0; i < spots.length; i += 1) {
        const sp = spots[i]!;
        if (hidden[i] || Number.isNaN(ground[i]!)) {
          mesh.setMatrixAt(i, zero);
          continue;
        }
        const phase = i * 1.7;
        q.setFromAxisAngle(up, t * SPIN + phase);
        p.set(sp.x, ground[i]! + FLOAT + Math.sin(t * 2.1 + phase) * BOB, sp.z);
        s.setScalar(1);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
      mesh.removeFromParent();
    },
  };
}

/** A puffy five-armed star standing on edge, its arms' tips coral and its heart gold (vertex colours). */
function starGeometry(): BufferGeometry {
  // Hand-built (not ExtrudeGeometry, which drags the whole Shape/earcut stack into vendor-three):
  // each face is a fan from a raised heart through a mid ring to the rim, and a wall joins the rims.
  const rings: [scale: number, z: number][] = [
    [0, 0.11],
    [0.55, 0.085],
    [1, 0.035],
  ];
  const outline: [number, number][] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? SIZE : SIZE * 0.46;
    outline.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const positions: number[] = [];
  const faceStart: number[] = [];
  for (const side of [1, -1]) {
    faceStart.push(positions.length / 3);
    positions.push(0, 0, rings[0]![1] * side);
    for (const [scale, z] of rings.slice(1))
      for (const [x, y] of outline) positions.push(x * scale, y * scale, z * side);
  }
  const index: number[] = [];
  for (let f = 0; f < 2; f += 1) {
    const c = faceStart[f]!;
    const mid = c + 1;
    const rim = c + 11;
    const tri = (a: number, b: number, d: number): void => {
      if (f === 0) index.push(a, b, d);
      else index.push(a, d, b);
    };
    for (let i = 0; i < 10; i += 1) {
      const j = (i + 1) % 10;
      tri(c, mid + i, mid + j);
      tri(mid + i, rim + i, rim + j);
      tri(mid + i, rim + j, mid + j);
    }
  }
  const front = faceStart[0]! + 11;
  const back = faceStart[1]! + 11;
  for (let i = 0; i < 10; i += 1) {
    const j = (i + 1) % 10;
    index.push(front + i, back + i, back + j, front + i, back + j, front + j);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(index);
  const pos = geometry.getAttribute('position') as BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const heart = new Color(0xffc24a);
  const tip = new Color(0xff6a3c);
  const c = new Color();
  for (let i = 0; i < pos.count; i += 1) {
    const r = Math.hypot(pos.getX(i), pos.getY(i)) / SIZE;
    c.copy(heart).lerp(tip, Math.min(1, Math.max(0, (r - 0.2) / 0.75)));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createStarfishMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0, vertexColors: true });
  material.name = 'starfish';
  const p = positionLocal as AnyNode;
  // A pebbled skin: small bumps along the arms.
  const bumps = sin(p.x.mul(61))
    .mul(sin(p.y.mul(59)))
    .mul(0.5)
    .add(0.5);
  const heart = float(1).sub(smoothstep(float(0.05), float(0.22), p.xy.length()));
  const pulse = sin((world.time as AnyNode).mul(2.6))
    .mul(0.5)
    .add(0.5);
  material.roughnessNode = float(0.42).add(bumps.mul(0.2));
  material.emissiveNode = mix(color(0xff7a3a), color(0xffd56a), heart)
    .mul(
      float(0.16)
        .add(pulse.mul(0.1))
        .add((world.night as AnyNode).mul(0.5)),
    )
    .mul(float(0.85).add(bumps.mul(0.15))) as AnyNode;
  return material;
}
