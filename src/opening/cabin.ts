import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  type Camera,
  CanvasTexture,
  CircleGeometry,
  SRGBColorSpace,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Node,
} from 'three/webgpu';
import {
  abs,
  color,
  float,
  fract,
  mix,
  mx_noise_float,
  positionLocal,
  pow,
  sin,
  smoothstep,
  uniform,
  uv,
  vec3,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { billboardGeometry, billboardMesh, camRight, camUp } from './particles';

/**
 * The captain's cabin (docs/specs/OPENING-living-chart.md): one small, lamp-lit room at golden hour,
 * built in code (no download): planked floor, walls and beams, stern windows onto the sea, a big chart
 * desk, the hero sea chest, a swaying lantern, and a handful of props. Static parts share one
 * vertex-coloured material in a single merged draw.
 */
export interface Cabin {
  group: Group;
  /** The desk's top surface height. */
  deskY: number;
  /** Where the chest sits (its base, on the desk). */
  chestAt: Vector3;
  chest: HeroChest;
  lantern: Object3D;
  lanternLight: PointLight;
  chestLight: PointLight;
  sun: DirectionalLight;
  /** The dust puff as the lid opens (0 → 1), and the sparkles rising from the chest (0 → 1). */
  puff: { value: number };
  sparks: { value: number };
  /** Engraves the captain's name on the chest's nameplate. */
  setCaptainName(name: string): void;
  /** Keeps the particles facing the camera. */
  setCamera(camera: Camera): void;
  update(dt: number, t: number, reduced: boolean): void;
  dispose(): void;
}

export interface HeroChest {
  group: Group;
  /** Re-engraves the nameplate. */
  setName(name: string): void;
  /** The lid's hinge (rotate x, negative opens). */
  hinge: Object3D;
  /** The hasp's pivot on the lid's front (rotate x, positive swings it up and out). */
  hasp: Object3D;
  /** Inside the chest, where the rolled chart starts. */
  inside: Vector3;
  /** The warm glow from inside (0-1). */
  glow: { value: number };
  /** Light through the keyhole while the chest waits (0-1). */
  keyhole: { value: number };
  width: number;
  height: number;
  depth: number;
}

/** The stern windows (cabin metres): the chart's water reflects them. */
export const STERN_WINDOWS = { z: -1.95, xs: [-0.95, 0, 0.95], w: 0.66, y0: 1.0, y1: 1.78 } as const;

type RGB = readonly [number, number, number];

const OAK: RGB = [0.3, 0.19, 0.11];
const OAK_DARK: RGB = [0.17, 0.105, 0.06];
const PLANK: RGB = [0.34, 0.24, 0.16];
const PLANK_DARK: RGB = [0.2, 0.14, 0.09];
const WALNUT: RGB = [0.2, 0.12, 0.07];
const BLOTTER: RGB = [0.05, 0.15, 0.13];
const IRON: RGB = [0.1, 0.095, 0.09];
const BRASS: RGB = [0.78, 0.56, 0.24];
const ROPE: RGB = [0.62, 0.5, 0.32];
const RUG: RGB = [0.45, 0.12, 0.09];
const RUG_EDGE: RGB = [0.72, 0.52, 0.2];
const LEATHER = [
  [0.42, 0.13, 0.08],
  [0.16, 0.25, 0.32],
  [0.2, 0.32, 0.16],
  [0.5, 0.36, 0.16],
] as const;

class Parts {
  readonly list: BufferGeometry[] = [];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3(1, 1, 1);
  private readonly e = new Vector3();

  add(g: BufferGeometry, c: RGB, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set(c, i * 3);
    g.setAttribute('color', new BufferAttribute(colors, 3));
    if (g.index) g.toNonIndexed();
    this.q.setFromAxisAngle(this.e.set(1, 0, 0), rx);
    const qy = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), ry);
    const qz = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), rz);
    this.q.premultiply(qz).premultiply(qy);
    this.m.compose(this.e.set(x, y, z), this.q, this.s);
    g.applyMatrix4(this.m);
    g.deleteAttribute('uv');
    this.list.push(g);
  }

  box(
    w: number,
    h: number,
    d: number,
    c: RGB,
    x: number,
    y: number,
    z: number,
    ry = 0,
    rx = 0,
    rz = 0,
  ): void {
    this.add(new BoxGeometry(w, h, d), c, x, y, z, rx, ry, rz);
  }

  cyl(
    rt: number,
    rb: number,
    h: number,
    c: RGB,
    x: number,
    y: number,
    z: number,
    seg = 12,
    rx = 0,
    rz = 0,
  ): void {
    this.add(new CylinderGeometry(rt, rb, h, seg), c, x, y, z, rx, 0, rz);
  }

  merge(): BufferGeometry {
    const g = mergeGeometries(this.list.map((p) => (p.index ? p.toNonIndexed() : p)))!;
    for (const p of this.list) p.dispose();
    this.list.length = 0;
    return g;
  }
}

function jitter(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

/** A wood material with a little grain from object-space noise, shared by the room and props. */
function woodMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
  const grain = mx_noise_float(positionLocal.mul(vec3(3, 40, 3)))
    .mul(0.5)
    .add(0.5);
  const fine = mx_noise_float(positionLocal.mul(vec3(90, 6, 90)))
    .mul(0.5)
    .add(0.5);
  m.colorNode = vec3(1).mul(mix(float(0.82), float(1.08), grain.mul(0.7).add(fine.mul(0.3))));
  return m;
}

