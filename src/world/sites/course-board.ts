import { BoxGeometry, BufferAttribute, Matrix4, type BufferGeometry } from 'three/webgpu';
import type { CourseBoard } from '../../learn/course-board';
import { paint, type MaterialKey, type VillageBoxCollider } from '../village/kit';
import { TRIM } from './geo';
import type { SignSet } from './sign';

/**
 * A course notice board (docs/specs/COURSE-BOARDS.md): a town notice board on two posts under a small
 * shingled roof, with a carved header and the chapter's topics pinned up as parchment notes. The
 * timber goes into the island's town buckets (its kit's wood and metal: no new draw or shader), and
 * the lettering into the island's sign atlas. The board faces local +z; `rot` is its yaw (three's
 * convention, like `poseFrame`), and `y` is the ground under it.
 */
export interface CourseBoardPose {
  x: number;
  y: number;
  z: number;
  rot: number;
}

type Buckets = Record<'wood' | 'metal', BufferGeometry[]> & Partial<Record<MaterialKey, BufferGeometry[]>>;

/** Half the posts' spacing, the posts' size, and the board's height band (metres). */
const POST_X = 1.38;
const POST = 0.16;
const BOARD = { w: 2.6, y0: 0.85, y1: 2.45, d: 0.05 } as const;
const HEADER = { y0: 2.55, y1: 2.95, d: 0.06 } as const;
const ROOF = { ridge: 3.5, eave: 2.98, run: 0.68, w: 3.15, courses: 4 } as const;
/** The notes' area on the board, inside its frame. */
const NOTES = { x0: -1.2, x1: 1.2, y0: 0.93, y1: 2.37 } as const;
const NOTE_Z = 0.045;
const COLS = 3;

const TIMBER = 0xb08a62;
const TIMBER_DARK = 0x7d5b3d;
/** The shingle courses, light and dark in turn. */
const SHINGLES = [0x9a7150, 0x7d5a3e] as const;
const BRASS = 0xb8923e;

/** Where the player stands to read it: in front, facing the board. */
export function courseBoardSpot(p: CourseBoardPose): { x: number; y: number; z: number; heading: number } {
  return { x: p.x + Math.sin(p.rot) * 1.5, y: p.y, z: p.z + Math.cos(p.rot) * 1.5, heading: p.rot + Math.PI };
}

/** True inside the board's footprint and the ground just in front (for plants and props). */
export function courseBoardExcludes(p: CourseBoardPose, x: number, z: number): boolean {
  const dx = x - p.x,
    dz = z - p.z;
  const c = Math.cos(p.rot),
    s = Math.sin(p.rot);
  const lx = dx * c - dz * s,
    lz = dx * s + dz * c;
  return Math.abs(lx) < 1.9 && lz > -1 && lz < 1.6;
}

const place = new Matrix4();
const local = new Matrix4();
const turn = new Matrix4();

/** Moves a part from the board's frame to the world (local `x, y, z`, then the board's pose). */
function toWorld(g: BufferGeometry, p: CourseBoardPose, x: number, y: number, z: number): void {
  place.makeRotationY(p.rot).setPosition(p.x, p.y, p.z);
  g.applyMatrix4(local.makeTranslation(x, y, z).premultiply(place));
}

function timber(
  out: BufferGeometry[],
  p: CourseBoardPose,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  colour: number,
  dark = false,
  tilt = 0,
): void {
  const g = new BoxGeometry(w, h, d);
  woodUv(g, w, h, d, dark);
  if (tilt) g.applyMatrix4(turn.makeRotationX(tilt));
  toWorld(g, p, x, y, z);
  paint(g, colour);
  out.push(g);
}

/** Grain along the timber's longest side, one plank band across (like `plank` in geo.ts). */
function woodUv(g: BoxGeometry, w: number, h: number, d: number, dark: boolean): void {
  const pos = g.getAttribute('position') as BufferAttribute;
  const nrm = g.getAttribute('normal') as BufferAttribute;
  const ext = [w, h, d];
  const long = ext.indexOf(Math.max(w, h, d));
  const band = dark ? TRIM.dark : TRIM.light;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const c = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const n = [Math.abs(nrm.getX(i)), Math.abs(nrm.getY(i)), Math.abs(nrm.getZ(i))];
    const face = n[0]! >= n[1]! && n[0]! >= n[2]! ? 0 : n[1]! >= n[2]! ? 1 : 2;
    const along = face === long ? (long === 0 ? 1 : 0) : long;
    const across = 3 - along - face;
    uv[i * 2] = c[along]! * 0.5 + 0.3;
    uv[i * 2 + 1] =
      band[0] + (c[across]! / ext[across]! + 0.5) * Math.min(1, ext[across]! / 0.7) * (band[1] - band[0]);
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
}

