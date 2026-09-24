import { Euler, Matrix4, Quaternion, Vector3 } from 'three/webgpu';

export const HOUSE_UNIT = 2;
export const HOUSE_STOREY_HEIGHT = 3.12;

export type HouseSide = 'front' | 'back' | 'left' | 'right';
export type HouseGround = 'unevenbrick' | 'plaster';
export type HouseUpper = 'plaster' | 'woodgrid' | 'mixed';
export type HouseRoof = 'gable' | 'tower';
export type HouseWindowPattern =
  'regular' | 'sparse' | 'busy' | Partial<Record<HouseSide, readonly number[]>>;
export type HouseWidth = 4 | 6 | 8;
export type HouseDepth = 4 | 6 | 8;

export interface HouseFootprint {
  w: HouseWidth;
  d: HouseDepth;
}

export interface HouseSpec {
  id?: string;
  footprint: HouseFootprint;
  storeys: 1 | 2 | 3;
  ground: HouseGround;
  upper: HouseUpper;
  doorSide: HouseSide;
  doorSegment?: number;
  windows?: HouseWindowPattern;
  roof: HouseRoof;
  dormers?: boolean | number;
  chimney?: boolean;
  balcony?: boolean;
  overhang?: boolean;
  stairs?: boolean;
  vines?: boolean | number;
  seed?: number;
  origin?: { x?: number; y?: number; z?: number };
  rotY?: number;
  tint?: number;
  roofTint?: number;
}

export type HousePieceRole =
  | 'wall'
  | 'corner'
  | 'floor'
  | 'roof'
  | 'gable'
  | 'door'
  | 'doorframe'
  | 'window'
  | 'shutters'
  | 'balcony'
  | 'balcony-floor'
  | 'stairs'
  | 'vine'
  | 'chimney'
  | 'dormer';

export interface PiecePlacement {
  piece: string;
  matrix: Matrix4;
  position: { x: number; y: number; z: number };
  rotY: number;
  scale: 1;
  role: HousePieceRole;
  side?: HouseSide;
  storey?: number;
  segment?: number;
  local: { x: number; y: number; z: number };
  contactY?: number;
  tint?: number;
}

type Bounds = readonly [minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number];

