import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Mesh,
  MeshStandardNodeMaterial,
} from 'three/webgpu';
import { abs, attribute, color, float, fract, max, mix, positionWorld, sin, smoothstep, uv } from 'three/tsl';
import { world } from '../uniforms';

// three's fluent TSL typings don't cover every scalar/vector mix used below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/**
 * Per-strip flow: how full (0 dry → 1 full, also the opacity), how fast it runs, and extra foam.
 * `kind` picks a look within the one shared material: 0 channel water (the mill's), 1 a still lake
 * (deep teal, a slow sparkle, a softer sky), −1 falling water (white, streaked down its length).
 */
export interface StripFlow {
  fill: number;
  speed: number;
  foam?: number;
  kind?: number;
}

/**
 * The flowing water in the puzzle channels, the spring spout, pools, and falls: one dynamic mesh
 * (one draw) rebuilt from quads whenever the water changes. `uv.y` is metres along the flow, so the
 * streaks in the shader travel with the water and stay continuous from one channel into the next.
 */
export class WaterStrips {
  readonly mesh: Mesh;
  private readonly geo = new BufferGeometry();
  private readonly pos: Float32Array;
  private readonly nrm: Float32Array;
  private readonly tex: Float32Array;
  private readonly flw: Float32Array;
  private quads = 0;

  constructor(
    private readonly maxQuads = 256,
    material = createFlowingWaterMaterial(),
  ) {
    const n = maxQuads * 4;
    this.pos = new Float32Array(n * 3);
    this.nrm = new Float32Array(n * 3);
    this.tex = new Float32Array(n * 2);
    this.flw = new Float32Array(n * 4);
    const idx = new Uint32Array(maxQuads * 6);
    for (let i = 0; i < maxQuads; i++) {
      const a = i * 4;
      idx.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], i * 6);
    }
    const attr = (a: Float32Array, size: number) => new BufferAttribute(a, size).setUsage(DynamicDrawUsage);
    this.geo.setAttribute('position', attr(this.pos, 3));
    this.geo.setAttribute('normal', attr(this.nrm, 3));
    this.geo.setAttribute('uv', attr(this.tex, 2));
    this.geo.setAttribute('flow', attr(this.flw, 4));
    this.geo.setIndex(new BufferAttribute(idx, 1));
    this.geo.setDrawRange(0, 0);
    this.mesh = new Mesh(this.geo, material);
    this.mesh.name = 'site water';
    this.mesh.userData.waterStrips = true;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  begin(): void {
    this.quads = 0;
  }

  /**
   * A quad from corners a (start, left), b (start, right), c (end, left), d (end, right), with the
   * flow running from the start edge (`v0`) to the end edge (`v1`). `u0`..`u1` is how far across the
   * strip the left and right edges sit (the shader foams the strip's edges; 0.5..0.5 has none).
   */
  quad(
    a: readonly number[],
    b: readonly number[],
    c: readonly number[],
    d: readonly number[],
    v0: number,
    v1: number,
    f: StripFlow,
    u0 = 0,
    u1 = 1,
  ): void {
    if (this.quads >= this.maxQuads || f.fill <= 0.001) return;
    const i = this.quads++ * 4;
    const corners = [a, b, c, d];
    // Normal from the two edges (consistent winding; flipped up if it points down).
    const ux = c[0]! - a[0]!,
      uy = c[1]! - a[1]!,
      uz = c[2]! - a[2]!;
    const vx = b[0]! - a[0]!,
      vy = b[1]! - a[1]!,
      vz = b[2]! - a[2]!;
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    if (Math.hypot(nx, ny, nz) < 1e-9) {
      // A fan triangle (a and b the same point): take the normal from its far edge instead.
      const wx = d[0]! - a[0]!,
        wy = d[1]! - a[1]!,
        wz = d[2]! - a[2]!;
      nx = uy * wz - uz * wy;
      ny = uz * wx - ux * wz;
      nz = ux * wy - uy * wx;
    }
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    if (ny < -0.2) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    for (let k = 0; k < 4; k++) {
      const p = corners[k]!;
      this.pos.set([p[0]!, p[1]!, p[2]!], (i + k) * 3);
      this.nrm.set([nx, ny, nz], (i + k) * 3);
      this.tex.set([k % 2 === 0 ? u0 : u1, k < 2 ? v0 : v1], (i + k) * 2);
      this.flw.set([f.fill, f.speed, f.foam ?? 0, f.kind ?? 0], (i + k) * 4);
    }
  }

  /** A level strip from (x0, z0) to (x1, z1) at height y, `width` wide. */
  strip(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y: number,
    width: number,
    v0: number,
    f: StripFlow,
  ): void {
    const dx = x1 - x0,
      dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    const px = (-dz / len) * width * 0.5,
      pz = (dx / len) * width * 0.5;
    this.quad(
      [x0 - px, y, z0 - pz],
      [x0 + px, y, z0 + pz],
      [x1 - px, y, z1 - pz],
      [x1 + px, y, z1 + pz],
      v0,
      v0 + len,
      f,
    );
  }

  /** A falling sheet from (x, yTop, z) down to yBottom, `width` wide across (ax, az), leaning out by `lean`. */
  fall(
    x: number,
    z: number,
    yTop: number,
    yBottom: number,
    ax: number,
    az: number,
    width: number,
    lean: { x: number; z: number },
    v0: number,
    f: StripFlow,
  ): void {
    const hx = ax * width * 0.5,
      hz = az * width * 0.5;
    this.quad(
      [x - hx, yTop, z - hz],
      [x + hx, yTop, z + hz],
      [x - hx * 1.1 + lean.x, yBottom, z - hz * 1.1 + lean.z],
      [x + hx * 1.1 + lean.x, yBottom, z + hz * 1.1 + lean.z],
      v0,
      v0 + (yTop - yBottom),
      f,
    );
  }

  end(): void {
    this.geo.setDrawRange(0, this.quads * 6);
    for (const name of ['position', 'normal', 'uv', 'flow']) {
      (this.geo.getAttribute(name) as BufferAttribute).needsUpdate = true;
    }
    this.mesh.visible = this.quads > 0;
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as MeshStandardNodeMaterial).dispose();
    this.mesh.removeFromParent();
  }
}