/**
 * The board's timber, roof and tacks into `buckets`, placed at `pose`. Returns the walker's collider
 * (posts and board) and the camera's (the board and its roof).
 */
export function addCourseBoardTimber(
  buckets: Buckets,
  pose: CourseBoardPose,
  board: CourseBoard,
): { box: VillageBoxCollider; camera: VillageBoxCollider & { y0: number; y1: number } } {
  const wood = buckets.wood;
  const postH = ROOF.ridge - 0.04 + 0.4;
  for (const sx of [-1, 1])
    timber(wood, pose, POST, postH, POST, sx * POST_X, postH / 2 - 0.4, 0, TIMBER_DARK, true);
  // The backing boards, a rail above and below, and the header plank.
  timber(wood, pose, BOARD.w, BOARD.y1 - BOARD.y0, BOARD.d, 0, (BOARD.y0 + BOARD.y1) / 2, 0, TIMBER);
  timber(wood, pose, BOARD.w + 0.12, 0.09, 0.09, 0, BOARD.y1 + 0.045, 0.02, TIMBER_DARK, true);
  timber(wood, pose, BOARD.w + 0.12, 0.09, 0.14, 0, BOARD.y0 - 0.045, 0.04, TIMBER_DARK, true);
  timber(
    wood,
    pose,
    BOARD.w,
    HEADER.y1 - HEADER.y0,
    HEADER.d,
    0,
    (HEADER.y0 + HEADER.y1) / 2,
    0,
    TIMBER_DARK,
    true,
  );
  // Side battens down the board's edges, against the posts.
  for (const sx of [-1, 1])
    timber(
      wood,
      pose,
      0.07,
      BOARD.y1 - BOARD.y0,
      0.08,
      sx * (BOARD.w / 2 - 0.035),
      (BOARD.y0 + BOARD.y1) / 2,
      0.015,
      TIMBER_DARK,
      true,
    );
  // The roof: shingle courses down each slope (each overlapping the one below), and a ridge cap.
  const slope = Math.atan2(ROOF.ridge - ROOF.eave, ROOF.run);
  const len = Math.hypot(ROOF.run, ROOF.ridge - ROOF.eave);
  const course = len / ROOF.courses;
  for (const side of [-1, 1])
    for (let k = 0; k < ROOF.courses; k++) {
      const t = (k + 0.5) / ROOF.courses;
      const z = side * ROOF.run * t;
      const y = ROOF.ridge - (ROOF.ridge - ROOF.eave) * t + 0.03 + k * 0.012;
      timber(wood, pose, ROOF.w, 0.045, course + 0.09, 0, y, z, SHINGLES[k % 2]!, true, side * slope);
    }
  timber(wood, pose, ROOF.w + 0.06, 0.08, 0.16, 0, ROOF.ridge + 0.04, 0, TIMBER_DARK, true);
  // Gable boards under the roof's ends, so it reads as a roof from the side.
  for (const sx of [-1, 1])
    timber(
      wood,
      pose,
      0.04,
      ROOF.ridge - ROOF.eave - 0.02,
      ROOF.run * 1.1,
      sx * (ROOF.w / 2 - 0.08),
      (ROOF.ridge + ROOF.eave) / 2 - 0.02,
      0,
      TIMBER_DARK,
      true,
    );
  // A brass tack at the top of each note.
  for (const n of noteCells(board.topics.length + 2)) {
    const g = new BoxGeometry(0.03, 0.03, 0.02);
    toWorld(g, pose, n.x, n.y + n.h / 2 - 0.035, NOTE_Z + 0.012);
    paint(g, BRASS);
    buckets.metal.push(g);
  }
  return {
    box: { x: pose.x, z: pose.z, hx: POST_X + POST / 2 + 0.04, hz: 0.14, rot: pose.rot, height: ROOF.ridge },
    camera: {
      x: pose.x,
      z: pose.z,
      hx: ROOF.w / 2,
      hz: ROOF.run,
      rot: pose.rot,
      y0: pose.y + BOARD.y0,
      y1: pose.y + ROOF.ridge + 0.1,
    },
  };
}