export const HOUSE_PIECE_BOUNDS = {
  Wall_UnevenBrick_Straight: [-1, 0, -0.314, 1, 3.123, 0.092],
  Wall_UnevenBrick_Door_Round: [-1, 0, -0.314, 1, 3.123, 0.092],
  Wall_UnevenBrick_Window_Wide_Round: [-1, 0, -0.314, 1, 3.123, 0.092],
  Wall_UnevenBrick_Window_Wide_Flat: [-1, 0, -0.314, 1, 3.123, 0.092],
  Wall_UnevenBrick_Window_Thin_Round: [-1, 0, -0.314, 1, 3.123, 0.092],
  Wall_Plaster_Straight: [-1, -0.002, -0.314, 1, 3.123, 0.092],
  Wall_Plaster_Straight_Base: [-1, 0, -0.314, 1, 3.123, 0.092],
  Wall_Plaster_WoodGrid: [-1, 0, -0.314, 1, 3.123, 0.092],
  Wall_Plaster_Door_Round: [-1, 0, -0.314, 1, 3.123, 0.092],
  Wall_Plaster_Window_Wide_Flat: [-1, 0, -0.314, 1, 3.123, 0.092],
  Wall_Plaster_Window_Wide_Round: [-1, 0, -0.314, 1, 3.123, 0.092],
  Wall_Plaster_Window_Thin_Round: [-1, 0, -0.314, 1, 3.123, 0.092],
  Corner_Exterior_Wood: [-0.105, 0, -0.12, 0.105, 3, 0.12],
  Door_1_Round: [-0.046, 0.033, -0.058, 1.074, 2.351, 0.063],
  DoorFrame_Round_WoodDark: [-0.703, -0.009, -0.24, 0.703, 2.555, 0.299],
  Window_Wide_Round1: [-0.682, 1.016, -0.252, 0.682, 2.742, 0.277],
  Window_Wide_Flat1: [-0.804, 0.944, -0.267, 0.804, 2.524, 0.417],
  Window_Thin_Round1: [-0.444, 1.016, -0.252, 0.444, 2.621, 0.092],
  WindowShutters_Wide_Round_Open: [-1.2, 1.093, 0.091, 1.104, 2.74, 0.563],
  WindowShutters_Wide_Flat_Open: [-1.239, 1.093, 0.137, 1.242, 2.517, 0.593],
  WindowShutters_Thin_Round_Open: [-0.82, 1.093, 0.059, 0.787, 2.612, 0.436],
  Floor_UnevenBrick: [-1, -0.01, -1, 1, 0.01, 1],
  Floor_WoodLight: [-1, -0.01, -1, 1, 0.01, 1],
  Balcony_Cross_Straight: [-1, -0.105, 0.898, 1, 1.125, 1.104],
  Stairs_Exterior_Straight: [-1, -0.204, -1.077, 1, 1, 1.001],
  Overhang_Plaster_Long: [-1, 0, -0.2, 1, 3.028, 2],
  Roof_RoundTiles_4x4: [-2.757, -0.516, -2.74, 2.757, 3.734, 2.822],
  Roof_RoundTiles_4x6: [-2.757, -0.516, -3.786, 2.757, 3.718, 3.786],
  Roof_RoundTiles_4x8: [-2.757, -0.516, -4.829, 2.757, 3.713, 4.854],
  Roof_RoundTiles_6x4: [-4.125, -0.782, -0.138, 4.125, 4.89, 4.854],
  Roof_RoundTiles_6x6: [-4.125, -0.782, -3.938, 4.125, 4.89, 4.094],
  Roof_RoundTiles_6x8: [-4.125, -0.782, -4.829, 4.125, 4.89, 4.854],
  Roof_RoundTiles_8x8: [-4.976, -0.78, -5.085, 4.976, 6.001, 5.247],
  Roof_Front_Brick4: [-2.184, -0.132, -0.335, 2.216, 2.937, 0.794],
  Roof_Front_Brick6: [-3.347, -0.132, -0.335, 3.348, 4.384, 0.794],
  Roof_Front_Brick8: [-4.255, -0.132, -0.335, 4.256, 5.314, 0.794],
  Roof_Dormer_RoundTile: [-0.066, 0.03, -1.22, 1.9, 2.703, 1.22],
  Roof_Tower_RoundTiles: [-2.825, -0.572, -2.714, 2.825, 6.789, 2.714],
  Prop_Chimney: [-0.5, 0, -0.5, 0.446, 3.178, 0.5],
  Prop_Chimney2: [-0.5, 0, -0.494, 0.446, 3, 0.494],
  Prop_Vine1: [-0.783, -2.121, -0.045, 0.753, 0.482, 0.174],
  Prop_Vine2: [-0.494, -2.121, -0.045, 0.892, 0.482, 0.169],
  Prop_Vine4: [-0.718, -1.014, -0.027, 0.298, 0.574, 0.123],
} as const satisfies Record<string, Bounds>;

export const VILLAGE_HOUSE_PIECES = Object.freeze(Object.keys(HOUSE_PIECE_BOUNDS));

const ROOF_BY_FOOTPRINT = {
  '4x4': 'Roof_RoundTiles_4x4',
  '4x6': 'Roof_RoundTiles_4x6',
  '4x8': 'Roof_RoundTiles_4x8',
  '6x4': 'Roof_RoundTiles_6x4',
  '6x6': 'Roof_RoundTiles_6x6',
  '6x8': 'Roof_RoundTiles_6x8',
  '8x8': 'Roof_RoundTiles_8x8',
} as const;

const FRONT_BALCONY_SEGMENTS: Record<HouseWidth, readonly number[]> = {
  4: [0],
  6: [0, 1],
  8: [1, 2],
};

