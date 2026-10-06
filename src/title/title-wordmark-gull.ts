import { Object3D, Vector3, type Group, type PerspectiveCamera } from 'three/webgpu';
import { world } from '../world/uniforms';
import { clamp, lerp, smoothstep } from '../util/math';

export interface TitleWordmarkGull {
  readonly group: Group;
  update(dt: number, t: number, camera: PerspectiveCamera): void;
  setEnabled(enabled: boolean): void;
  stats(): {
    visible: number;
    drawCalls: number;
    triangles: number;
    cpuMs: number;
    samples: { phase: string; t: number; dt: number; x: number; y: number }[];
  };
  dispose(): void;
}

type GullPhase = 'waiting' | 'landing' | 'perched' | 'crouch' | 'departing';
type GullPose = 'landing' | 'perched' | 'call' | 'landing-legs' | 'crouch' | 'departing';

interface LandingTarget {
  x: number;
  y: number;
  /** Sprite scale when perched. */
  scale: number;
}

/** Ship-local spots the gull can stand on, and the ship they ride with. */
export interface GullShipPerches {
  object: Object3D;
  perches: readonly { x: number; y: number; z: number; weight?: number }[];
}

type GullMode = 'wordmark' | 'ship';

const FINAL_T_INDEX = 6;
const LAND_SECONDS = 3.4;
const CROUCH_SECONDS = 0.55;
const DEPART_SECONDS = 3.2;
const RANGE_TEXT_END = 7;
const SPRITE_FRAME = 256;
const PERCHED_FOOT_Y = 194;
const MOTION_ANCHOR_Y = PERCHED_FOOT_Y;
/** The standing gull's height in the sprite frame (px, feet to crown). */
const STANDING_PX = 126;
/** On the ship it reads as a big gull: about 1.1 m tall, but never under 26 px on screen. */
const SHIP_GULL_METRES = 1.1;
const SHIP_GULL_MIN_PX = 26;
/** After its one wordmark visit, the gull comes back to the ship every 60-120 s. */
const SHIP_GAP_MIN = 60;
const SHIP_GAP_RANGE = 60;
/** No perch in view when it's due (the view is dragged right round): look again shortly. */
const SHIP_RETRY = 8;
/** Seconds after the title is first visible before the gull flies in to the wordmark. */
const FIRST_VISIT = 5;
const tmpPerch = new Vector3();
/** The sheet's cells in order, 8 to a row (tools/title/bake-wordmark-gull.mjs). */
const SHEET = [
  ...Array.from({ length: 8 }, (_, i) => `flight-${i}`),
  'flare',
  'idle',
  'head-left',
  'head-right',
  'call',
  'crouch',
  'idle-bob',
  'glide',
  'flare-1',
  'flare-2',
  'flare-3',
  'flare-4',
  'flare-5',
  ...Array.from({ length: 7 }, (_, i) => `land-${i}`),
];
const FRAMES: Record<string, { x: number; y: number }> = Object.fromEntries(
  SHEET.map((name, i) => [name, { x: -(i % 8) * SPRITE_FRAME, y: -Math.floor(i / 8) * SPRITE_FRAME }]),
);
/** The landing flare: one braking wingbeat in 6 cells ('flare' is its wings-high first cell). */
const FLARE_CELLS = ['flare', 'flare-1', 'flare-2', 'flare-3', 'flare-4', 'flare-5'];
/** Where the flare cells' lowered feet are in the frame (px from the top), so they touch down. */
const FLARE_FOOT_Y = 169;
/**
 * The touchdown, cell by cell (seconds each): it lands side-on with its wings still up and its
 * legs bent, folds the wings back along its body, then turns to face out (the idle cell).
 */
const TOUCHDOWN: readonly (readonly [cell: string, seconds: number])[] = [
  ['land-0', 0.14],
  ['land-1', 0.07],
  ['land-2', 0.07],
  ['land-3', 0.07],
  ['land-4', 0.08],
  ['land-5', 0.1],
  ['land-6', 0.1],
];
/** Where in a wingbeat (0-1) the flight cells pass the glide pose: wings out, level-ish. */
const GLIDE_AT = 0.2;

/**
 * The landing's wing work, by seconds into the 3.4 s approach. A bird can't hold its wings still
 * unless it's fast enough to glide, so: flap in, glide while there's speed, flap again as it
 * slows, then flare with big braking beats (feet down) right to the touchdown.
 */
