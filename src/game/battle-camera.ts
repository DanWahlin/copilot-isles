import type { BattleBeat } from '../world/battle/battle';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** How long each shot holds (s), and which beats may cut in on which. */
const HOLD: Record<BattleBeat, number> = {
  intro: 8,
  broadside: 3.2,
  incoming: 2.8,
  strike: 6,
  clear: 4,
  won: 10,
  breakoff: 3,
};
const PRIORITY: Record<BattleBeat, number> = {
  incoming: 1,
  broadside: 2,
  intro: 3,
  clear: 3,
  breakoff: 3,
  strike: 4,
  won: 5,
};
/** Gun beats don't move the camera more often than this (s), so it doesn't hunt. */
const GUN_COOLDOWN = 9;
/** After you drag or zoom, the director keeps its hands off for this long (s). */
const YIELD_SECONDS = 8;
/** Back to your own view after a shot, over about this long (s). */
const RETURN_SECONDS = 2.5;

/**
 * The battle's camera director (battle-plan.md §3). It frames each staging beat the battle reports
 * (the fog bank and its sails, your broadside and its target, a raider striking, the win), then hands
 * the view back to where you had it. It never fights you: drag or zoom and it stands off for a while.
 * With reduced motion it cuts instead of swooping. It moves the camera and orbit target in place and
 * allocates nothing per frame.
 */
export class BattleCamera {
  enabled = true;
  private shot: BattleBeat | null = null;
  private shotAt = 0;
  private shotUntil = 0;
  private cut = false;
  /** True when the shot starts from your own view (not from another shot or a return), so keep it. */
  private fresh = false;
  private fx = 0;
  private fz = 0;
  /** Which side of the line of fire the camera sits on (+1/−1), chosen once per shot. */
  private sgn = 1;
  private gunsAt = -1e9;
  private yieldUntil = -1e9;
  private returnUntil = -1e9;
  /** Your own camera offset from the ship (world axes), kept while a shot plays. */
  private readonly saved = { x: -30, y: 18, z: -30 };
  private lastX = 0;
  private lastZ = 0;
  private placed = false;
  private now = 0;

  constructor(private readonly reducedMotion: () => boolean) {}

  /** A beat from the battle at (x, z). */
  beat(kind: BattleBeat, x: number, z: number): void {
    if (!this.enabled) return;
    const t = this.now;
    if (t < this.yieldUntil && kind !== 'won') return;
    const gun = kind === 'broadside' || kind === 'incoming';
    if (gun && t - this.gunsAt < GUN_COOLDOWN) return;
    if (this.shot && t < this.shotUntil && PRIORITY[kind] < PRIORITY[this.shot]) return;
    if (gun) this.gunsAt = t;
    this.fresh = !(this.shot && t < this.shotUntil) && t >= this.returnUntil;
    this.shot = kind;
    this.shotAt = t;
    this.shotUntil = t + HOLD[kind];
    this.fx = x;
    this.fz = z;
    this.cut = this.reducedMotion();
    this.sgn = 0;
  }

  /** Call when the player drags or zooms: drop the shot and stand off. */
  yieldToUser(): void {
    this.shot = null;
    this.returnUntil = -1e9;
    this.yieldUntil = this.now + YIELD_SECONDS;
  }

  /** The shot playing now, for tests and the debug API. */
  get current(): BattleBeat | null {
    return this.shot;
  }