const tmpPosition = new Vector3();
const tmpQuaternion = new Quaternion();
const tmpScale = new Vector3();

export function buildHouse(spec: HouseSpec): PiecePlacement[] {
  const placements: PiecePlacement[] = [];
  const root = rootMatrix(spec);
  const doorSegment = clampedDoorSegment(spec);
  const seed = spec.seed ?? 1;

  for (let storey = 0; storey < spec.storeys; storey += 1) {
    for (const side of HOUSE_SIDES) {
      const segments = sideSegments(spec.footprint, side);
      for (let segment = 0; segment < segments; segment += 1) {
        const local = sideSegmentLocal(spec.footprint, side, segment);
        const isDoor = storey === 0 && side === spec.doorSide && segment === doorSegment;
        const window = !isDoor && hasWindow(spec, side, storey, segment, seed);
        const wall = wallPiece(spec, storey, isDoor, window, side, segment, seed);
        placements.push(
          place(
            root,
            spec,
            wall,
            'wall',
            local.x,
            storey * HOUSE_STOREY_HEIGHT,
            local.z,
            sideRotation(side),
            {
              bottom: true,
              side,
              storey,
              segment,
              tint: wall.startsWith('Wall_Plaster') || wall.startsWith('Overhang') ? spec.tint : undefined,
            },
          ),
        );
        if (isDoor) addDoorPlacements(placements, root, spec, side, segment, local);
        else if (window) addWindowPlacements(placements, root, spec, side, storey, segment, local, seed);
      }
    }
    addFloorGrid(placements, root, spec, storey);
    addCorners(placements, root, spec, storey);
  }

  addRoof(placements, root, spec);
  if (spec.balcony && spec.storeys > 1) addBalcony(placements, root, spec);
  if (spec.stairs) addStairs(placements, root, spec, doorSegment);
  if (spec.vines) addVines(placements, root, spec);
  return placements;
}

export function houseDoorAnchor(spec: HouseSpec): { x: number; y: number; z: number; heading: number } {
  const segment = clampedDoorSegment(spec);
  const wall = sideSegmentLocal(spec.footprint, spec.doorSide, segment);
  const normal = sideNormal(spec.doorSide);
  const local = { x: wall.x + normal.x * 0.9, z: wall.z + normal.z * 0.9 };
  const world = localToWorld(spec, local.x, local.z);
  return {
    x: world.x,
    y: spec.origin?.y ?? 0,
    z: world.z,
    heading: (spec.rotY ?? 0) + sideRotation(spec.doorSide),
  };
}

export function housePerches(spec: HouseSpec, placements = buildHouse(spec)): Vector3[] {
  const perches: Vector3[] = [];
  const roof = placements.find((placement) => placement.role === 'roof');
  if (roof) {
    const bounds = pieceBounds(roof.piece);
    const y = roof.position.y + bounds[4] - 0.12;
    for (const lz of [-spec.footprint.d * 0.28, spec.footprint.d * 0.28]) {
      const p = localToWorld(spec, 0, lz);
      perches.push(new Vector3(p.x, y, p.z));
    }
  }
  for (const chimney of placements.filter((placement) => placement.role === 'chimney')) {
    const bounds = pieceBounds(chimney.piece);
    perches.push(new Vector3(chimney.position.x, chimney.position.y + bounds[4], chimney.position.z));
  }
  return perches;
}

export function placementWorldMinY(placement: PiecePlacement): number {
  return placement.position.y + pieceBounds(placement.piece)[1];
}

export function placementWorldMaxY(placement: PiecePlacement): number {
  return placement.position.y + pieceBounds(placement.piece)[4];
}

function addDoorPlacements(
  placements: PiecePlacement[],
  root: Matrix4,
  spec: HouseSpec,
  side: HouseSide,
  segment: number,
  local: { x: number; z: number },
): void {
  placements.push(
    place(root, spec, 'DoorFrame_Round_WoodDark', 'doorframe', local.x, 0, local.z, sideRotation(side), {
      bottom: true,
      centerX: true,
      side,
      storey: 0,
      segment,
    }),
    place(root, spec, 'Door_1_Round', 'door', local.x, 0, local.z, sideRotation(side), {
      bottom: true,
      centerX: true,
      side,
      storey: 0,
      segment,
    }),
  );
}