const APPROACH = {
  /** Flapping in from off-screen (beats per second). */
  cruiseHz: 3.2,
  /** The glide, while it's still quick. */
  glideFrom: 1.25,
  glideTo: 2.1,
  /** Flapping again as it slows. */
  slowHz: 3.6,
  /** The flare starts on the first wing-top after this, and its beats end at touchdown. */
  flareFrom: 2.75,
  flareHz: 4,
  /** The body pitches nose-up through the flare, then levels as the feet land (degrees). */
  flarePitch: 9,
  /**
   * It hovers on its flare with its feet just clear of the letter, and only drops the last bit
   * onto it in this many seconds before touchdown.
   */
  drop: 0.2,
};

/** Cubic Bezier, one axis. */
function bez(a: number, b: number, c: number, d: number, u: number): number {
  const v = 1 - u;
  return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d;
}

function random(seed: number): () => number {
  let s = seed >>> 0 || 0x12345678;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 1 | s);
    s ^= s + Math.imul(s ^ (s >>> 7), 61 | s);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

/** The touchdown cell `t` s after landing, or null once it's done. */
function touchdownCell(t: number): string | null {
  let end = 0;
  for (const [cell, seconds] of TOUCHDOWN) {
    end += seconds;
    if (t < end) return cell;
  }
  return null;
}

function flapFrameAt(phase: number): string {
  return `flight-${Math.floor(phase * 8) % 8}`;
}

function measureTarget(): LandingTarget | null {
  if (typeof document === 'undefined' || window.innerWidth < 900) return null;
  const wordmark = document.getElementById('title-wordmark');
  const text = wordmark?.firstChild;
  if (!wordmark || text?.nodeType !== Node.TEXT_NODE) return null;
  const style = getComputedStyle(wordmark);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.2) return null;

  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, RANGE_TEXT_END);
  const firstLine = Array.from(range.getClientRects()).filter((r) => r.width > 1 && r.height > 1);
  range.detach();
  if (firstLine.length !== 1) return null;

  const letterRange = document.createRange();
  letterRange.setStart(text, FINAL_T_INDEX);
  letterRange.setEnd(text, FINAL_T_INDEX + 1);
  const letter = letterRange.getBoundingClientRect();
  letterRange.detach();
  if (letter.width <= 1 || letter.height <= 1) return null;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = style.font;
  const metrics = ctx.measureText('T');
  const fontAscent = metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent;
  const fontDescent = metrics.fontBoundingBoxDescent || metrics.actualBoundingBoxDescent;
  const baselineY = letter.top + (firstLine[0].height - (fontAscent + fontDescent)) * 0.5 + fontAscent;
  const capTop = baselineY - metrics.actualBoundingBoxAscent;

  return {
    x: letter.left + letter.width * 0.5,
    y: capTop + 1,
    scale: clamp((metrics.actualBoundingBoxAscent * 0.95) / STANDING_PX, 0.42, 0.7),
  };
}

/** Where ship perch `i` is on screen right now, and the sprite scale for its distance. */
function projectPerch(ship: GullShipPerches, i: number, camera: PerspectiveCamera): LandingTarget | null {
  const p = ship.perches[i];
  if (!p || typeof document === 'undefined') return null;
  ship.object.updateMatrixWorld();
  camera.updateMatrixWorld();
  tmpPerch.set(p.x, p.y, p.z);
  ship.object.localToWorld(tmpPerch);
  const d = tmpPerch.distanceTo(camera.position);
  tmpPerch.project(camera);
  if (tmpPerch.z < -1 || tmpPerch.z > 1) return null;
  const rect = document.getElementById('gl')?.getBoundingClientRect();
  const left = rect?.left ?? 0,
    top = rect?.top ?? 0,
    w = rect?.width ?? window.innerWidth,
    h = rect?.height ?? window.innerHeight;
  const pxPerMetre = h / (2 * d * Math.tan((camera.fov * Math.PI) / 360));
  const px = Math.max(SHIP_GULL_MIN_PX, SHIP_GULL_METRES * pxPerMetre);
  return {
    x: left + (tmpPerch.x * 0.5 + 0.5) * w,
    y: top + (0.5 - tmpPerch.y * 0.5) * h,
    scale: clamp(px / STANDING_PX, 0.18, 0.7),
  };
}

/** A perch that is on screen, right of the title column, and not under the bottom hint. */
function inView(t: LandingTarget | null): t is LandingTarget {
  if (!t) return false;
  const W = window.innerWidth,
    H = window.innerHeight;
  return t.x > W * 0.42 && t.x < W - 70 && t.y > 90 && t.y < H * 0.72;
}

