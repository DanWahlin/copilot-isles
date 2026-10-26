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
  cross,
  dot,
  float,
  floor,
  fract,
  fwidth,
  max,
  mix,
  normalView,
  normalWorld,
  positionView,
  positionWorld,
  reflect,
  sin,
  smoothstep,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { world } from '../uniforms';

// three's fluent TSL typings don't cover every scalar/vector mix used below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/**
 * Per-strip flow: how full (0 dry → 1 full, also the opacity), how fast it runs, and extra foam.
 * `kind` picks a look within the one shared material: 0 channel water (the mill's), 1 a still lake
 * (deep teal, a slow sparkle, a softer sky), −1 falling water (white, streaked down its length),
 * 2 a natural stream and 3 a natural pool (clear in the shallows, jade in the deep, broken ripples
 * flowing down the course or spreading from where the water comes in; `QuadCorners` gives each
 * vertex its depth, foam and ripple distance).
 */
export interface StripFlow {
  fill: number;
  speed: number;
  foam?: number;
  kind?: number;
}

/** Per-vertex values for a quad's corners (a, b, c, d), overriding the strip's own. */
export interface QuadCorners {
  /** The water's depth over the drawn ground (m; below 0 the ground stands over it). */
  depth?: readonly number[];
  /** White water (0..1). */
  foam?: readonly number[];
  /** `v`: metres along the flow, or for a pool the distance from where its water comes in. */
  along?: readonly number[];
  /** The look (`StripFlow.kind`), where a strip eases from one to another (a stream into a pool). */
  kind?: readonly number[];
  /** How full (`StripFlow.fill`), where two strips overlap and cross-fade (a stream into a pool). */
  fill?: readonly number[];
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
  private readonly bed: Float32Array;
  private quads = 0;
  /** Quads asked for past `maxQuads` since `begin` (dropped). */
  dropped = 0;

  constructor(
    private readonly maxQuads = 256,
    material = createFlowingWaterMaterial(),
  ) {
    const n = maxQuads * 4;
    this.pos = new Float32Array(n * 3);
    this.nrm = new Float32Array(n * 3);
    this.tex = new Float32Array(n * 2);
    this.flw = new Float32Array(n * 4);
    this.bed = new Float32Array(n).fill(1);
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
    this.geo.setAttribute('bed', attr(this.bed, 1));
    this.geo.setIndex(new BufferAttribute(idx, 1));
    this.geo.setDrawRange(0, 0);
    this.mesh = new Mesh(this.geo, material);
    this.mesh.name = 'site water';
    this.mesh.userData.waterStrips = true;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  private twoSided(): boolean {
    return (this.mesh.material as MeshStandardNodeMaterial).side === DoubleSide;
  }

  begin(): void {
    this.quads = 0;
    this.dropped = 0;
  }

  /** Quads laid since `begin`. */
  get count(): number {
    return this.quads;
  }

  /** Moves quads `from`..`to` (level ones: a lock's water) to height `y` in place, with no rebuild. */
  setLevel(from: number, to: number, y: number): void {
    for (let i = from * 4; i < to * 4; i++) this.pos[i * 3 + 1] = y;
    const attr = this.geo.getAttribute('position') as BufferAttribute;
    attr.clearUpdateRanges();
    attr.addUpdateRange(from * 12, (to - from) * 12);
    attr.needsUpdate = true;
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
    corners4?: QuadCorners,
  ): void {
    if (f.fill <= 0.001) return;
    if (this.quads >= this.maxQuads) {
      this.dropped++;
      return;
    }
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
    // Facing down as wound: flip the normal up, and (on the shared two-sided look) the winding with it,
    // each corner swapping with its neighbour across. The winding decides which face three takes for
    // the front: wound down, the water seen from above was its back face and its normal turned down
    // again, lit from below (the Silver Pool read as a dark grey slab). A one-sided mesh (the
    // fountain) lays its own windings.
    const down = ny < -0.2 && this.twoSided();
    if (ny < -0.2) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    for (let k = 0; k < 4; k++) {
      const c = down ? k ^ 1 : k;
      const p = corners[c]!;
      this.pos.set([p[0]!, p[1]!, p[2]!], (i + k) * 3);
      this.nrm.set([nx, ny, nz], (i + k) * 3);
      this.tex.set([c % 2 === 0 ? u0 : u1, corners4?.along?.[c] ?? (c < 2 ? v0 : v1)], (i + k) * 2);
      this.flw.set(
        [
          corners4?.fill?.[c] ?? f.fill,
          f.speed,
          corners4?.foam?.[c] ?? f.foam ?? 0,
          corners4?.kind?.[c] ?? f.kind ?? 0,
        ],
        (i + k) * 4,
      );
      this.bed[i + k] = corners4?.depth?.[c] ?? 1;
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
    for (const name of ['position', 'normal', 'uv', 'flow', 'bed']) {
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

  // A still lake: deep teal with slow, crossing swells of light, and a softer sky in it (kind 1 only).
  const lake = float(1)
    .sub(abs(f.w.sub(1)))
    .max(0) as AnyNode;
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

  const nat = naturalWater(f, t, time);
  const natural = nat.natural;
  m.colorNode = mix(mix(mix(channel, lakeColor, lake), fallColor, fall), nat.color, natural) as AnyNode;
  m.opacityNode = mix(
    mix(
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
    ),
    nat.opacity,
    natural,
  ) as AnyNode;
  m.roughnessNode = mix(
    mix(mix(channelRough, float(0.5), lake), float(0.55), fall),
    nat.roughness,
    natural,
  ) as AnyNode;
  m.normalNode = mix(normalView, nat.normal, natural).normalize() as AnyNode;
  // A fall glows a little with the light it carries, so it reads bright from its shaded back too.
  m.emissiveNode = mix(fallColor.mul(fall.mul(sheet.mul(0.35).add(0.12))), nat.emissive, natural) as AnyNode;
  return m;
}

/** A hash of a 2D lattice point without `sin` (steady at the large coordinates of world space). */
function hash2(p: AnyNode): AnyNode {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)) as AnyNode;
  const q = p3.add(dot(p3, p3.yzx.add(33.33))) as AnyNode;
  return fract(q.x.add(q.y).mul(q.z));
}

/** Smooth value noise, 0..1. */
function valueNoise(p: AnyNode): AnyNode {
  const i = floor(p) as AnyNode;
  const f = fract(p) as AnyNode;
  const u = f.mul(f).mul(f.mul(-2).add(3)) as AnyNode;
  const a = hash2(i);
  const b = hash2(i.add(vec2(1, 0)));
  const c = hash2(i.add(vec2(0, 1)));
  const d = hash2(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/**
 * Natural water (kinds 2 and 3): its colour, opacity, roughness and rippled normal, and how much of
 * it a fragment is. Clear and light in the shallows, jade (#2E9C8A, spec §2) and darker in the deep,
 * fading out wherever the ground meets it; ripples broken by a warp (no regular stripes), stretched
 * along a stream and flowing with it, faster in narrow riffles; in a pool they drift and spread in
 * rings from where its water comes in. White water where the strip asks for it (round stones, in
 * riffles, under a fall), broken by the same ripples. Every pattern is at least ~0.5 m and fades to
 * its mean as it shrinks under a few pixels, so temporal AA keeps its motion (the frozen-falls lesson).
 */
function naturalWater(f: AnyNode, t: AnyNode, time: AnyNode) {
  const w = f.w as AnyNode;
  const natural = smoothstep(float(1.5), float(2), w) as AnyNode;
  const pool = w.sub(2).clamp(0, 1) as AnyNode;
  const speed = f.y as AnyNode;
  const foamWanted = f.z as AnyNode;
  const depth = attribute('bed', 'float') as AnyNode;
  const p = positionWorld as AnyNode;
  // A stream's ripples run in its own frame (u across, v along, flowing); a pool's in the world's.
  const flowing = vec2(t.x, t.y.sub(time.mul(speed).mul(0.9))) as AnyNode;
  const still = vec2(p.x.add(time.mul(0.07)), p.z.sub(time.mul(0.05))) as AnyNode;
  const q = mix(flowing, still, pool) as AnyNode;
  // Metres a pixel spans here: patterns finer than a few pixels fade to their mean.
  const px = fwidth(q.x).add(fwidth(q.y)) as AnyNode;
  const fine = float(1).sub(smoothstep(float(0.05), float(0.14), px));
  const broad = float(1).sub(smoothstep(float(0.14), float(0.45), px));
  const warp = valueNoise(q.mul(0.31).add(vec2(time.mul(0.09), time.mul(-0.06)))) as AnyNode;
  const qw = q.add(vec2(warp.sub(0.5).mul(2.2), warp.sub(0.5).mul(-1.4))) as AnyNode;
  // Long ripples down a stream (stretched along its flow), round ones on a pool.
  const stretch = mix(vec2(0.95, 0.42), vec2(0.62, 0.62), pool) as AnyNode;
  const r1 = valueNoise(qw.mul(stretch)) as AnyNode;
  const r2 = valueNoise(qw.mul(2.3).add(vec2(5.2, 1.7))) as AnyNode;
  // Rings spreading from where a pool's water comes in (`v` is the distance from there).
  const rings = sin(t.y.mul(2.1).sub(time.mul(1.9)).add(warp.mul(3.0)))
    .mul(0.5)
    .add(0.5)
    .mul(float(1).sub(smoothstep(float(2), float(16), t.y)))
    .mul(pool)
    .mul(broad) as AnyNode;
  const ripple = r1
    .sub(0.5)
    .mul(broad)
    .add(r2.sub(0.5).mul(0.45).mul(fine))
    .add(rings.sub(0.25).mul(0.6)) as AnyNode;
  // White water: thresholded by the ripples, so it breaks into flecks and clots rather than bands.
  const churn = r1.mul(0.55).add(
    r2
      .mul(0.45)
      .mul(fine)
      .add(float(0.225).mul(float(1).sub(fine))),
  );
  const white = smoothstep(
    float(0.72).sub(foamWanted.mul(0.55)),
    float(0.95).sub(foamWanted.mul(0.4)),
    churn.add(rings.mul(foamWanted).mul(0.35)),
  )
    .mul(smoothstep(float(0.02), float(0.25), foamWanted))
    .add(foamWanted.mul(0.25))
    .clamp(0, 1) as AnyNode;
  // Clear and light in the shallows (the bed shows), jade, then dark in the deep middle.
  // (Water's own colour is mostly what it absorbs: dark under the sun, the sky in it does the rest.)
  const shallowTone = mix(color(0x6aa890), color(0x1d6b5d), smoothstep(float(0.02), float(0.45), depth));
  const water = mix(shallowTone, color(0x0b3833), smoothstep(float(0.4), float(1.5), depth)) as AnyNode;
  const lit = water.add(ripple.mul(0.07)) as AnyNode;
  const colorOut = mix(lit, color(0xf2fbf8), white.mul(0.85));
  // Glancing views see the sky in it whatever the depth (a fresnel lift of the opacity).
  const toEye = cameraPosition.sub(p).normalize() as AnyNode;
  const glance = float(1).sub(abs(toEye.y)).pow(4) as AnyNode;
  const shore = smoothstep(float(0), float(0.08), depth);
  const body = mix(float(0.26), float(0.84), smoothstep(float(0.04), float(1), depth));
  const opacity = shore.mul(body.add(glance.mul(0.3)).add(white.mul(0.6)).clamp(0, 1)).mul(f.x) as AnyNode;
  // Matte to the scene's lights (a mirror of the bright environment washed it white); the sky it
  // reflects and the sun's glints are its own, below, with water's Fresnel (as the sea's, F0 0.02).
  const roughness = float(0.92) as AnyNode;
  // The ripples tilt the normal (from their screen-space slope; Mikkelsen's surface-gradient bump).
  const height = ripple.mul(0.03).add(white.mul(0.015)) as AnyNode;
  const sx = positionView.dFdx() as AnyNode;
  const sy = positionView.dFdy() as AnyNode;
  const n = normalView as AnyNode;
  const r1v = cross(sy, n) as AnyNode;
  const r2v = cross(n, sx) as AnyNode;
  const det = dot(sx, r1v) as AnyNode;
  const grad = det.sign().mul(height.dFdx().mul(r1v).add(height.dFdy().mul(r2v))) as AnyNode;
  const normal = det.abs().max(1e-12).mul(n).sub(grad).normalize() as AnyNode;
  const N = normalWorld as AnyNode;
  const nDotV = dot(N, toEye).max(0) as AnyNode;
  const fresnel = float(0.02).add(float(0.98).mul(float(1).sub(nDotV).pow(5))) as AnyNode;
  const mirrored = reflect(toEye.negate(), N) as AnyNode;
  // The sky it mirrors, dimmed by the canopy and the banks round it (a white ribbon from afar otherwise).
  const sky = mix(world.hazeColor, world.skyColor, smoothstep(float(-0.15), float(0.25), mirrored.y)).mul(
    mix(float(0.62), float(0.3), world.night),
  ) as AnyNode;
  const half = (world.sunDir as AnyNode).add(toEye).normalize() as AnyNode;
  const day = smoothstep(float(-0.03), float(0.08), world.sunDir.y) as AnyNode;
  const glint = (world.sunColor as AnyNode).mul(
    dot(N, half).max(0).pow(220).mul(3).mul(fresnel.add(0.05)).mul(day),
  ) as AnyNode;
  const emissive = sky
    .mul(fresnel)
    .add(glint)
    .mul(float(1).sub(white.mul(0.8))) as AnyNode;
  return { natural, color: colorOut, opacity, roughness, normal, emissive };
}