function addWindowPlacements(
  placements: PiecePlacement[],
  root: Matrix4,
  spec: HouseSpec,
  side: HouseSide,
  storey: number,
  segment: number,
  local: { x: number; z: number },
  seed: number,
): void {
  const thin = isThinWindow(spec, side, storey, segment, seed);
  const round = storey === 0 || hash(seed, storey, segment, sideIndex(side)) % 3 !== 0;
  const window = thin ? 'Window_Thin_Round1' : round ? 'Window_Wide_Round1' : 'Window_Wide_Flat1';
  const shutters = thin
    ? 'WindowShutters_Thin_Round_Open'
    : round
      ? 'WindowShutters_Wide_Round_Open'
      : 'WindowShutters_Wide_Flat_Open';
  placements.push(
    place(root, spec, window, 'window', local.x, storey * HOUSE_STOREY_HEIGHT, local.z, sideRotation(side), {
      centerX: true,
      side,
      storey,
      segment,
    }),
    place(
      root,
      spec,
      shutters,
      'shutters',
      local.x,
      storey * HOUSE_STOREY_HEIGHT,
      local.z,
      sideRotation(side),
      {
        centerX: true,
        side,
        storey,
        segment,
      },
    ),
  );
}

function addFloorGrid(placements: PiecePlacement[], root: Matrix4, spec: HouseSpec, storey: number): void {
  const floorPiece = storey === 0 ? 'Floor_UnevenBrick' : 'Floor_WoodLight';
  for (let lx = -spec.footprint.w * 0.5 + 1; lx < spec.footprint.w * 0.5; lx += HOUSE_UNIT) {
    for (let lz = -spec.footprint.d * 0.5 + 1; lz < spec.footprint.d * 0.5; lz += HOUSE_UNIT) {
      placements.push(
        place(root, spec, floorPiece, 'floor', lx, storey * HOUSE_STOREY_HEIGHT, lz, 0, {
          bottom: true,
          storey,
        }),
      );
    }
  }
}

function addCorners(placements: PiecePlacement[], root: Matrix4, spec: HouseSpec, storey: number): void {
  const { w, d } = spec.footprint;
  const corners = [
    [-w * 0.5, -d * 0.5, Math.PI],
    [w * 0.5, -d * 0.5, Math.PI / 2],
    [w * 0.5, d * 0.5, 0],
    [-w * 0.5, d * 0.5, -Math.PI / 2],
  ] as const;
  for (const [lx, lz, ry] of corners) {
    placements.push(
      place(root, spec, 'Corner_Exterior_Wood', 'corner', lx, storey * HOUSE_STOREY_HEIGHT, lz, ry, {
        bottom: true,
        storey,
      }),
    );
  }
}