export function createTitleWordmarkGull(seed = 0xc0ffee, ship?: GullShipPerches): TitleWordmarkGull {
  const group = new Object3D() as Group;
  group.name = 'title-wordmark-gull-anchor';
  const rng = random(seed);
  const reducedMotionQuery =
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  let enabled = true;
  let phase: GullPhase = 'waiting';
  let phaseT = 0;
  let perchFor = 6;
  // Wing-beat phase in beats: integrated, so changing the beat rate never jumps a frame.
  let flap = 0;
  // The landing's wing state: flapping, holding a glide, or flaring (from flareT0, flareBeats long).
  let wings: 'flap' | 'glide' | 'flare' = 'flap';
  let flareT0 = 0;
  let flareRate = APPROACH.flareHz;
  // The first landing (on the wordmark) comes FIRST_VISIT s after the title is first on screen.
  let nextAt = Infinity;
  let target: LandingTarget | null = null;
  let mode: GullMode = 'wordmark';
  let perchIndex = -1;
  /** Direction of travel on screen: -1 flies right to left (in from the right), 1 left to right. */
  let dir: 1 | -1 = -1;
  let visits = 0;
  let lastPerch = -1;
  // Debug: ?gull=ship sends every visit to the ship; ?gull=ship:N to perch N when it's in view.
  const gullQ =
    typeof location !== 'undefined' ? (new URLSearchParams(location.search).get('gull') ?? '') : '';
  const forceShip = gullQ.startsWith('ship');
  const forcePerch = gullQ.startsWith('ship:') ? Number(gullQ.slice(5)) : -1;
  let visible = 0;
  let cpuMs = 0;
  const samples: { phase: string; t: number; dt: number; x: number; y: number }[] = [];
  let sampleDt = 0;

  /** The landing's sprite cell, foot anchor and nose-up pitch (degrees) at `t` s in. */
  function landingWings(t: number, dt: number): { frame: string; anchor: number; pitch: number } {
    const end = LAND_SECONDS;
    if (wings === 'glide') {
      if (t < APPROACH.glideTo) return { frame: 'glide', anchor: MOTION_ANCHOR_Y, pitch: 0 };
      // Out of the glide from the same pose, straight into the next downstroke.
      wings = 'flap';
      flap = Math.floor(flap) + GLIDE_AT;
    }
    if (wings === 'flap') {
      const rate = t < APPROACH.glideFrom ? APPROACH.cruiseHz : APPROACH.slowHz;
      const before = flap;
      flap += dt * rate;
      const crossed = (at: number): boolean => Math.floor(before - at) !== Math.floor(flap - at);
      if (t >= APPROACH.glideFrom && t < APPROACH.glideTo - 0.2 && crossed(GLIDE_AT)) {
        wings = 'glide';
        return { frame: 'glide', anchor: MOTION_ANCHOR_Y, pitch: 0 };
      }
      if (t >= APPROACH.flareFrom && crossed(0)) {
        // Wings at the top: into the flare. Its beat is set so a whole number of beats ends
        // exactly at touchdown, wings high again.
        wings = 'flare';
        flareT0 = t;
        const beats = Math.max(1, Math.round((end - t) * APPROACH.flareHz));
        flareRate = beats / Math.max(0.05, end - t);
      } else {
        return { frame: flapFrameAt(flap), anchor: MOTION_ANCHOR_Y, pitch: 0 };
      }
    }
    const ft = t - flareT0;
    const f = clamp(ft / Math.max(0.05, end - flareT0), 0, 1);
    const beat = ft * flareRate;
    const cell = f >= 1 ? 0 : Math.floor((beat % 1) * FLARE_CELLS.length) % FLARE_CELLS.length;
    // The lowered feet hang a little above the perch line until the final drop puts them on it.
    const anchor = lerp(MOTION_ANCHOR_Y, FLARE_FOOT_Y, smoothstep(end - APPROACH.drop, end, t));
    return { frame: FLARE_CELLS[cell], anchor, pitch: APPROACH.flarePitch * Math.sin(Math.PI * f) };
  }

  function overlay(): HTMLElement | null {
    return typeof document === 'undefined' ? null : document.getElementById('title-wordmark-gull');
  }

  function hideOverlay(): void {
    const el = overlay();
    if (el) el.style.display = 'none';
  }

  function showOverlay(
    x: number,
    y: number,
    scaleValue: number,
    state: GullPose,
    rotateDeg: number,
    facing: 1 | -1,
    frameName: string,
    anchorY = MOTION_ANCHOR_Y,
  ): void {
    const el = overlay();
    if (!el) return;
    const frame = FRAMES[frameName] ?? FRAMES.idle;
    const host = document.querySelector('.ci-title-shell')?.getBoundingClientRect();
    const localX = host ? x - host.left : x;
    const localY = host ? y - host.top : y;
    el.className = `ci-title-gull ci-title-gull--${state}`;
    el.style.display = 'block';
    el.style.setProperty('--gull-frame-x', `${frame.x}px`);
    el.style.setProperty('--gull-frame-y', `${frame.y}px`);
    // Scale, mirror and tilt about the anchor (the feet), and put the anchor on (x, y).
    const ox = SPRITE_FRAME / 2;
    el.style.transformOrigin = `${ox}px ${anchorY.toFixed(1)}px`;
    el.style.transform = `translate3d(${(localX - ox).toFixed(1)}px, ${(localY - anchorY).toFixed(1)}px, 0) scale(${scaleValue.toFixed(3)}) scaleX(${facing}) rotate(${rotateDeg.toFixed(1)}deg)`;
    samples.push({ phase: state, t: phaseT, dt: sampleDt, x, y });
    if (samples.length > 360) samples.shift();
  }

  function schedule(t: number, delay = SHIP_GAP_MIN + rng() * SHIP_GAP_RANGE): void {
    phase = 'waiting';
    phaseT = 0;
    target = null;
    visible = 0;
    // Before the first (wordmark) visit, nothing is scheduled: the clock starts once the title shows.
    if (visits > 0) nextAt = nextAt === Infinity ? t + delay : Math.max(nextAt, t + delay);
    hideOverlay();
  }

  return {
    group,
    update(dt, t, camera) {
      const started = typeof performance !== 'undefined' ? performance.now() : 0;
      if (!enabled || world.reducedMotion.value > 0.5 || reducedMotionQuery?.matches) {
        // Hidden or reduced motion: the first visit waits for the title to show again (5 s fresh).
        if (visits === 0) nextAt = Infinity;
        schedule(t);
        cpuMs = started > 0 ? performance.now() - started : 0;
        return;
      }

      // Start the clock on the first frame the wordmark is actually showing (not behind the
      // loading card).
      if (nextAt === Infinity && visits === 0 && measureTarget()) nextAt = t + FIRST_VISIT;

      if (phase === 'waiting' && t >= nextAt) {
        // The gull lands on the wordmark once; every visit after that comes in from the left to a
        // spot on the ship.
        mode = visits === 0 && !forceShip ? 'wordmark' : 'ship';
        perchIndex = -1;
        if (mode === 'ship' && ship) {
          const options: number[] = [];
          for (let i = 0; i < ship.perches.length; i++)
            if (inView(projectPerch(ship, i, camera))) options.push(i);
          if (options.length) {
            // Weighted pick, never the same spot twice running.
            const pool = options.includes(forcePerch)
              ? [forcePerch]
              : options.length > 1
                ? options.filter((i) => i !== lastPerch)
                : options;
            let total = 0;
            for (const i of pool) total += ship.perches[i]!.weight ?? 1;
            let r = rng() * total;
            perchIndex = pool[pool.length - 1]!;
            for (const i of pool) {
              r -= ship.perches[i]!.weight ?? 1;
              if (r <= 0) {
                perchIndex = i;
                break;
              }
            }
            lastPerch = perchIndex;
          }
        }
        target =
          mode === 'wordmark'
            ? measureTarget()
            : ship && perchIndex >= 0
              ? projectPerch(ship, perchIndex, camera)
              : null;
        dir = mode === 'ship' ? 1 : -1;
        if (target) {
          phase = 'landing';
          phaseT = 0;
          wings = 'flap';
          visits++;
        } else if (mode === 'wordmark') {
          // The wordmark can't be landed on (a narrow window hides it): skip to the ship visits.
          visits++;
          schedule(t, SHIP_RETRY);
        } else schedule(t, SHIP_RETRY);
      }
      // A ship perch rides the swell and the orbiting camera: follow it every frame.
      if (mode === 'ship' && phase !== 'waiting' && ship) {
        const now = projectPerch(ship, perchIndex, camera);
        if (now) target = now;
        // Dragged out of view while it stands there: it leaves.
        if (phase === 'perched' && !inView(now)) {
          phase = 'crouch';
          phaseT = 0;
        }
      }

      if (phase === 'waiting' || !target) {
        visible = 0;
        hideOverlay();
      } else {
        phaseT += dt;
        sampleDt = dt;
        visible = 1;
        const sc = target.scale;
        const W = window.innerWidth;
        const off = SPRITE_FRAME * sc;
        if (phase === 'landing') {
          // One continuous curve in from off-screen (right for the wordmark, left for the ship),
          // high, easing out so it arrives slow. It flaps in, glides while it's quick, flaps again as
          // it slows, then flares with braking beats, feet down, right to the touchdown.
          // Bound for the ship, it starts nearer the camera and shrinks into the distance.
          const k = clamp(phaseT / LAND_SECONDS, 0, 1);
          const u = 1 - (1 - k) * (1 - k);
          const size = mode === 'ship' ? sc * (1 + 0.9 * (1 - u)) : sc;
          const x0 = dir < 0 ? W + SPRITE_FRAME * size : -SPRITE_FRAME * size,
            y0 = target.y - Math.min(260, target.y + 40);
          const x = bez(x0, x0 + (target.x - x0) * 0.45, target.x - dir * 70 * sc, target.x, u);
          const y = bez(y0, y0 + 30 * sc, target.y - 110 * sc, target.y, u);
          const { frame, anchor, pitch } = landingWings(phaseT, dt);
          showOverlay(
            x,
            y,
            size,
            wings === 'flare' ? 'landing-legs' : 'landing',
            -8 * (1 - u) - pitch,
            dir,
            frame,
            anchor,
          );
          if (k >= 1) {
            phase = 'perched';
            phaseT = 0;
            perchFor = 5 + rng() * 3;
          }
        } else if (phase === 'perched') {
          // The touchdown (its legs take the landing, so the feet stay put), then a gentle idle bob.
          const landing = touchdownCell(phaseT);
          const bob = landing ? 0 : Math.max(0, Math.sin(phaseT * 1.3)) * 1.5 * sc;
          const call = phaseT > 1.4 && phaseT < 2.0;
          const frameName =
            landing ??
            (call
              ? 'call'
              : phaseT > 2.8 && phaseT < 3.6
                ? 'head-left'
                : phaseT > 4.0 && phaseT < 4.8
                  ? 'head-right'
                  : 'idle');
          showOverlay(
            target.x,
            target.y + bob,
            sc,
            call ? 'call' : 'perched',
            0,
            dir,
            frameName,
            PERCHED_FOOT_Y,
          );
          if (phaseT >= perchFor) {
            phase = 'crouch';
            phaseT = 0;
          }
        } else if (phase === 'crouch') {
          showOverlay(target.x, target.y, sc, 'crouch', 0, dir, 'crouch', PERCHED_FOOT_Y);
          if (phaseT >= CROUCH_SECONDS) {
            phase = 'departing';
            phaseT = 0;
            flap = 0.25;
          }
        } else if (phase === 'departing') {
          // Springs up with hard wing beats, then climbs away the way it faces and leaves the top
          // of the screen. No fade: it flies out of frame.
          const k = clamp(phaseT / DEPART_SECONDS, 0, 1);
          const u = 0.35 * k + 0.65 * k * k;
          const x0 = target.x,
            y0 = target.y;
          const x3 = target.x + dir * Math.min(W * 0.4, 520);
          const y3 = -off - 40;
          const x = bez(x0, x0 + dir * 20 * sc, x0 + (x3 - x0) * 0.55, x3, u);
          const y = bez(y0, y0 - 120 * sc, y3 + (y0 - y3) * 0.35, y3, u);
          flap += dt * (phaseT < 1 ? 4.2 : 3.0);
          showOverlay(
            x,
            y,
            sc * (1 + (mode === 'ship' ? 0.5 : -0.15) * k),
            'departing',
            8 * Math.min(1, phaseT * 3),
            dir,
            flapFrameAt(flap),
          );
          if (k >= 1) schedule(t);
        }
      }
      cpuMs = started > 0 ? performance.now() - started : 0;
    },
    setEnabled(next) {
      enabled = next;
      if (!enabled) {
        visible = 0;
        hideOverlay();
      }
    },
    stats() {
      return { visible, drawCalls: 0, triangles: 0, cpuMs, samples: [...samples] };
    },
    dispose() {
      hideOverlay();
    },
  };
}