export interface CabinOptions {
  /** Sun shadow map size (0: no shadows, the tier has none). */
  shadowMap: number;
  /** Slices in the sunbeam volume (0 turns the shafts off). */
  shaftSlices: number;
  /** Engraved on the chest's nameplate. */
  captainName: string;
}

export function createCabin(opts: CabinOptions): Cabin {
  const group = new Group();
  group.name = 'captains cabin';
  const parts = new Parts();
  const rand = mulberry32(0xcab1);

  // ---- the room ----
  const X0 = -2.3;
  const X1 = 2.3;
  const Z0 = -1.95;
  const Z1 = 2.8;
  const H = 2.4;
  // Floor planks running fore and aft.
  for (let x = X0; x < X1 - 0.01; x += 0.24)
    parts.box(0.235, 0.05, Z1 - Z0, jitter(PLANK, 0.8 + rand() * 0.35), x + 0.12, -0.025, (Z0 + Z1) / 2);
  // Side walls: horizontal planks.
  for (const sx of [X0, X1])
    for (let y = 0; y < H; y += 0.2)
      parts.box(0.05, 0.195, Z1 - Z0, jitter(PLANK_DARK, 0.85 + rand() * 0.35), sx, y + 0.1, (Z0 + Z1) / 2);
  // Stern wall with three windows (openings at x = -0.95, 0, 0.95; y 1.0-1.78).
  const WIN_W = 0.66;
  const WIN_Y0 = 1.0;
  const WIN_Y1 = 1.78;
  for (let y = 0; y < H; y += 0.2) {
    const yc = y + 0.1;
    const k = 0.85 + rand() * 0.3;
    if (yc < WIN_Y0 || yc > WIN_Y1) parts.box(X1 - X0, 0.195, 0.06, jitter(PLANK_DARK, k), 0, yc, Z0);
    else
      for (const [a, b] of [
        [X0, -0.95 - WIN_W / 2],
        [-0.95 + WIN_W / 2, -WIN_W / 2],
        [WIN_W / 2, 0.95 - WIN_W / 2],
        [0.95 + WIN_W / 2, X1],
      ] as const)
        parts.box(b - a, 0.195, 0.06, jitter(PLANK_DARK, k), (a + b) / 2, yc, Z0);
  }
  for (const wx of [-0.95, 0, 0.95]) {
    // Frame, sill, and the mullions' little panes.
    parts.box(WIN_W + 0.1, 0.07, 0.14, OAK_DARK, wx, WIN_Y0 - 0.02, Z0 + 0.03);
    parts.box(WIN_W + 0.1, 0.07, 0.1, OAK_DARK, wx, WIN_Y1 + 0.03, Z0);
    for (const s of [-1, 1])
      parts.box(
        0.06,
        WIN_Y1 - WIN_Y0 + 0.1,
        0.1,
        OAK_DARK,
        wx + (s * (WIN_W + 0.04)) / 2,
        (WIN_Y0 + WIN_Y1) / 2,
        Z0,
      );
    parts.box(0.025, WIN_Y1 - WIN_Y0, 0.03, OAK_DARK, wx, (WIN_Y0 + WIN_Y1) / 2, Z0);
    parts.box(WIN_W, 0.025, 0.03, OAK_DARK, wx, (WIN_Y0 + WIN_Y1) / 2, Z0);
  }
  // Ceiling planks and the deck beams.
  for (let x = X0; x < X1 - 0.01; x += 0.3)
    parts.box(
      0.295,
      0.04,
      Z1 - Z0,
      jitter(PLANK_DARK, 0.7 + rand() * 0.25),
      x + 0.15,
      H + 0.02,
      (Z0 + Z1) / 2,
    );
  for (const bz of [-1.35, -0.1, 1.15, 2.4]) parts.box(X1 - X0, 0.16, 0.14, OAK_DARK, 0, H - 0.08, bz);
  // A knee brace at each beam end, and a post either side of the stern windows.
  for (const bz of [-1.35, -0.1, 1.15])
    for (const s of [-1, 1]) parts.box(0.1, 0.42, 0.1, OAK_DARK, s * (X1 - 0.08), H - 0.3, bz, 0, 0, s * 0.6);

  // ---- the rug and the desk ----
  parts.box(2.5, 0.012, 1.9, RUG, 0, 0.006, 0.05);
  parts.box(2.62, 0.01, 2.02, RUG_EDGE, 0, 0.004, 0.05);
  const DESK_Y = 0.8;
  const DW = 2.1;
  const DD = 1.36;
  parts.box(DW, 0.06, DD, WALNUT, 0, DESK_Y - 0.03, 0);
  // A green leather blotter under the chart, with brass corners (a cool note in the warm room).
  parts.box(1.24, 0.004, 0.94, BLOTTER, 0, DESK_Y + 0.002, 0.17);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) parts.box(0.06, 0.006, 0.06, BRASS, sx * 0.6, DESK_Y + 0.003, 0.17 + sz * 0.45);
  parts.box(DW + 0.06, 0.03, DD + 0.06, OAK_DARK, 0, DESK_Y - 0.075, 0);
  parts.box(DW - 0.1, 0.22, 0.04, OAK_DARK, 0, DESK_Y - 0.2, DD / 2 - 0.06);
  for (const dx of [-0.55, 0, 0.55]) {
    parts.box(0.5, 0.16, 0.012, OAK, dx, DESK_Y - 0.2, DD / 2 - 0.035);
    parts.cyl(0.018, 0.018, 0.03, BRASS, dx, DESK_Y - 0.2, DD / 2 - 0.015, 10, Math.PI / 2);
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const lx = sx * (DW / 2 - 0.1);
      const lz = sz * (DD / 2 - 0.1);
      parts.cyl(0.05, 0.045, DESK_Y - 0.09, OAK_DARK, lx, (DESK_Y - 0.09) / 2, lz, 10);
      parts.add(new SphereGeometry(0.065, 10, 6), OAK, lx, 0.36, lz);
    }

  // ---- props (about fifteen) ----
  // Books, stacked on the right of the desk.
  for (let i = 0; i < 4; i++) {
    const w = 0.24 - i * 0.02;
    parts.box(
      w,
      0.045,
      0.17,
      LEATHER[i]!,
      0.82 + (rand() - 0.5) * 0.02,
      DESK_Y + 0.023 + i * 0.046,
      -0.42,
      (rand() - 0.5) * 0.3,
    );
  }
  // Inkwell and quill on the left.
  parts.cyl(0.035, 0.045, 0.06, IRON, -0.82, DESK_Y + 0.03, -0.4, 12);
  parts.cyl(0.02, 0.02, 0.012, BRASS, -0.82, DESK_Y + 0.066, -0.4, 10);
  parts.add(
    new CylinderGeometry(0.004, 0.002, 0.3, 5),
    [0.92, 0.9, 0.86],
    -0.8,
    DESK_Y + 0.17,
    -0.4,
    0.25,
    0,
    -0.35,
  );
  // A brass compass and a spyglass at the front corners.
  parts.cyl(0.07, 0.075, 0.03, BRASS, 0.86, DESK_Y + 0.015, 0.44, 20);
  parts.cyl(0.06, 0.06, 0.004, [0.9, 0.86, 0.74], 0.86, DESK_Y + 0.031, 0.44, 20);
  parts.cyl(0.025, 0.03, 0.42, BRASS, -0.82, DESK_Y + 0.03, 0.45, 12, Math.PI / 2, 0);
  parts.cyl(0.032, 0.032, 0.08, OAK_DARK, -0.82, DESK_Y + 0.03, 0.27, 12, Math.PI / 2, 0);
  // A candle in a brass dish, by the books.
  parts.cyl(0.06, 0.06, 0.012, BRASS, 0.55, DESK_Y + 0.006, -0.48, 16);
  parts.cyl(0.022, 0.022, 0.12, [0.93, 0.88, 0.74], 0.55, DESK_Y + 0.07, -0.48, 10);
  // Globe on its stand (floor, right).
  parts.cyl(0.03, 0.18, 0.04, OAK_DARK, 1.65, 0.02, -1.15, 14);
  parts.cyl(0.025, 0.025, 0.72, OAK_DARK, 1.65, 0.38, -1.15, 8);
  parts.add(new TorusGeometry(0.27, 0.012, 6, 28), BRASS, 1.65, 0.98, -1.15, 0, 0.6, 0.4);
  parts.add(new SphereGeometry(0.25, 24, 16), [0.55, 0.47, 0.3], 1.65, 0.98, -1.15);
  // Barrel and a pair of crates (floor, left and right).
  parts.cyl(0.27, 0.27, 0.72, OAK, -1.75, 0.36, -1.2, 18);
  for (const y of [0.1, 0.62]) parts.cyl(0.285, 0.285, 0.04, IRON, -1.75, y, -1.2, 18);
  parts.box(0.55, 0.45, 0.5, PLANK, 1.8, 0.225, 0.9, 0.2);
  parts.box(0.42, 0.34, 0.4, jitter(PLANK, 0.85), 1.78, 0.62, 0.86, -0.15);
  // A coil of rope on the floor.
  parts.add(new TorusGeometry(0.2, 0.035, 8, 24), ROPE, -1.3, 0.035, 1.1, Math.PI / 2);
  parts.add(new TorusGeometry(0.16, 0.035, 8, 22), ROPE, -1.3, 0.1, 1.1, Math.PI / 2);
  // A shelf of jars and a tricorn on its peg (right wall).
  parts.box(0.22, 0.03, 1.1, OAK_DARK, X1 - 0.13, 1.45, -0.6);
  for (let i = 0; i < 4; i++)
    parts.cyl(
      0.05,
      0.05,
      0.14 + rand() * 0.06,
      jitter([0.3, 0.42, 0.36], 0.8 + rand() * 0.4),
      X1 - 0.13,
      1.54,
      -1.0 + i * 0.26,
      10,
    );
  parts.cyl(0.015, 0.015, 0.12, OAK_DARK, X1 - 0.06, 1.75, 0.3, 6, 0, Math.PI / 2);
  parts.cyl(0.2, 0.2, 0.06, [0.08, 0.07, 0.07], X1 - 0.16, 1.68, 0.3, 3, 0, Math.PI / 2 - 0.15);
  // A chair pushed back at the left of the desk.
  parts.box(0.46, 0.05, 0.44, OAK, -1.4, 0.46, -0.45, 0.4);
  for (const [ox, oz] of [
    [-0.19, -0.18],
    [0.19, -0.18],
    [-0.19, 0.18],
    [0.19, 0.18],
  ] as const) {
    const c = Math.cos(0.4);
    const s = Math.sin(0.4);
    parts.cyl(0.022, 0.022, 0.44, OAK_DARK, -1.4 + ox * c + oz * s, 0.22, -0.45 - ox * s + oz * c, 8);
  }
  parts.box(0.46, 0.5, 0.04, OAK, -1.4 - 0.2 * Math.sin(0.4), 0.74, -0.45 - 0.2 * Math.cos(0.4), 0.4, -0.08);

  // A brass-rimmed porthole on the port side: the cool fill comes in through it.
  parts.add(new TorusGeometry(0.2, 0.035, 8, 24), BRASS, X0 + 0.04, 1.5, 0.75, 0, Math.PI / 2);
  parts.add(new TorusGeometry(0.25, 0.02, 6, 24), BRASS, X0 + 0.03, 1.5, 0.75, 0, Math.PI / 2);

  const room = new Mesh(parts.merge(), woodMaterial());
  room.name = 'cabin room and props';
  room.castShadow = true;
  room.receiveShadow = true;
  group.add(room);
  const portMat = new MeshBasicNodeMaterial();
  portMat.colorNode = mix(color(0x9cc4e8), color(0xdcecf6), uv().y).mul(1.4);
  const port = new Mesh(new CircleGeometry(0.2, 24), portMat);
  port.position.set(X0 + 0.03, 1.5, 0.75);
  port.rotation.y = Math.PI / 2;
  group.add(port);

  // ---- outside the stern windows: golden-hour sky and sea ----
  const skyMat = new MeshBasicNodeMaterial();
  const sv = uv().y;
  const horizon = 0.42;
  const skyCol = mix(color(0xffb862), color(0x7b9fc9), smoothstep(horizon, 1.0, sv));
  const sunGlow = pow(
    float(1)
      .sub(
        uv()
          .sub(vec3(0.53, horizon + 0.05, 0).xy)
          .length()
          .mul(2.2),
      )
      .max(0),
    3,
  );
  const seaCol = mix(color(0x0e3a4f), color(0x6a8a8c), smoothstep(0.0, horizon, sv));
  const glitter = mx_noise_float(vec3(uv().x.mul(140), uv().y.mul(420), 0))
    .mul(0.5)
    .add(0.5);
  const sky = mix(
    seaCol.add(
      color(0xffc070).mul(
        pow(glitter, 6)
          .mul(smoothstep(0.1, horizon, sv))
          .mul(1.5),
      ),
    ),
    skyCol,
    smoothstep(horizon - 0.004, horizon + 0.004, sv),
  );
  const skyBright = uniform(1);
  skyMat.colorNode = sky
    .add(color(0xffd9a0).mul(sunGlow.mul(2.5)))
    .mul(skyBright)
    .mul(1.6);
  const outside = new Mesh(new PlaneGeometry(9, 5), skyMat);
  outside.position.set(0, 1.25, Z0 - 2.6);
  group.add(outside);

  // ---- the hero chest ----
  const chest = createHeroChest(opts.captainName);
  const chestAt = new Vector3(0, DESK_Y, -0.43);
  chest.group.position.copy(chestAt);
  group.add(chest.group);

  // ---- the lantern, hanging from the beam over the desk ----
  const lantern = new Group();
  lantern.position.set(-0.78, H - 0.16, 0.25);
  const lp = new Parts();
  lp.cyl(0.006, 0.006, 0.42, IRON, 0, -0.21, 0, 4);
  lp.add(new TorusGeometry(0.03, 0.006, 6, 12), IRON, 0, -0.44, 0, 0, 0, Math.PI / 2);
  lp.cyl(0.04, 0.11, 0.08, IRON, 0, -0.5, 0, 8);
  lp.cyl(0.115, 0.115, 0.02, IRON, 0, -0.55, 0, 8);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    lp.box(0.012, 0.22, 0.012, IRON, Math.cos(a) * 0.1, -0.67, Math.sin(a) * 0.1);
  }
  lp.cyl(0.12, 0.12, 0.025, IRON, 0, -0.79, 0, 8);
  lp.cyl(0.06, 0.08, 0.04, IRON, 0, -0.82, 0, 8);
  const lanternFrame = new Mesh(lp.merge(), woodMaterial());
  lantern.add(lanternFrame);
  const flameMat = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const flicker = uniform(1);
  flameMat.colorNode = color(0xffa040).mul(flicker.mul(2.2));
  flameMat.opacityNode = float(0.85);
  const glass = new Mesh(new CylinderGeometry(0.095, 0.095, 0.21, 8, 1, true), flameMat);
  glass.position.y = -0.67;
  const coreMat = new MeshBasicNodeMaterial();
  coreMat.colorNode = color(0xffe2a0).mul(flicker.mul(4));
  const core = new Mesh(new SphereGeometry(0.022, 10, 8), coreMat);
  core.scale.set(1, 1.8, 1);
  core.position.y = -0.68;
  lantern.add(glass, core);
  const lanternLight = new PointLight(0xffa860, 4.5, 6, 1.6);
  lanternLight.position.y = -0.66;
  lantern.add(lanternLight);
  lantern.scale.setScalar(0.8);
  group.add(lantern);
  // The candle by the books: a small warm flame and its light on the chest's right side.
  const candleFlameMat = new MeshBasicNodeMaterial();
  candleFlameMat.colorNode = color(0xffd890).mul(flicker.mul(5));
  const candleFlame = new Mesh(new SphereGeometry(0.009, 8, 6), candleFlameMat);
  candleFlame.scale.set(1, 2.2, 1);
  candleFlame.position.set(0.55, DESK_Y + 0.152, -0.48);
  group.add(candleFlame);
  const candleLight = new PointLight(0xffa458, 0.9, 1.8, 1.6);
  candleLight.position.set(0.5, DESK_Y + 0.2, -0.3);
  group.add(candleLight);

  // ---- light: warm sun through the stern windows (key/rim), lantern (key), cool fill ----
  // The low sun pours in through the stern windows: mullion shadows on the desk and the floor.
  const SUN_DIR = new Vector3(0.28, -0.42, 1).normalize();
  const sun = new DirectionalLight(0xffb868, 4.2);
  sun.target.position.set(0, DESK_Y, 0.1);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, -6);
  if (opts.shadowMap > 0) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(opts.shadowMap, opts.shadowMap);
    const sc = sun.shadow.camera;
    sc.left = -2.6;
    sc.right = 2.6;
    sc.top = 2.2;
    sc.bottom = -2.2;
    sc.near = 2;
    sc.far = 10;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.01;
    sun.shadow.radius = 3;
  }
  group.add(sun, sun.target);
  // Cool fill: blue sky through the porthole and a soft bounce everywhere.
  const fill = new HemisphereLight(0x9ab8e0, 0x2a1a10, 0.42);
  group.add(fill);
  const portLight = new PointLight(0x8fb4e6, 3.2, 4.5, 1.4);
  portLight.position.set(X0 + 0.4, 1.45, 0.75);
  group.add(portLight);
  group.add(createSunShafts(SUN_DIR, Z0, WIN_W, WIN_Y0, WIN_Y1, opts.shaftSlices));
  const motes = createDustMotes(SUN_DIR, Z0, WIN_W, WIN_Y0, WIN_Y1);
  group.add(motes.mesh);
  const chestLight = new PointLight(0xffd690, 0, 2.2, 1.8);
  chestLight.position.set(0, chest.height + 0.12, 0);
  chest.group.add(chestLight);
  // The keyhole's light spills warm on the desk in front of the chest while it waits.
  const keyLight = new PointLight(0xffc35a, 0, 0.9, 2);
  keyLight.position.set(0, chest.height - 0.12, chest.depth / 2 + 0.08);
  chest.group.add(keyLight);
  const puff = createDustPuff(chest);
  const sparks = createSparkles(chest);
  chest.group.add(puff.mesh, sparks.mesh);

  let sway = 0;
  return {
    group,
    deskY: DESK_Y,
    chestAt,
    chest,
    lantern,
    lanternLight,
    chestLight,
    sun,
    puff: puff.t,
    setCaptainName: (name) => chest.setName(name),
    sparks: sparks.t,
    setCamera(cam) {
      camRight.value.setFromMatrixColumn(cam.matrixWorld, 0);
      camUp.value.setFromMatrixColumn(cam.matrixWorld, 1);
    },
    update(dt, t, reduced) {
      // The lantern swings gently with the ship's roll; the flame flickers.
      sway = reduced ? 0 : Math.sin(t * 0.9) * 0.07 + Math.sin(t * 0.37) * 0.04;
      lantern.rotation.z = sway;
      lantern.rotation.x = reduced ? 0 : Math.sin(t * 0.71 + 1) * 0.035;
      const f = reduced
        ? 1
        : 0.92 + Math.sin(t * 13) * 0.03 + Math.sin(t * 23.7) * 0.025 + Math.sin(t * 7.3) * 0.02;
      flicker.value = f;
      lanternLight.intensity = 4.5 * f;
      candleLight.intensity = 0.9 * (0.94 + Math.sin(t * 17.3) * 0.04 + Math.sin(t * 9.1) * 0.03);
      motes.time.value = t;
      sparks.time.value = t;
      chestLight.intensity = chest.glow.value * 3.2 * f;
      keyLight.intensity = chest.keyhole.value * 0.5 * f;
      void dt;
    },
    dispose() {
      group.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as MeshStandardNodeMaterial).dispose();
        }
      });
      lanternLight.dispose();
      chestLight.dispose();
      keyLight.dispose();
      sun.dispose();
      fill.dispose();
      portLight.dispose();
      candleLight.dispose();
    },
  };
}