function addRoof(placements: PiecePlacement[], root: Matrix4, spec: HouseSpec): void {
  const roofY = spec.storeys * HOUSE_STOREY_HEIGHT;
  if (spec.roof === 'tower') {
    placements.push(
      place(root, spec, 'Roof_Tower_RoundTiles', 'roof', 0, roofY, 0, 0, {
        bottom: true,
        centerZ: true,
        tint: spec.roofTint,
      }),
    );
    return;
  }

  const roof = roofPiece(spec.footprint);
  placements.push(
    place(root, spec, roof, 'roof', 0, roofY, 0, 0, {
      bottom: true,
      centerZ: true,
      tint: spec.roofTint,
    }),
  );
  const front = roofFrontPiece(spec.footprint.w);
  for (const side of ['front', 'back'] as const) {
    const lz = side === 'front' ? -spec.footprint.d * 0.5 : spec.footprint.d * 0.5;
    placements.push(
      place(root, spec, front, 'gable', 0, roofY, lz, sideRotation(side), {
        bottom: true,
        centerX: true,
        side,
      }),
    );
  }

  const dormers = spec.dormers === true ? (spec.footprint.w >= 6 ? 2 : 1) : Number(spec.dormers || 0);
  for (let i = 0; i < dormers; i += 1) {
    const lx = dormers === 1 ? -0.82 : i === 0 ? -1.7 : 0.55;
    placements.push(
      place(
        root,
        spec,
        'Roof_Dormer_RoundTile',
        'dormer',
        lx,
        roofY + 0.62,
        -spec.footprint.d * 0.24,
        Math.PI,
        {
          bottom: true,
          centerX: true,
          tint: spec.roofTint,
        },
      ),
    );
  }
  if (spec.chimney) {
    placements.push(
      place(
        root,
        spec,
        spec.storeys > 2 ? 'Prop_Chimney2' : 'Prop_Chimney',
        'chimney',
        spec.footprint.w * 0.28,
        roofY + 0.95,
        spec.footprint.d * 0.08,
        0,
        {
          bottom: true,
        },
      ),
    );
  }
}

function addBalcony(placements: PiecePlacement[], root: Matrix4, spec: HouseSpec): void {
  const y = HOUSE_STOREY_HEIGHT;
  for (const segment of FRONT_BALCONY_SEGMENTS[spec.footprint.w]) {
    const lx = -spec.footprint.w * 0.5 + 1 + segment * HOUSE_UNIT;
    placements.push(
      place(root, spec, 'Floor_WoodLight', 'balcony-floor', lx, y, -spec.footprint.d * 0.5 - 1, 0, {
        bottom: true,
        side: 'front',
        storey: 1,
        segment,
      }),
      place(root, spec, 'Balcony_Cross_Straight', 'balcony', lx, y + 0.12, -spec.footprint.d * 0.5, Math.PI, {
        bottom: true,
        side: 'front',
        storey: 1,
        segment,
      }),
    );
  }
}

function addStairs(placements: PiecePlacement[], root: Matrix4, spec: HouseSpec, doorSegment: number): void {
  const door = sideSegmentLocal(spec.footprint, spec.doorSide, doorSegment);
  const normal = sideNormal(spec.doorSide);
  placements.push(
    place(
      root,
      spec,
      'Stairs_Exterior_Straight',
      'stairs',
      door.x + normal.x * 1.25,
      0,
      door.z + normal.z * 1.25,
      sideRotation(spec.doorSide),
      { bottom: true, side: spec.doorSide, storey: 0, segment: doorSegment },
    ),
  );
}

function addVines(placements: PiecePlacement[], root: Matrix4, spec: HouseSpec): void {
  const count = spec.vines === true ? 1 : Math.max(0, Math.floor(Number(spec.vines)));
  const choices = [
    ['Prop_Vine1', spec.footprint.w * 0.5 - 0.55, -spec.footprint.d * 0.5, Math.PI],
    ['Prop_Vine2', -spec.footprint.w * 0.5 + 0.55, -spec.footprint.d * 0.5, Math.PI],
    ['Prop_Vine4', spec.footprint.w * 0.5, spec.footprint.d * 0.5 - 0.65, Math.PI / 2],
  ] as const;
  for (let i = 0; i < Math.min(count, choices.length); i += 1) {
    const [piece, lx, lz, ry] = choices[i]!;
    placements.push(place(root, spec, piece, 'vine', lx, 0, lz, ry, { bottom: true }));
  }
}