  /**
   * Moves `cam` and `target` for this frame. `look` is where you look in the ship's frame
   * (x to port, z to the bow). The camera always rides along with the ship first.
   */
  update(
    dt: number,
    t: number,
    sx: number,
    sz: number,
    heading: number,
    look: Vec3,
    cam: Vec3,
    target: Vec3,
  ): void {
    this.now = t;
    if (!this.placed) {
      this.placed = true;
      this.lastX = sx;
      this.lastZ = sz;
    }
    cam.x += sx - this.lastX;
    cam.z += sz - this.lastZ;
    this.lastX = sx;
    this.lastZ = sz;
    const rm = this.reducedMotion();

    if (this.shot && t >= this.shotUntil) {
      this.shot = null;
      if (rm) {
        cam.x = sx + this.saved.x;
        cam.y = this.saved.y;
        cam.z = sz + this.saved.z;
      } else this.returnUntil = t + RETURN_SECONDS;
    }

    if (this.shot && this.enabled) {
      if (this.sgn === 0) {
        // Keep your own view to come back to, and stay on the side of the line you're already on.
        if (this.fresh) {
          this.saved.x = cam.x - sx;
          this.saved.y = cam.y;
          this.saved.z = cam.z - sz;
        }
        this.returnUntil = -1e9;
        const ux = this.fx - sx;
        const uz = this.fz - sz;
        this.sgn = (cam.x - sx) * uz - (cam.z - sz) * ux >= 0 ? 1 : -1;
      }
      this.frame(t, sx, sz, heading, rm);
      const k = this.cut ? 1 : 1 - Math.exp(-dt * (rm ? 8 : 1.4));
      this.cut = false;
      cam.x += (want.x - cam.x) * k;
      cam.y += (want.y - cam.y) * k;
      cam.z += (want.z - cam.z) * k;
      target.x += (aim.x - target.x) * k;
      target.y += (aim.y - target.y) * k;
      target.z += (aim.z - target.z) * k;
    } else {
      const s = Math.sin(heading);
      const c = Math.cos(heading);
      const k = rm ? 1 : 1 - Math.exp(-dt * 4);
      target.x += (sx + look.x * c + look.z * s - target.x) * k;
      target.y += (look.y - target.y) * k;
      target.z += (sz - look.x * s + look.z * c - target.z) * k;
      if (t < this.returnUntil) {
        const r = 1 - Math.exp(-dt * 2);
        cam.x += (sx + this.saved.x - cam.x) * r;
        cam.y += (this.saved.y - cam.y) * r;
        cam.z += (sz + this.saved.z - cam.z) * r;
      }
    }
    if (cam.y < 3) cam.y = 3;
  }

  /** Where the current shot wants the camera (`want`) and the orbit target (`aim`). */
  private frame(t: number, sx: number, sz: number, heading: number, rm: boolean): void {
    let ux = this.fx - sx;
    let uz = this.fz - sz;
    const range = Math.hypot(ux, uz);
    if (range > 0.01) {
      ux /= range;
      uz /= range;
    } else {
      ux = Math.sin(heading);
      uz = Math.cos(heading);
    }
    // Perpendicular to the line from you to the focus, on the camera's side of it.
    const nx = uz * this.sgn;
    const nz = -ux * this.sgn;
    switch (this.shot) {
      case 'intro': {
        // Low, astern and off to one side: your ship in one third of the frame, the fog bank beyond.
        set(want, sx - ux * 34 + nx * 20, 6.5, sz - uz * 34 + nz * 20);
        const d = Math.min(range * 0.75, 170);
        set(aim, sx + ux * d, 11, sz + uz * d);
        break;
      }
      case 'broadside':
      case 'incoming': {
        // Abaft and off to one side, so both hulls, the smoke and the fall of shot are in frame.
        set(want, sx - ux * 24 + nx * 22, 13, sz - uz * 24 + nz * 22);
        const d = range * 0.45;
        set(aim, sx + ux * d, 4, sz + uz * d);
        break;
      }
      case 'strike': {
        // Near the struck raider, on your side of her, to watch the colours come down.
        const back = Math.min(range * 0.5, 44);
        set(want, this.fx - ux * back + nx * 16, 9, this.fz - uz * back + nz * 16);
        set(aim, this.fx, 5, this.fz);
        break;
      }
      case 'clear':
      case 'breakoff': {
        // Rise up astern of your ship to show the sea around her.
        const fx = Math.sin(heading);
        const fz = Math.cos(heading);
        set(want, sx - fx * 34 + nx * 10, this.shot === 'clear' ? 24 : 30, sz - fz * 34 + nz * 10);
        set(aim, sx, 3, sz);
        break;
      }
      case 'won': {
        // A slow turn round your ship (held still with reduced motion).
        const a = heading + Math.PI * 0.75 + (rm ? 0 : (t - this.shotAt) * 0.09);
        set(want, sx + Math.sin(a) * 42, 15, sz + Math.cos(a) * 42);
        set(aim, sx, 5, sz);
        break;
      }
    }
  }
}

const want = { x: 0, y: 0, z: 0 };
const aim = { x: 0, y: 0, z: 0 };

function set(v: Vec3, x: number, y: number, z: number): void {
  v.x = x;
  v.y = y;
  v.z = z;
}