/** Each note's centre and size on the board (local metres): the topics in rows of three, the pins below. */
export function noteCells(notes: number): { x: number; y: number; w: number; h: number; pin: boolean }[] {
  const topics = Math.max(0, notes - 2);
  const rows = Math.ceil(topics / COLS) + 1;
  const cw = (NOTES.x1 - NOTES.x0) / COLS;
  const ch = (NOTES.y1 - NOTES.y0) / rows;
  const out: { x: number; y: number; w: number; h: number; pin: boolean }[] = [];
  for (let i = 0; i < topics; i++) {
    const row = Math.floor(i / COLS);
    const inRow = Math.min(COLS, topics - row * COLS);
    const col = i % COLS;
    out.push({
      x: (col - (inRow - 1) / 2) * cw,
      y: NOTES.y1 - (row + 0.5) * ch,
      w: cw - 0.07,
      h: ch - 0.06,
      pin: false,
    });
  }
  const pw = (NOTES.x1 - NOTES.x0) / 2;
  for (let k = 0; k < Math.min(2, notes); k++)
    out.push({ x: (k - 0.5) * pw, y: NOTES.y0 + ch / 2, w: pw - 0.09, h: ch - 0.06, pin: true });
  return out;
}

/** A title in up to three lines of about even length (the sign shrinks its letters to fit). */
export function wrapTitle(title: string): string[] {
  const lines = title.length <= 16 ? 1 : title.length <= 34 ? 2 : 3;
  if (lines === 1) return [title];
  const target = title.length / lines;
  const out: string[] = [];
  let line = '';
  for (const word of title.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > target + 3 && out.length < lines - 1) {
      out.push(line);
      line = word;
    } else line = next;
  }
  out.push(line);
  return out;
}

/** The carved header and the parchment notes, into the island's sign atlas (one draw for the lettering). */
export function addCourseBoardNotices(signs: SignSet, pose: CourseBoardPose, board: CourseBoard): void {
  const at = (lx: number, ly: number, lz: number) => ({
    x: pose.x + lx * Math.cos(pose.rot) + lz * Math.sin(pose.rot),
    y: pose.y + ly,
    z: pose.z - lx * Math.sin(pose.rot) + lz * Math.cos(pose.rot),
  });
  const header = signs.add(
    ['Course Notices', `Chapter ${board.num} · ${board.title}`],
    BOARD.w - 0.16,
    0.34,
    {
      scales: [1, 0.62],
      size: 0.11,
    },
  );
  const h = at(0, (HEADER.y0 + HEADER.y1) / 2, HEADER.d / 2 + 0.008);
  header.object.position.set(h.x, h.y, h.z);
  header.object.rotation.set(0, pose.rot, 0);
  const cells = noteCells(board.topics.length + 2);
  const notes: { lines: string[]; pin: boolean }[] = [
    ...board.topics.map((t) => ({ lines: wrapTitle(t.title), pin: false })),
    { lines: ['This chapter', `${board.num} · ${board.title}`], pin: true },
    { lines: ['The whole course', 'on GitHub'], pin: true },
  ];
  notes.forEach((n, i) => {
    const c = cells[i]!;
    const sign = signs.add(n.lines, c.w, c.h, {
      look: 'cloth',
      size: 0.13,
      ...(n.pin
        ? { fill: '#ead29a', colors: ['#7a2e12', '#3b2616'], scales: [1, 0.78] }
        : { colors: n.lines.map(() => '#3b2616') }),
    });
    const p = at(c.x, c.y, NOTE_Z - 0.004);
    sign.object.position.set(p.x, p.y, p.z);
    // Pinned up by hand: each a degree or two off square.
    sign.object.rotation.set(0, pose.rot, (((i * 37) % 7) - 3) * 0.011, 'YXZ');
  });
}