/**
 * The Captain's Chest: a heavy planked oak sea chest with iron straps and rivets, brass corners and a
 * lock plate, a domed planked lid on a hinge with a hasp that swings up off its staple, a red velvet
 * lining, and a brass nameplate engraved with the captain's name. Its inside glows when it opens.
 */
function createHeroChest(captainName: string): HeroChest {
  const W = 0.86;
  const H = 0.4;
  const D = 0.46;
  const LID = 0.13;
  const group = new Group();
  group.name = 'captains chest';
  const rand = mulberry32(0xc4e57);
  const body = new Parts();
  // The carcass (dark, showing between the planks) and a heavier plinth.
  body.box(W - 0.01, H - 0.01, D - 0.01, OAK_DARK, 0, H / 2, 0);
  body.box(W + 0.03, 0.05, D + 0.03, OAK_DARK, 0, 0.025, 0);
  // Planks: vertical on the front and back, horizontal on the ends, each a slightly different oak.
  const PW = (W - 0.02) / 7;
  for (let i = 0; i < 7; i++) {
    const x = -W / 2 + 0.01 + PW * (i + 0.5);
    for (const sz of [-1, 1])
      body.box(PW - 0.006, H - 0.06, 0.022, jitter(OAK, 0.85 + rand() * 0.3), x, H / 2 + 0.02, sz * (D / 2));
  }
  for (const sx of [-1, 1])
    for (let j = 0; j < 3; j++)
      body.box(
        0.022,
        (H - 0.06) / 3 - 0.006,
        D - 0.02,
        jitter(OAK, 0.85 + rand() * 0.3),
        sx * (W / 2),
        0.05 + ((H - 0.06) / 3) * (j + 0.5),
        0,
      );
  // Iron straps round the body, with rivets.
  const strapX = [-W / 2 + 0.15, W / 2 - 0.15];
  for (const x of strapX) {
    body.box(0.05, H + 0.004, D + 0.05, IRON, x, H / 2 + 0.002, 0);
    for (const sz of [-1, 1])
      for (let k = 0; k < 4; k++)
        body.add(new SphereGeometry(0.009, 6, 4), IRON, x, 0.07 + k * 0.09, sz * (D / 2 + 0.026));
  }
  body.box(W + 0.05, 0.035, D + 0.05, IRON, 0, H - 0.02, 0);
  // Brass corner brackets (an L of thin plate round each vertical edge), studded.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      for (const y of [0.075, H - 0.07]) {
        const ex = (sx * W) / 2;
        const ez = (sz * D) / 2;
        body.box(0.06, 0.08, 0.006, BRASS, ex - sx * 0.026, y, ez + sz * 0.014);
        body.box(0.006, 0.08, 0.06, BRASS, ex + sx * 0.014, y, ez - sz * 0.026);
        body.add(new SphereGeometry(0.007, 6, 4), BRASS, ex - sx * 0.035, y, ez + sz * 0.018);
      }
  // The brass lock plate with its keyhole, and the staple the hasp drops over.
  body.box(0.1, 0.12, 0.01, BRASS, 0, H - 0.11, D / 2 + 0.028);
  body.box(0.012, 0.03, 0.004, [0.03, 0.02, 0.01], 0, H - 0.125, D / 2 + 0.034);
  body.add(new SphereGeometry(0.009, 8, 6), [0.03, 0.02, 0.01], 0, H - 0.105, D / 2 + 0.032);
  body.add(new TorusGeometry(0.018, 0.005, 6, 12), IRON, 0, H - 0.065, D / 2 + 0.04);
  // Iron ring handles on the ends.
  for (const sx of [-1, 1]) {
    body.box(0.012, 0.07, 0.07, IRON, sx * (W / 2 + 0.03), H * 0.62, 0);
    body.add(new TorusGeometry(0.05, 0.009, 6, 16), IRON, sx * (W / 2 + 0.04), H * 0.55, 0, 0, Math.PI / 2);
  }
  // Red velvet lining inside (seen when the lid's up).
  body.box(W - 0.06, 0.012, D - 0.06, [0.09, 0.018, 0.024], 0, H - 0.02, 0);
  const mat = woodMaterial();
  const bodyMesh = new Mesh(body.merge(), mat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  // The nameplate: the captain's name engraved on brass, on the body's front.
  const plate = nameplate(captainName);
  plate.mesh.position.set(0, 0.13, D / 2 + 0.024);
  group.add(plate.mesh);

  // The domed lid, planked along its length, hinged along the back top edge.
  const hinge = new Group();
  hinge.position.set(0, H, -D / 2);
  const lid = new Parts();
  const SEG = 7;
  for (let i = 0; i < SEG; i++) {
    const a0 = -Math.PI / 2 + (Math.PI * i) / SEG;
    const strip = new CylinderGeometry(D / 2, D / 2, W, 3, 1, false, a0 + 0.012, Math.PI / SEG - 0.024);
    strip.scale(1, 1, LID / (D / 2));
    lid.add(strip, jitter(OAK, 0.85 + rand() * 0.3), 0, 0, D / 2, 0, 0, Math.PI / 2);
  }
  const under = new CylinderGeometry(
    D / 2 - 0.012,
    D / 2 - 0.012,
    W - 0.01,
    14,
    1,
    false,
    -Math.PI / 2,
    Math.PI,
  );
  under.scale(1, 1, (LID - 0.012) / (D / 2 - 0.012));
  lid.add(under, OAK_DARK, 0, 0, D / 2, 0, 0, Math.PI / 2);
  for (const x of strapX) {
    const band = new CylinderGeometry(D / 2 + 0.01, D / 2 + 0.01, 0.05, 20, 1, false, -Math.PI / 2, Math.PI);
    band.scale(1, 1, (LID + 0.01) / (D / 2 + 0.01));
    lid.add(band, IRON, x, 0, D / 2, 0, 0, Math.PI / 2);
  }
  lid.box(W + 0.03, 0.03, 0.03, IRON, 0, 0.012, D - 0.002);
  lid.box(W + 0.03, 0.03, 0.03, IRON, 0, 0.012, 0.002);
  lid.box(W - 0.06, 0.008, D - 0.06, [0.08, 0.016, 0.022], 0, 0.006, D / 2);
  const lidMesh = new Mesh(lid.merge(), mat);
  lidMesh.castShadow = true;
  lidMesh.receiveShadow = true;
  hinge.add(lidMesh);
  // The hasp: a shaped brass strap hanging from the lid's front edge over the staple.
  const hasp = new Group();
  hasp.position.set(0, 0.02, D + 0.03);
  const hp = new Parts();
  hp.box(0.05, 0.13, 0.01, BRASS, 0, -0.055, 0);
  hp.box(0.07, 0.03, 0.012, BRASS, 0, -0.115, 0);
  hp.cyl(0.01, 0.01, 0.07, BRASS, 0, 0, 0, 8, 0, Math.PI / 2);
  hasp.add(new Mesh(hp.merge(), mat));
  hinge.add(hasp);
  group.add(hinge);

  // The warm glow from inside: an additive veil over the opening.
  const glow = uniform(0);
  const glowMat = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const r = uv().sub(0.5).length().mul(2);
  glowMat.colorNode = color(0xffd690).mul(glow.mul(1.6));
  glowMat.opacityNode = float(1).sub(smoothstep(0.2, 1.0, r));
  const veil = new Mesh(new PlaneGeometry(W * 0.95, D * 0.95), glowMat);
  veil.rotation.x = -Math.PI / 2;
  veil.position.y = H + 0.004;
  group.add(veil);

  // Light through the keyhole (and a soft halo on the lock plate) while the chest waits to open.
  const keyhole = uniform(0);
  const khMat = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const kr = uv().sub(0.5).length().mul(2);
  khMat.colorNode = color(0xffc864).mul(keyhole.mul(2.4));
  khMat.opacityNode = pow(float(1).sub(smoothstep(0.0, 1.0, kr)), 2.5);
  const kh = new Mesh(new PlaneGeometry(0.11, 0.11), khMat);
  kh.position.set(0, H - 0.118, D / 2 + 0.036);
  kh.renderOrder = 6;
  group.add(kh);

  return {
    group,
    setName: plate.set,
    hinge,
    hasp,
    inside: new Vector3(0, H * 0.5, 0),
    glow,
    keyhole,
    width: W,
    height: H,
    depth: D,
  };
}

