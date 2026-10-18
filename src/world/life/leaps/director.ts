import { Matrix4, PerspectiveCamera, Vector2, Vector3 } from 'three/webgpu';
import type { HeightField } from '../../contracts';
import { COVE } from '../../layout';
import type { QuietSea } from '../quiet-sea';
import { seededRandom } from '../../../util/math';

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export type LeapKind = 'dolphin' | 'fish';

export interface LeapArc {
  kind: LeapKind;
  start: Vector3;
  end: Vector3;
  controlHeight: number;
  duration: number;
  school: number;
  seed: number;
}

export interface ProjectedArc {
  arc: LeapArc;
  rect: ScreenRect;
  points: Vector2[];
}

export interface DirectorOptions {
  seed?: number;
  heightField?: HeightField | null;
  titleMode?: boolean;
  viewport?: ViewportSize;
  avoidRects?: ScreenRect[];
  /** Stretches of sea to keep out of (a battle, a puzzle's course). */
  quiet?: QuietSea | null;
}

/**
 * How big a creature must look (px) for a leap to be shown in the game: its splashes only read as a
 * dolphin's or a flying fish's if you can see the animal too. A dolphin's length; a flying fish's
 * wingspan (its widest look).
 */
export const LEAP_MIN_PIXELS = { dolphin: 24, fish: 14 } as const;
const LEAP_SPAN = { dolphin: 3.2, fish: 1.3 } as const;

/** The size (px) of something `length` m across, `distance` m from a camera of `fovDeg` and `zoom`. */
export function leapPixels(
  length: number,
  distance: number,
  fovDeg: number,
  viewportHeight: number,
  zoom = 1,
): number {
  const half = Math.tan((fovDeg * Math.PI) / 360) / Math.max(1e-3, zoom);
  return (length * viewportHeight) / (2 * Math.max(1e-3, distance) * half);
}

const tmpForward = new Vector3();
const tmpRight = new Vector3();
const tmpPoint = new Vector3();
const tmpProjected = new Vector3();
const viewProjection = new Matrix4();

function randomSeed(rng: () => number): number {
  return Math.floor(rng() * 0xffffffff) >>> 0;
}

function rectsIntersect(a: ScreenRect, b: ScreenRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function rectInside(rect: ScreenRect, viewport: ViewportSize, margin = 8): boolean {
  return (
    rect.x >= margin &&
    rect.y >= margin &&
    rect.x + rect.w <= viewport.width - margin &&
    rect.y + rect.h <= viewport.height - margin
  );
}

function pointAt(arc: LeapArc, u: number, out = new Vector3()): Vector3 {
  out.lerpVectors(arc.start, arc.end, u);
  out.y = Math.sin(Math.PI * u) * arc.controlHeight + 0.25;
  return out;
}

function predictArcPoints(arc: LeapArc, samples = 18): Vector3[] {
  const points: Vector3[] = [];
  for (let i = 0; i <= samples; i++) points.push(pointAt(arc, i / samples, new Vector3()));
  return points;
}

export function projectArc(
  arc: LeapArc,
  camera: PerspectiveCamera,
  viewport: ViewportSize,
  padding = 24,
): ProjectedArc | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const points: Vector2[] = [];
  viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const radius = arc.kind === 'dolphin' ? 34 : 16;
  for (let i = 0; i <= 18; i++) {
    pointAt(arc, i / 18, tmpPoint);
    tmpProjected.copy(tmpPoint).applyMatrix4(viewProjection);
    if (tmpProjected.z < -1 || tmpProjected.z > 1) return null;
    const x = (tmpProjected.x * 0.5 + 0.5) * viewport.width;
    const y = (0.5 - tmpProjected.y * 0.5) * viewport.height;
    points.push(new Vector2(x, y));
    minX = Math.min(minX, x - radius);
    maxX = Math.max(maxX, x + radius);
    minY = Math.min(minY, y - radius);
    maxY = Math.max(maxY, y + radius);
  }
  return {
    arc,
    rect: {
      x: minX - padding,
      y: minY - padding,
      w: maxX - minX + padding * 2,
      h: maxY - minY + padding * 2,
    },
    points,
  };
}

function isOpenWater(
  heightField: HeightField | null | undefined,
  x: number,
  z: number,
  titleMode: boolean,
): boolean {
  if (titleMode || !heightField) return true;
  const h = heightField.heightAt(x, z);
  if (h > -3) return false;
  if (shoreDistance(heightField, x, z) < 60) return false;
  const harborD = Math.hypot(x - COVE.harbor.center.x, z - COVE.harbor.center.z);
  if (harborD < COVE.harbor.radius + 35 && z < COVE.quay.z + 12) return false;
  if (Math.hypot(x - COVE.pier.x, z - (COVE.pier.z0 + COVE.pier.z1) * 0.5) < 70) return false;
  return true;
}

function shoreDistance(heightField: HeightField | null | undefined, x: number, z: number): number {
  if (!heightField) return Infinity;
  let best = Infinity;
  for (let r = 8; r <= 72; r += 8) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      if (heightField.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r) > -0.75) best = Math.min(best, r);
    }
  }
  return best;
}