/** Shallow, clear channel water: travelling streaks, lighter in the middle, foam at the edges and in falls. */
function createFlowingWaterMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    roughness: 0.08,
    metalness: 0,
  });
  const f = attribute('flow', 'vec4') as AnyNode;
  const t = uv() as AnyNode;
  const along = t.y;
  const across = t.x;
  const time = world.time as AnyNode;
  const speed = f.y;
  const wob = sin(across.mul(7.0).add(along.mul(2.3)).add(time.mul(0.9))).mul(0.14);
  const ph = along.mul(1.6).sub(time.mul(speed).mul(1.35)).add(wob);
  const band = fract(ph);
  const streak = smoothstep(float(0), float(0.07), band).mul(
    float(1).sub(smoothstep(float(0.07), float(0.36), band)),
  );
  const fine = fract(along.mul(4.3).sub(time.mul(speed).mul(2.2)).add(wob.mul(2.0)));
  const glint = smoothstep(float(0.9), float(1), fine).mul(0.35);
  const edge = abs(across.sub(0.5)).mul(2);
  const moving = speed.min(1);
  const foam = streak
    .mul(float(0.25).add(edge.mul(0.45)))
    .add(glint)
    .mul(moving)
    .add(f.z.mul(float(0.55).add(streak.mul(0.45))))
    .add(smoothstep(float(0.78), float(1), edge).mul(0.25))
    .clamp(0, 1);
  const deep = color(0x1e7680);
  const shallow = color(0x6fcfc6);
  const base = mix(deep, shallow, float(1).sub(edge).mul(0.45).add(streak.mul(0.2)));
  const channel = mix(base, color(0xf2fbf8), foam.mul(0.75)) as AnyNode;
  const channelOpacity = f.x.mul(float(0.7).add(foam.mul(0.28))).clamp(0, 1) as AnyNode;
  const channelRough = float(0.06).add(foam.mul(0.5)) as AnyNode;

  // A still lake: deep teal with slow, crossing swells of light, and a softer sky in it.
  const lake = max(f.w, float(0)) as AnyNode;
  const p = positionWorld as AnyNode;
  const swell = sin(p.x.mul(0.31).add(time.mul(0.35)))
    .mul(sin(p.z.mul(0.27).sub(time.mul(0.28))))
    .mul(0.5)
    .add(0.5);
  const sparkle = smoothstep(
    float(0.9),
    float(1),
    sin(p.x.mul(1.7).add(p.z.mul(1.3)).add(time.mul(0.8))).mul(swell),
  );
  const lakeColor = mix(color(0x164c52), color(0x2c7a78), swell.mul(0.6)).add(sparkle.mul(0.18));

  // Falling water: white, streaked down its length, the streaks racing down; soft, ragged edges.
  const fall = max(f.w.negate(), float(0)) as AnyNode;
  const ragged = sin(along.mul(0.9).add(across.mul(5.0))).mul(0.06);
  const striation = sin(across.mul(43.0).add(sin(along.mul(0.35).add(across.mul(9.0))).mul(1.6)))
    .mul(0.5)
    .add(0.5);
  const rush = fract(along.mul(0.28).sub(time.mul(speed).mul(0.55)).add(across.mul(1.9)));
  const sheet = smoothstep(float(0.25), float(0.75), striation)
    .mul(0.5)
    .add(smoothstep(float(0.55), float(1), rush).mul(0.5));
  const fallColor = mix(color(0x9fc6cc), color(0xf6fcfc), sheet.mul(0.7).add(0.3));
  const edgeFade = smoothstep(float(0), float(0.16).add(ragged), across).mul(
    smoothstep(float(1), float(0.84).sub(ragged), across),
  );

  m.colorNode = mix(mix(channel, lakeColor, lake), fallColor, fall) as AnyNode;
  m.opacityNode = mix(
    mix(channelOpacity, f.x.mul(0.96), lake),
    f.x.mul(edgeFade).mul(float(0.82).add(sheet.mul(0.16))),
    fall,
  ) as AnyNode;
  m.roughnessNode = mix(mix(channelRough, float(0.5), lake), float(0.55), fall) as AnyNode;
  return m;
}
