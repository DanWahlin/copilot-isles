import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Mesh,
  MeshStandardNodeMaterial,
} from 'three/webgpu';
import {
  abs,
  attribute,
  cameraPosition,
  color,
  float,
  floor,
  fract,
  fwidth,
  max,
  mix,
  positionWorld,
  sin,
  smoothstep,
  uv,
} from 'three/tsl';
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
    // A flat sheet: one pass for both faces (one shader, not a back and a front one; PLAN §15.4).
    forceSinglePass: true,
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
  // Ribbons of white water racing down: each narrow column across the sheet at its own phase, so the
  // pattern runs straight down the fall (no diagonal bands on a wide one).
  const column = floor(across.mul(44));
  const colPhase = fract(sin(column.mul(12.9898)).mul(43758.5453));
  const rush = fract(
    along
      .mul(colPhase.mul(0.25).add(0.12))
      .sub(time.mul(speed).mul(colPhase.mul(0.3).add(0.45)))
      .add(colPhase),
  );
  // Each ribbon rounded across its width, so columns don't meet in hard seams.
  const ribbon = sin(fract(across.mul(44)).mul(Math.PI))
    .max(0)
    .pow(0.6);
  // A soft pulse (a triangle wave, no hard edge where it wraps) in each column.
  const pulse = float(1).sub(abs(rush.mul(2).sub(1)));
  // Where a column is narrower than a few pixels (a fall seen from afar), its ribbons are sub-pixel
  // noise: temporal AA averages them to a flat mean and only the still striation stays (the falls
  // looked frozen). There they fade to their mean and the surges below carry the motion.
  const sharp = float(1).sub(smoothstep(float(0.25), float(0.6), fwidth(across).mul(44)));
  const ribbons = mix(float(0.24), smoothstep(float(0.35), float(1), pulse).mul(ribbon), sharp);
  // Surges: clumps of white water falling down the whole sheet, a bright front with a fading tail.
  // Their fronts only wave gently across it, so they stay one band at any distance (a pattern a pixel
  // wide changes too fast for temporal AA to keep).
  const sway = sin(across.mul(5.0).add(along.mul(0.13)))
    .mul(0.16)
    .add(sin(across.mul(13.0).sub(along.mul(0.31))).mul(0.05));
  const surges = (perMetre: number, rate: number): AnyNode => {
    const phase = along.mul(perMetre).sub(time.mul(speed).mul(rate)).add(sway);
    const band = fract(phase);
    // Each surge carries its own amount of white water, so they don't fall like a regular stair.
    const size = fract(sin(floor(phase).mul(78.233)).mul(43758.5453))
      .mul(0.55)
      .add(0.45);
    return smoothstep(float(0.05), float(0.42), band)
      .mul(float(1).sub(smoothstep(float(0.42), float(0.52), band)))
      .mul(size);
  };
  // Long surges for a tall fall seen from afar; short ones where a metre of the fall is many pixels
  // (a small fall, the mill's spouts, or a big one close up), so a short drop still shows a few.
  const short = float(1).sub(smoothstep(float(0.02), float(0.045), fwidth(along).mul(0.9)));
  const surge = mix(surges(0.19, 0.62), surges(0.9, 1.8), short);
  const sheet = smoothstep(float(0.25), float(0.75), striation)
    .mul(mix(float(0.15), float(0.3), sharp))
    .add(ribbons.mul(0.3))
    .add(surge.mul(mix(float(0.6), float(0.4), sharp)));
  // White foam where the sheet leaves the lip and where it lands (the strips' foam). Foam lifts the
  // whole sheet towards white without flattening it, so the surges still show on a foamy cascade.
  const fallColor = mix(
    color(0x9fc6cc),
    color(0xf6fcfc),
    mix(sheet.mul(0.7).add(0.3).min(1), float(1), f.z.mul(0.7).min(0.75)),
  );
  // A fall only a few dozen pixels across (a spout, or one far off) keeps its body: it thinned to a
  // ghost with the close-up thinning and the wide ragged edges.
  const narrow = smoothstep(float(0.006), float(0.03), fwidth(across));
  const edgeWidth = mix(float(0.16), float(0.08), narrow).add(ragged);
  const edgeFade = smoothstep(float(0), edgeWidth, across).mul(
    smoothstep(float(1), float(1).sub(edgeWidth), across),
  );

  m.colorNode = mix(mix(channel, lakeColor, lake), fallColor, fall) as AnyNode;
  m.opacityNode = mix(
    mix(channelOpacity, f.x.mul(0.96), lake),
    // Thin between its ribbons (you see through a falling sheet), dense where the white water runs.
    // Close up (from behind a fall, in its cave) the sheet thins between its ribbons, so you see the
    // world through it; from a distance it reads as white water, and so does a narrow one.
    f.x
      .mul(edgeFade)
      .mul(
        mix(
          mix(
            float(0.16),
            float(0.5),
            smoothstep(float(4), float(16), (positionWorld as AnyNode).distance(cameraPosition)),
          ),
          float(0.62),
          narrow,
        ).add(sheet.mul(0.5)),
      ),
    fall,
  ) as AnyNode;
  m.roughnessNode = mix(mix(channelRough, float(0.5), lake), float(0.55), fall) as AnyNode;
  // A fall glows a little with the light it carries, so it reads bright from its shaded back too.
  m.emissiveNode = fallColor.mul(fall.mul(sheet.mul(0.35).add(0.12))) as AnyNode;
  return m;
}
