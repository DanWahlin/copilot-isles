import { Object3D, type Group, type PerspectiveCamera } from 'three/webgpu';
import { world } from '../world/uniforms';
import { clamp } from '../util/math';

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
  capHeight: number;
}

const FINAL_T_INDEX = 6;
const LAND_SECONDS = 3.4;
const CROUCH_SECONDS = 0.55;
const DEPART_SECONDS = 3.2;
const RANGE_TEXT_END = 7;
const SPRITE_FRAME = 256;
const PERCHED_FOOT_Y = 194;
const MOTION_ANCHOR_Y = PERCHED_FOOT_Y;
const FRAMES: Record<string, { x: number; y: number }> = {
  'flight-0': { x: 0, y: 0 },
  'flight-1': { x: -256, y: 0 },
  'flight-2': { x: -512, y: 0 },
  'flight-3': { x: -768, y: 0 },
  'flight-4': { x: -1024, y: 0 },
  'flight-5': { x: -1280, y: 0 },
  'flight-6': { x: -1536, y: 0 },
  'flight-7': { x: -1792, y: 0 },
  flare: { x: 0, y: -256 },
  idle: { x: -256, y: -256 },
  'head-left': { x: -512, y: -256 },
  'head-right': { x: -768, y: -256 },
  call: { x: -1024, y: -256 },
  crouch: { x: -1280, y: -256 },
  'idle-bob': { x: -1536, y: -256 },
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

function smooth01(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
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
    capHeight: metrics.actualBoundingBoxAscent,
  };
}

export function createTitleWordmarkGull(seed = 0xc0ffee): TitleWordmarkGull {
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
  let nextAt = 8 + rng() * 7;
  let target: LandingTarget | null = null;
  let visible = 0;
  let cpuMs = 0;
  const samples: { phase: string; t: number; dt: number; x: number; y: number }[] = [];
  let sampleDt = 0;

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
    const anchoredY = y + (SPRITE_FRAME - anchorY) * scaleValue;
    const localX = host ? x - host.left : x;
    const localY = host ? anchoredY - host.top : anchoredY;
    el.className = `ci-title-gull ci-title-gull--${state}`;
    el.style.display = 'block';
    el.style.setProperty('--gull-frame-x', `${frame.x}px`);
    el.style.setProperty('--gull-frame-y', `${frame.y}px`);
    el.style.transform = `translate(-50%, -100%) translate3d(${localX.toFixed(1)}px, ${localY.toFixed(1)}px, 0) scale(${scaleValue.toFixed(3)}) scaleX(${facing}) rotate(${rotateDeg.toFixed(1)}deg)`;
    samples.push({ phase: state, t: phaseT, dt: sampleDt, x, y });
    if (samples.length > 360) samples.shift();
  }

  function schedule(t: number): void {
    phase = 'waiting';
    phaseT = 0;
    target = null;
    visible = 0;
    nextAt = t + 25 + rng() * 35;
    hideOverlay();
  }

  return {
    group,
    update(dt, t) {
      const started = typeof performance !== 'undefined' ? performance.now() : 0;
      if (!enabled || world.reducedMotion.value > 0.5 || reducedMotionQuery?.matches) {
        schedule(t);
        cpuMs = started > 0 ? performance.now() - started : 0;
        return;
      }

      if (phase === 'waiting' && t >= nextAt) {
        target = measureTarget();
        if (target) {
          phase = 'landing';
          phaseT = 0;
        } else schedule(t);
      }

      if (phase === 'waiting' || !target) {
        visible = 0;
        hideOverlay();
      } else {
        phaseT += dt;
        sampleDt = dt;
        visible = 1;
        const sc = clamp((target.capHeight * 0.95) / 126, 0.42, 0.7);
        const W = window.innerWidth;
        const off = SPRITE_FRAME * sc;
        if (phase === 'landing') {
          // One continuous curve in from off-screen right, high, easing out so it arrives slow
          // (no stop-dead at the T). It glides in on short flapping bursts, then flares.
          const k = clamp(phaseT / LAND_SECONDS, 0, 1);
          const u = 1 - (1 - k) * (1 - k);
          const x0 = W + off,
            y0 = target.y - Math.min(260, target.y + 40);
          const x = bez(x0, x0 - (x0 - target.x) * 0.45, target.x + 70 * sc, target.x, u);
          const y = bez(y0, y0 + 30 * sc, target.y - 110 * sc, target.y, u);
          const burst = phaseT < 1.2 || (phaseT > 1.8 && phaseT < 2.5);
          flap += dt * (burst ? 3.6 : 0.9);
          const flare = k > 0.84;
          showOverlay(
            x,
            y,
            sc,
            flare ? 'landing-legs' : 'landing',
            -8 * (1 - u),
            -1,
            flare ? 'flare' : flapFrameAt(flap),
          );
          if (k >= 1) {
            phase = 'perched';
            phaseT = 0;
            perchFor = 5 + rng() * 3;
          }
        } else if (phase === 'perched') {
          // A small settle on touchdown, then a gentle idle bob.
          const settle = phaseT < 0.35 ? Math.sin((phaseT / 0.35) * Math.PI) * 5 * sc : 0;
          const bob = settle + Math.max(0, Math.sin(phaseT * 1.3)) * 1.5 * sc;
          const call = phaseT > 1.4 && phaseT < 2.0;
          const frameName = call
            ? 'call'
            : phaseT > 2.8 && phaseT < 3.6
              ? 'head-left'
              : phaseT > 4.0 && phaseT < 4.8
                ? 'head-right'
                : 'idle';
          showOverlay(
            target.x,
            target.y + bob,
            sc,
            call ? 'call' : 'perched',
            0,
            -1,
            frameName,
            PERCHED_FOOT_Y,
          );
          if (phaseT >= perchFor) {
            phase = 'crouch';
            phaseT = 0;
          }
        } else if (phase === 'crouch') {
          const c = smooth01(phaseT / CROUCH_SECONDS);
          showOverlay(target.x, target.y + c * 3 * sc, sc, 'crouch', 0, -1, 'crouch');
          if (phaseT >= CROUCH_SECONDS) {
            phase = 'departing';
            phaseT = 0;
            flap = 0.25;
          }
        } else if (phase === 'departing') {
          // Springs up with hard wing beats, then climbs away up and to the left (the way it
          // faces) and leaves the top of the screen. No fade: it flies out of frame.
          const k = clamp(phaseT / DEPART_SECONDS, 0, 1);
          const u = 0.35 * k + 0.65 * k * k;
          const x0 = target.x,
            y0 = target.y + 3 * sc;
          const x3 = target.x - Math.min(W * 0.4, 520);
          const y3 = -off - 40;
          const x = bez(x0, x0 - 20 * sc, x0 + (x3 - x0) * 0.55, x3, u);
          const y = bez(y0, y0 - 120 * sc, y3 + (y0 - y3) * 0.35, y3, u);
          flap += dt * (phaseT < 1 ? 4.2 : 3.0);
          showOverlay(
            x,
            y,
            sc * (1 - 0.15 * k),
            'departing',
            8 * Math.min(1, phaseT * 3),
            -1,
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