/** A small brass plate engraved with the captain's name (Canvas 2D, made once). */
function nameplate(name: string): { mesh: Mesh; set(name: string): void } {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  const draw = (who: string) => {
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#e6c06a');
    grad.addColorStop(0.5, '#b88a34');
    grad.addColorStop(1, '#8a6224');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#5a3f15';
    g.lineWidth = 6;
    g.strokeRect(8, 8, 496, 112);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const text = who.trim() ? `Captain ${who.trim()}` : 'The Captain';
    let size = 58;
    g.font = `italic 600 ${size}px Fraunces, Georgia, serif`;
    while (g.measureText(text).width > 440 && size > 24)
      g.font = `italic 600 ${(size -= 2)}px Fraunces, Georgia, serif`;
    g.fillStyle = 'rgba(255, 236, 180, 0.6)';
    g.fillText(text, 256, 66);
    g.fillStyle = '#3a2508';
    g.fillText(text, 256, 63);
  };
  draw(name);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  // Mostly diffuse: there's no environment map in the cabin, so a true metal would read black.
  const m = new MeshStandardNodeMaterial({ map: tex, roughness: 0.42, metalness: 0.15 });
  const mesh = new Mesh(new PlaneGeometry(0.26, 0.065), m);
  mesh.name = 'nameplate';
  return {
    mesh,
    set(who) {
      draw(who);
      tex.needsUpdate = true;
    },
  };
}

