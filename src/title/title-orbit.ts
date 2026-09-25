import { clamp, smoothstep } from '../util/math';

/**
 * Drag-to-look for the title backdrop: dragging orbits the camera round the anchored ship and tilts
 * it up or down, a flick keeps turning with momentum, the wheel zooms, and the slow auto-orbit picks
 * up again once you let go. Pure state so it can be tested without a DOM; `bindTitleDrag` wires it
 * to the canvas.
 */
export class TitleOrbit {
  /** Radians round the ship. */
  yaw: number;
  /** Camera height above the sea (m). */
  height = 7.5;
  /** Distance from the ship (m). */
  radius = 58;
  dragging = false;
  private vel = 0;
  private lastX = 0;
  private lastY = 0;
  private lastT = 0;
  private idle = 99;

  static readonly YAW_PER_PX = 0.0055;
  static readonly HEIGHT_PER_PX = 0.035;
  static readonly HEIGHT = [3.2, 20] as const;
  static readonly RADIUS = [38, 82] as const;
  /** The auto-orbit's speed (rad/s) and how long after a drag it takes to come back. */
  static readonly AUTO = 0.012;
  static readonly RESUME = 2.5;

  constructor(yaw = 0.35) {
    this.yaw = yaw;
  }

  down(x: number, y: number, t: number): void {
    this.dragging = true;
    this.vel = 0;
    this.lastX = x;
    this.lastY = y;
    this.lastT = t;
    this.idle = 0;
  }

  move(x: number, y: number, t: number): void {
    if (!this.dragging) return;
    const dx = x - this.lastX;
    const dy = y - this.lastY;
    const dyaw = -dx * TitleOrbit.YAW_PER_PX;
    this.yaw += dyaw;
    this.height = clamp(this.height + dy * TitleOrbit.HEIGHT_PER_PX, ...TitleOrbit.HEIGHT);
    const dt = Math.max(1e-3, t - this.lastT);
    // Smoothed angular velocity for the flick.
    this.vel = this.vel * 0.6 + (dyaw / dt) * 0.4;
    this.lastX = x;
    this.lastY = y;
    this.lastT = t;
  }

  up(t: number): void {
    if (!this.dragging) return;
    this.dragging = false;
    // A pause before letting go means no flick.
    if (t - this.lastT > 0.12) this.vel = 0;
    this.vel = clamp(this.vel, -3, 3);
    this.idle = 0;
  }

  zoom(deltaY: number): void {
    this.radius = clamp(this.radius * Math.pow(1.0015, deltaY), ...TitleOrbit.RADIUS);
    this.idle = 0;
  }

  update(dt: number, reducedMotion: boolean): void {
    if (this.dragging) return;
    if (reducedMotion) this.vel = 0;
    this.yaw += this.vel * dt;
    this.vel *= Math.exp(-2.2 * dt);
    if (Math.abs(this.vel) < 1e-3) this.vel = 0;
    this.idle += dt;
    const auto = reducedMotion ? 0 : TitleOrbit.AUTO * smoothstep(0, 1, this.idle / TitleOrbit.RESUME);
    this.yaw += auto * dt;
  }
}

/**
 * Hooks the orbit to pointer and wheel events on the canvas while `active()` (the title menu is up),
 * with grab cursors. Returns a cleanup function.
 */
export function bindTitleDrag(canvas: HTMLElement, orbit: TitleOrbit, active: () => boolean): () => void {
  const now = () => performance.now() / 1000;
  let pointer: number | null = null;
  const setCursor = () => {
    canvas.style.cursor = active() ? (orbit.dragging ? 'grabbing' : 'grab') : '';
  };
  const onDown = (e: PointerEvent) => {
    if (!active() || pointer !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pointer = e.pointerId;
    canvas.setPointerCapture?.(e.pointerId);
    orbit.down(e.clientX, e.clientY, now());
    document.documentElement.classList.add('ci-title-dragged');
    setCursor();
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerId === pointer) orbit.move(e.clientX, e.clientY, now());
    else if (pointer === null) setCursor();
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    orbit.up(now());
    setCursor();
  };
  const onWheel = (e: WheelEvent) => {
    if (!active()) return;
    e.preventDefault();
    orbit.zoom(e.deltaY);
  };
  const prevTouch = canvas.style.touchAction;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  setCursor();
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.style.touchAction = prevTouch;
    canvas.style.cursor = '';
    document.documentElement.classList.remove('ci-title-dragged');
  };
}
