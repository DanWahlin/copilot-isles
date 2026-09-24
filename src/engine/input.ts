/**
 * Input (Phase 0 T2): keyboard (WASD/arrows), hold-right-mouse (or pointer-lock) look, wheel zoom,
 * and the standard gamepad mapping. Call `poll()` once per frame, then read the snapshot.
 * Rebinding and touch controls arrive with the settings UI (Phase 1) and phones (Phase 2b).
 */
export interface InputState {
  /** Movement intent: x = strafe right, y = forward; length ≤ 1. */
  moveX: number;
  moveY: number;
  /** Look deltas this frame (radians-ish units; mouse is pre-scaled). */
  lookX: number;
  lookY: number;
  zoom: number;
  run: boolean;
  /** Edge-triggered actions (true for exactly one poll). */
  interact: boolean;
  jump: boolean;
  map: boolean;
  menu: boolean;
  usingGamepad: boolean;
}

const KEYMAP: Record<string, keyof InputState | 'up' | 'down' | 'left' | 'right'> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  KeyE: 'interact',
  Enter: 'interact',
  Space: 'jump',
  KeyM: 'map',
  Escape: 'menu',
};

const EDGE = new Set(['interact', 'jump', 'map', 'menu']);

export class Input {
  readonly state: InputState = {
    moveX: 0,
    moveY: 0,
    lookX: 0,
    lookY: 0,
    zoom: 0,
    run: false,
    interact: false,
    jump: false,
    map: false,
    menu: false,
    usingGamepad: false,
  };
  /** When false (dialogue, menus), movement and look read as zero; edges still fire. */
  enabled = true;
  mouseSensitivity = 0.0032;
  invertY = false;

  private held = new Set<string>();
  private pressed = new Set<string>();
  private look = [0, 0];
  private wheel = 0;
  private rmb = false;
  private padEdges = new Map<number, boolean>();
  private readonly el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.onBlur);
    el.addEventListener('pointerdown', this.onPointer);
    window.addEventListener('pointerup', this.onPointer);
    window.addEventListener('pointermove', this.onMove);
    el.addEventListener('wheel', this.onWheel, { passive: true });
    el.addEventListener('contextmenu', this.onContext);
  }

  private readonly onKey = (e: KeyboardEvent) => {
    const a = KEYMAP[e.code];
    if (!a) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.type === 'keydown') {
      if (!e.repeat && EDGE.has(a)) this.pressed.add(a);
      this.held.add(a);
    } else this.held.delete(a);
  };
  private readonly onBlur = () => {
    this.held.clear();
    this.rmb = false;
  };
  private readonly onPointer = (e: PointerEvent) => {
    if (e.button !== 2) return;
    this.rmb = e.type === 'pointerdown';
    if (this.rmb) this.el.setPointerCapture?.(e.pointerId);
  };
  private readonly onMove = (e: PointerEvent) => {
    if (!this.rmb && document.pointerLockElement !== this.el) return;
    this.look[0] += e.movementX;
    this.look[1] += e.movementY;
  };
  private readonly onWheel = (e: WheelEvent) => {
    this.wheel += Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 60);
  };
  private readonly onContext = (e: Event) => e.preventDefault();

  poll(): InputState {
    const s = this.state;
    let mx = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
    let my = (this.held.has('up') ? 1 : 0) - (this.held.has('down') ? 1 : 0);
    let lx = this.look[0] * this.mouseSensitivity;
    let ly = this.look[1] * this.mouseSensitivity;
    let run = this.held.has('run');
    const edges = new Set(this.pressed);

    const pad = navigator.getGamepads?.().find((p) => p && p.connected && p.mapping === 'standard');
    if (pad) {
      const dz = (v: number) => (Math.abs(v) < 0.14 ? 0 : (v - Math.sign(v) * 0.14) / 0.86);
      const ax = dz(pad.axes[0] ?? 0),
        ay = dz(pad.axes[1] ?? 0);
      const rx = dz(pad.axes[2] ?? 0),
        ry = dz(pad.axes[3] ?? 0);
      if (ax || ay || rx || ry || pad.buttons.some((b) => b.pressed)) s.usingGamepad = true;
      mx += ax;
      my -= ay;
      lx += rx * 0.045;
      ly += ry * 0.035;
      run ||= !!pad.buttons[10]?.pressed || (pad.buttons[7]?.value ?? 0) > 0.5;
      const btn = (i: number, action: string) => {
        const down = !!pad.buttons[i]?.pressed;
        if (down && !this.padEdges.get(i)) edges.add(action);
        this.padEdges.set(i, down);
      };
      btn(0, 'interact');
      btn(3, 'jump');
      btn(8, 'map');
      btn(9, 'menu');
    }
    if (this.held.size || this.look[0] || this.look[1]) s.usingGamepad = false;

    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    const on = this.enabled;
    s.moveX = on ? mx : 0;
    s.moveY = on ? my : 0;
    s.lookX = on ? lx : 0;
    s.lookY = on ? (this.invertY ? -ly : ly) : 0;
    s.zoom = on ? this.wheel : 0;
    s.run = on && run;
    s.interact = edges.has('interact');
    s.jump = on && edges.has('jump');
    s.map = edges.has('map');
    s.menu = edges.has('menu');

    this.pressed.clear();
    this.look[0] = this.look[1] = 0;
    this.wheel = 0;
    return s;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
    this.el.removeEventListener('pointerdown', this.onPointer);
    window.removeEventListener('pointerup', this.onPointer);
    window.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('wheel', this.onWheel);
    this.el.removeEventListener('contextmenu', this.onContext);
  }
}