/** A soft puff of dust from the lid's seam as it opens (0 → 1 over the puff). */
function createDustPuff(chest: HeroChest) {
  const t = uniform(0);
  const N = 26;
  const geo = billboardGeometry(N, (i, out) => {
    const a = (i / N) * Math.PI * 2;
    out.set(Math.cos(a) * chest.width * 0.48, chest.height + 0.01, Math.sin(a) * chest.depth * 0.48);
  });
  const mesh = billboardMesh(
    geo,
    (a, m) => {
      const e = float(1).sub(pow(float(1).sub(t), 3));
      const out = a.centre.mul(vec3(e.mul(0.6), 0, e.mul(0.6)));
      const centre = a.centre.add(out).add(vec3(0, e.mul(a.seed.mul(0.12).add(0.04)), 0));
      m.colorNode = color(0xd9c3a0);
      m.opacityNode = a.round
        .mul(a.round)
        .mul(pow(float(1).sub(t), 2))
        .mul(smoothstep(0, 0.05, t))
        .mul(0.35);
      return { centre, size: e.mul(0.05).add(0.02).mul(a.seed.mul(0.6).add(0.7)) };
    },
    false,
  );
  mesh.name = 'dust puff';
  mesh.renderOrder = 5;
  return { mesh, t };
}