function wallPiece(
  spec: HouseSpec,
  storey: number,
  door: boolean,
  window: boolean,
  side: HouseSide,
  segment: number,
  seed: number,
): keyof typeof HOUSE_PIECE_BOUNDS {
  const prefix = storey === 0 && spec.ground === 'unevenbrick' ? 'Wall_UnevenBrick' : 'Wall_Plaster';
  if (door) return `${prefix}_Door_Round` as keyof typeof HOUSE_PIECE_BOUNDS;
  if (window) {
    if (isThinWindow(spec, side, storey, segment, seed))
      return `${prefix}_Window_Thin_Round` as keyof typeof HOUSE_PIECE_BOUNDS;
    const flat = storey > 0 && hash(seed, storey, segment, sideIndex(side)) % 3 === 0;
    return `${prefix}_Window_Wide_${flat ? 'Flat' : 'Round'}` as keyof typeof HOUSE_PIECE_BOUNDS;
  }
  if (storey > 0) {
    if (spec.overhang && side === 'front' && hash(seed, storey, segment, 8) % 2 === 0)
      return 'Overhang_Plaster_Long';
    if (spec.upper === 'woodgrid') return 'Wall_Plaster_WoodGrid';
    if (spec.upper === 'mixed' && hash(seed, storey, segment, sideIndex(side)) % 2 === 0)
      return 'Wall_Plaster_WoodGrid';
    return hash(seed, storey, segment, 11) % 2 === 0 ? 'Wall_Plaster_Straight_Base' : 'Wall_Plaster_Straight';
  }
  return prefix === 'Wall_Plaster' ? 'Wall_Plaster_Straight_Base' : 'Wall_UnevenBrick_Straight';
}

function hasWindow(spec: HouseSpec, side: HouseSide, storey: number, segment: number, seed: number): boolean {
  const explicit = spec.windows;
  if (explicit && typeof explicit === 'object') return explicit[side]?.includes(segment) ?? false;
  const pattern = explicit ?? 'regular';
  if (pattern === 'busy') return true;
  const segments = sideSegments(spec.footprint, side);
  if (pattern === 'sparse') {
    if (side !== 'front' && side !== 'back') return storey > 0 && segments > 2 && segment === 1;
    return (segment + storey + seed) % 2 === 0;
  }
  if (side === 'front' || side === 'back') return segments <= 3 || (segment + storey + seed) % 2 === 0;
  return storey > 0 ? (segment + seed) % 2 === 0 : segments > 2 && segment === segments - 1;
}

function isThinWindow(
  spec: HouseSpec,
  side: HouseSide,
  storey: number,
  segment: number,
  seed: number,
): boolean {
  return side === 'left' || side === 'right' || hash(seed, storey, segment, spec.footprint.w) % 5 === 0;
}

function place(
  root: Matrix4,
  spec: HouseSpec,
  piece: string,
  role: HousePieceRole,
  lx: number,
  ly: number,
  lz: number,
  localRotY: number,
  options: {
    bottom?: boolean;
    centerX?: boolean;
    centerZ?: boolean;
    side?: HouseSide;
    storey?: number;
    segment?: number;
    tint?: number;
  } = {},
): PiecePlacement {
  const bounds = pieceBounds(piece);
  const offsetX = options.centerX ? -boundsCenterX(bounds) : 0;
  const offsetY = options.bottom ? -bounds[1] : 0;
  const offsetZ = options.centerZ ? -boundsCenterZ(bounds) : 0;
  const matrix = root
    .clone()
    .multiply(new Matrix4().makeTranslation(lx, ly, lz))
    .multiply(new Matrix4().makeRotationY(localRotY))
    .multiply(new Matrix4().makeTranslation(offsetX, offsetY, offsetZ));
  matrix.decompose(tmpPosition, tmpQuaternion, tmpScale);
  const euler = new Euler().setFromQuaternion(tmpQuaternion, 'XYZ');
  return {
    piece,
    matrix,
    position: { x: tmpPosition.x, y: tmpPosition.y, z: tmpPosition.z },
    rotY: euler.y,
    scale: 1,
    role,
    side: options.side,
    storey: options.storey,
    segment: options.segment,
    local: { x: lx, y: ly, z: lz },
    contactY: options.bottom ? (spec.origin?.y ?? 0) + ly : undefined,
    tint: options.tint,
  };
}