function hasTerrainBackdrop(
  arc: LeapArc,
  camera: PerspectiveCamera,
  heightField: HeightField | null | undefined,
): boolean {
  if (!heightField) return false;
  for (const p of predictArcPoints(arc, 8)) {
    tmpForward.copy(p).sub(camera.position);
    tmpForward.y = 0;
    if (tmpForward.lengthSq() < 0.001) continue;
    tmpForward.normalize();
    for (let d = 18; d <= 150; d += 18) {
      const sx = p.x + tmpForward.x * d;
      const sz = p.z + tmpForward.z * d;
      if (heightField.heightAt(sx, sz) > -0.75) return true;
    }
  }
  return false;
}

function cameraBasis(camera: PerspectiveCamera): { forward: Vector3; right: Vector3 } {
  camera.getWorldDirection(tmpForward);
  tmpForward.y = 0;
  if (tmpForward.lengthSq() < 1e-4) tmpForward.set(0, 0, -1);
  tmpForward.normalize();
  tmpRight.set(tmpForward.z, 0, -tmpForward.x).normalize();
  return { forward: tmpForward, right: tmpRight };
}

export class LeapsDirector {
  private rng: () => number;
  avoidRects: ScreenRect[];
  viewport: ViewportSize;

  constructor(private readonly options: DirectorOptions = {}) {
    this.rng = seededRandom(options.seed ?? 0x1ea9_5eed);
    this.avoidRects = options.avoidRects ?? [];
    this.viewport = options.viewport ?? { width: 1280, height: 720 };
  }

  setAvoidRects(rects: ScreenRect[]): void {
    this.avoidRects = rects;
  }

  setViewport(viewport: ViewportSize): void {
    this.viewport = viewport;
  }

  reset(seed: number): void {
    this.rng = seededRandom(seed);
  }

  next(camera: PerspectiveCamera, kind: LeapKind | 'any' = 'any'): ProjectedArc | null {
    const selected: LeapKind = kind === 'any' ? (this.rng() < 0.54 ? 'fish' : 'dolphin') : kind;
    const basis = cameraBasis(camera);
    const minD = this.options.titleMode ? 65 : 35;
    // In the game, no farther than the animal still reads at (checked again for the arc below).
    const readable =
      (LEAP_SPAN[selected] * this.viewport.height) /
      ((2 * LEAP_MIN_PIXELS[selected] * Math.tan((camera.fov * Math.PI) / 360)) / camera.zoom);
    const maxD = this.options.titleMode ? 250 : Math.max(minD + 5, Math.min(185, readable));
    for (let attempt = 0; attempt < 160; attempt++) {
      const dist = minD + this.rng() * (maxD - minD);
      const lateral = (this.rng() - 0.5) * dist * 1.05;
      const start = camera.position
        .clone()
        .addScaledVector(basis.forward, dist)
        .addScaledVector(basis.right, lateral);
      start.y = 0;
      const directionSign = this.rng() < 0.5 ? -1 : 1;
      const travelAngle = (this.rng() - 0.5) * 0.8 + directionSign * 0.9;
      const dir = basis.forward
        .clone()
        .multiplyScalar(Math.cos(travelAngle))
        .addScaledVector(basis.right, Math.sin(travelAngle))
        .normalize();
      const length = selected === 'dolphin' ? 20 + this.rng() * 28 : 16 + this.rng() * 30;
      const end = start.clone().addScaledVector(dir, length);
      const title = !!this.options.titleMode;
      if (!isOpenWater(this.options.heightField, start.x, start.z, title)) continue;
      if (!isOpenWater(this.options.heightField, end.x, end.z, title)) continue;
      const quiet = this.options.quiet;
      if (quiet && (quiet.blocks(start.x, start.z, 25) || quiet.blocks(end.x, end.z, 25))) continue;
      const arc: LeapArc = {
        kind: selected,
        start,
        end,
        controlHeight: selected === 'dolphin' ? 3.6 + this.rng() * 4.8 : 0.8 + this.rng() * 1.5,
        duration: selected === 'dolphin' ? 1.6 + this.rng() * 1.0 : 2.2 + this.rng() * 2.0,
        // In the game a pod is small: a few animals you can follow, not a burst of splashes.
        school:
          selected === 'dolphin'
            ? (title ? 2 : 1) + Math.floor(this.rng() * 3)
            : title
              ? 5 + Math.floor(this.rng() * 8)
              : 2 + Math.floor(this.rng() * 3),
        seed: randomSeed(this.rng),
      };
      if (!title) {
        // Close enough to see the animal, not just its splashes.
        tmpPoint.lerpVectors(start, end, 0.5);
        tmpPoint.y = arc.controlHeight * 0.5;
        const px = leapPixels(
          LEAP_SPAN[selected],
          tmpPoint.distanceTo(camera.position),
          camera.fov,
          this.viewport.height,
          camera.zoom,
        );
        if (px < LEAP_MIN_PIXELS[selected]) continue;
      }
      if (!title && hasTerrainBackdrop(arc, camera, this.options.heightField)) continue;
      const projected = projectArc(arc, camera, this.viewport);
      if (!projected || !rectInside(projected.rect, this.viewport)) continue;
      if (this.avoidRects.some((rect) => rectsIntersect(projected.rect, rect))) continue;
      return projected;
    }
    return null;
  }
}