/** Golden sparkles drifting up out of the open chest while it glows (strength 0 → 1). */
function createSparkles(chest: HeroChest) {
  const t = uniform(0);
  const time = uniform(0);
  const N = 70;
  const rand = mulberry32(0x5a4c);
  const geo = billboardGeometry(N, (_, out) => {
    out.set((rand() - 0.5) * chest.width * 0.8, chest.height, (rand() - 0.5) * chest.depth * 0.7);
  });
  const mesh = billboardMesh(geo, (a, m) => {
    const life = fract(time.mul(0.28).add(a.seed.mul(7.3)));
    const centre = a.centre.add(
      vec3(
        sin(time.mul(1.1).add(a.seed.mul(40)))
          .mul(0.05)
          .mul(life),
        life.mul(0.55),
        sin(time.mul(0.9).add(a.seed.mul(23)))
          .mul(0.04)
          .mul(life),
      ),
    );
    const tw = sin(time.mul(9).add(a.seed.mul(80)))
      .mul(0.4)
      .add(0.6);
    m.colorNode = color(0xffd27a).mul(3.5);
    m.opacityNode = a.round
      .mul(a.round)
      .mul(t)
      .mul(tw)
      .mul(smoothstep(0, 0.12, life))
      .mul(float(1).sub(life));
    return { centre, size: a.seed.mul(0.006).add(0.004) };
  });
  mesh.name = 'chest sparkles';
  mesh.renderOrder = 6;
  return { mesh, t, time };
}