function rootMatrix(spec: HouseSpec): Matrix4 {
  const origin = spec.origin ?? {};
  return new Matrix4()
    .makeTranslation(origin.x ?? 0, origin.y ?? 0, origin.z ?? 0)
    .multiply(new Matrix4().makeRotationY(spec.rotY ?? 0));
}

function localToWorld(spec: HouseSpec, lx: number, lz: number): { x: number; z: number } {
  const origin = spec.origin ?? {};
  const rot = spec.rotY ?? 0;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { x: (origin.x ?? 0) + lx * c + lz * s, z: (origin.z ?? 0) - lx * s + lz * c };
}

function sideSegments(footprint: HouseFootprint, side: HouseSide): number {
  return (side === 'front' || side === 'back' ? footprint.w : footprint.d) / HOUSE_UNIT;
}

function clampedDoorSegment(spec: HouseSpec): number {
  const segments = sideSegments(spec.footprint, spec.doorSide);
  const fallback = Math.max(0, Math.floor((segments - 1) * 0.5));
  return Math.max(0, Math.min(segments - 1, spec.doorSegment ?? fallback));
}

function sideSegmentLocal(footprint: HouseFootprint, side: HouseSide, i: number): { x: number; z: number } {
  if (side === 'front') return { x: -footprint.w * 0.5 + 1 + i * HOUSE_UNIT, z: -footprint.d * 0.5 };
  if (side === 'back') return { x: footprint.w * 0.5 - 1 - i * HOUSE_UNIT, z: footprint.d * 0.5 };
  if (side === 'right') return { x: footprint.w * 0.5, z: -footprint.d * 0.5 + 1 + i * HOUSE_UNIT };
  return { x: -footprint.w * 0.5, z: footprint.d * 0.5 - 1 - i * HOUSE_UNIT };
}

function sideRotation(side: HouseSide): number {
  if (side === 'front') return Math.PI;
  if (side === 'back') return 0;
  if (side === 'right') return Math.PI / 2;
  return -Math.PI / 2;
}

function sideNormal(side: HouseSide): { x: number; z: number } {
  if (side === 'front') return { x: 0, z: -1 };
  if (side === 'back') return { x: 0, z: 1 };
  if (side === 'right') return { x: 1, z: 0 };
  return { x: -1, z: 0 };
}

function roofPiece(footprint: HouseFootprint): keyof typeof HOUSE_PIECE_BOUNDS {
  const key = `${footprint.w}x${footprint.d}` as keyof typeof ROOF_BY_FOOTPRINT;
  const roof = ROOF_BY_FOOTPRINT[key];
  if (!roof) throw new Error(`No native village roof for ${key}; choose a supported footprint.`);
  return roof;
}

function roofFrontPiece(width: HouseWidth): 'Roof_Front_Brick4' | 'Roof_Front_Brick6' | 'Roof_Front_Brick8' {
  if (width === 8) return 'Roof_Front_Brick8';
  if (width === 6) return 'Roof_Front_Brick6';
  return 'Roof_Front_Brick4';
}

function pieceBounds(piece: string): Bounds {
  return HOUSE_PIECE_BOUNDS[piece as keyof typeof HOUSE_PIECE_BOUNDS] ?? [-0.5, 0, -0.5, 0.5, 1, 0.5];
}

function boundsCenterX(bounds: Bounds): number {
  return (bounds[0] + bounds[3]) * 0.5;
}

function boundsCenterZ(bounds: Bounds): number {
  return (bounds[2] + bounds[5]) * 0.5;
}

function sideIndex(side: HouseSide): number {
  return HOUSE_SIDES.indexOf(side);
}

function hash(seed: number, a: number, b: number, c: number): number {
  let h = (seed | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (a + 0x7f4a7c15), 0x85ebca6b);
  h = Math.imul(h ^ (b + 0x94d049bb), 0xc2b2ae35);
  h = Math.imul(h ^ (c + 0x27d4eb2f), 0x165667b1);
  return (h ^ (h >>> 16)) >>> 0;
}

const HOUSE_SIDES: readonly HouseSide[] = ['front', 'back', 'left', 'right'];