/** How far a point is inside a stern window's sunbeam (0 outside → 1 in), traced back along the sun. */
function windowBeam(
  p: Node<'vec3'>,
  dir: Vector3,
  z0: number,
  winW: number,
  y0: number,
  y1: number,
): Node<'float'> {
  const back = p.z.sub(z0).div(dir.z);
  const hit = p.sub(vec3(dir.x, dir.y, dir.z).mul(back));
  const cx = abs(fract(hit.x.add(0.95 / 2).div(0.95)).sub(0.5)).mul(0.95);
  const inX = float(1)
    .sub(smoothstep(winW / 2 - 0.08, winW / 2, cx))
    .mul(float(1).sub(smoothstep(1.3, 1.4, abs(hit.x))));
  const inY = smoothstep(y0, y0 + 0.06, hit.y).mul(float(1).sub(smoothstep(y1 - 0.06, y1, hit.y)));
  // The mullions' cross (thin bars through each window's middle) cut the beam too.
  const barX = smoothstep(0.008, 0.02, cx);
  const barY = smoothstep(0.008, 0.02, abs(hit.y.sub((y0 + y1) / 2)));
  return inX
    .mul(inY)
    .mul(barX)
    .mul(barY)
    .mul(smoothstep(0, 0.2, back));
}

/**
 * Sunbeams as a stack of additive slices across the room: each slice glows only where the window's
 * beam (frames and mullions included) passes through it, so together they read as soft volumetric
 * shafts. The slice count scales with the tier (fill rate).
 */
function createSunShafts(
  dir: Vector3,
  z0: number,
  winW: number,
  y0: number,
  y1: number,
  slices: number,
): Mesh {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < slices; i++) {
    const g = new PlaneGeometry(4.6, 2.4);
    g.translate(0, 1.2, z0 + 0.12 + (i + 0.5) * (3.0 / slices));
    parts.push(g);
  }
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  const m = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: 2,
  });
  const beam = windowBeam(positionLocal, dir, z0, winW, y0, y1);
  const depth = positionLocal.z.sub(z0).div(3.0);
  const shimmer = mx_noise_float(positionLocal.mul(vec3(1.6, 1.6, 0.6)))
    .mul(0.35)
    .add(0.8);
  m.colorNode = color(0xffc27a);
  m.opacityNode = beam
    .mul(pow(float(1).sub(depth), 1.4))
    .mul(shimmer)
    .mul(0.9 / slices);
  const mesh = new Mesh(g, m);
  mesh.name = 'sun shafts';
  mesh.renderOrder = 3;
  mesh.visible = slices > 0;
  return mesh;
}

/** Dust drifting in the sunbeams: tiny billboards that only glow where the sun reaches them. */
function createDustMotes(dir: Vector3, z0: number, winW: number, y0: number, y1: number) {
  const N = 260;
  const rand = mulberry32(0xd057);
  const geo = billboardGeometry(N, (i, out) => {
    const k = rand() * 2.8;
    const wx = [-0.95, 0, 0.95][i % 3]!;
    out.set(
      wx + (rand() - 0.5) * winW + dir.x * k,
      y0 + rand() * (y1 - y0) + dir.y * k,
      z0 + 0.1 + dir.z * k,
    );
  });
  const time = uniform(0);
  const mesh = billboardMesh(geo, (a, m) => {
    const sd = a.seed;
    const drift = vec3(
      sin(time.mul(0.11).add(sd.mul(40))).mul(0.12),
      sin(time.mul(0.07).add(sd.mul(17)))
        .mul(0.08)
        .add(fract(time.mul(0.008).add(sd)).sub(0.5).mul(0.1)),
      sin(time.mul(0.09).add(sd.mul(29))).mul(0.1),
    );
    const centre = a.centre.add(drift);
    const beam = windowBeam(centre, dir, z0, winW, y0, y1);
    const twinkle = sin(time.mul(1.3).add(sd.mul(60)))
      .mul(0.3)
      .add(0.7);
    m.colorNode = color(0xffe2b0).mul(3);
    m.opacityNode = beam.mul(a.round).mul(twinkle).mul(0.9);
    return { centre, size: mix(float(0.0025), float(0.006), sd) };
  });
  mesh.name = 'dust motes';
  mesh.renderOrder = 4;
  return { mesh, time };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
