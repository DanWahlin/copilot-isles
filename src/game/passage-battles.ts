import type { IslesAudio } from '../audio';
import type { Engine } from '../engine/engine';
import type { InputState } from '../engine/input';
import type { CoveScene } from '../world/cove-scene';
import type { ShipDynamics } from '../world/ship';
import type { BattleRun } from './battle-run';
import {
  HARBOUR_RADIUS,
  battleDestination,
  battleStarts,
  nearHarbour,
  openWater,
  pendingBattle,
  type PassageBattle,
} from './battles';
import type { FollowCamera } from './follow-camera';
import type { Helm } from './helm';
import type { IslandBerth } from './islands';
import type { PerspectiveCamera } from 'three/webgpu';

type Islands = Readonly<Record<string, IslandBerth>>;

export interface PassageBattlesOptions {
  engine: Engine;
  cove: CoveScene;
  audio: IslesAudio | null;
  hudParent: HTMLElement;
  islands: Islands;
  /** Battles already fought or skipped (from the save). */
  done: readonly string[];
  quests(): Readonly<Record<string, string>>;
  /** Whether an island's berth is open to you. */
  open(id: string): boolean;
  /** A battle was won or skipped: save it. */
  onDone(id: string, how: 'won' | 'skipped'): void;
  /** A short HUD line ("The raiders fall back into the fog…"). */
  toast(text: string, seconds: number): void;
  /** A battle's first wave starts (after the briefing): its id, for its chart label. */
  onStart?(id: string): void;
}

/** How often (s) the trigger and the zone are checked while you sail. */
const CHECK_EVERY = 0.25;

/**
 * The passage battles in the game (docs/specs/BATTLES.md §2.0, §3): it builds and warms the battle
 * when you board with one waiting, starts it once you're out on open water about halfway across,
 * rests it if you sail into a harbour, keeps the destination's berth shut until it's won or
 * skipped, and saves it as done. The battle itself loads lazily (`battle-run.ts`).
 */
export class PassageBattles {
  readonly done: Set<string>;
  private run: BattleRun | null = null;
  private loading: Promise<void> | null = null;
  private battle: PassageBattle | null = null;
  /** The island the battle's passage sails toward. */
  private to: string | null = null;
  private checkIn = 0;
  private disposed = false;
  private quiet = false;

  constructor(private readonly o: PassageBattlesOptions) {
    this.done = new Set(o.done);
  }

  /** True from the lookout's call until the battle is won or skipped. */
  get active(): boolean {
    return !!this.run?.active;
  }

  /** The battle's run (tests, the debug API), once it's built. */
  get current(): BattleRun | null {
    return this.run;
  }

  /**
   * Loads the battle's code ahead (no GPU work) when a battle waits on the passage out of `from`, so
   * boarding can build it behind the fade without waiting on the download.
   */
  prefetch(from: string): void {
    if (pendingBattle(from, this.o.quests(), this.done, this.o.islands, this.o.open))
      void import('./battle-run').catch(() => undefined);
  }

  /** Boarding at `from`: if its passage holds a battle, build it and warm it while you sail out. */
  prepare(from: string): Promise<void> {
    if (this.run || this.loading) return this.loading ?? Promise.resolve();
    const b = pendingBattle(from, this.o.quests(), this.done, this.o.islands, this.o.open);
    if (!b) return Promise.resolve();
    this.battle = b;
    this.to = battleDestination(b, this.o.islands);
    this.loading = import('./battle-run')
      .then(({ BattleRun }) => {
        if (this.disposed || this.battle !== b) return;
        this.run = new BattleRun({
          engine: this.o.engine,
          cove: this.o.cove,
          audio: this.o.audio,
          hudParent: this.o.hudParent,
          plan: b.plan,
          openWater: (x, z) => openWater(x, z, this.o.islands, 60),
          // Raiders run aground like you do (every island's terrain).
          ground: this.o.cove.heightField,
          onEnd: (how) => this.end(b, how),
          onStart: () => this.o.onStart?.(b.id),
        });
        return this.run.ready;
      })
      .catch((err: unknown) => console.error('[battles]', err))
      .finally(() => (this.loading = null));
    return this.loading;
  }

  private end(b: PassageBattle, how: 'won' | 'skipped', quiet = false): void {
    this.done.add(b.id);
    // The win card says it all; a skip gets a word so you know you can sail on.
    if (how === 'skipped' && !quiet && !this.quiet) this.o.toast('Battle skipped. You can sail on.', 3);
    this.o.onDone(b.id, how);
  }

  /** Skip battle (the HUD and the pause menu): it counts as done, with no penalty and no reward. */
  skip(): void {
    if (this.run && !this.run.ended) this.run.skip();
  }

  /**
   * One frame while you're sailing. Starts the battle at the right place, rests it out of the zone,
   * then runs it. Returns true when the battle took the helm this frame (your helmsman, or a question
   * waiting), so the caller leaves the helm alone. Call before the follow camera updates.
   */
  frame(
    dt: number,
    s: InputState,
    helm: Helm,
    dyn: ShipDynamics,
    cam: FollowCamera,
    camera: PerspectiveCamera,
  ): boolean {
    const run = this.run;
    if (!run) return false;
    const p = dyn.pose;
    if ((this.checkIn -= dt) <= 0) {
      this.checkIn = CHECK_EVERY;
      if (!run.started) {
        if (run.warmed && battleStarts(this.battle, p.x, p.z, this.o.islands)) run.begin();
      } else if (!run.ended) {
        // Raiders never follow you into a harbour; back out past it, the same wave comes again.
        if (!run.resting && nearHarbour(p.x, p.z, this.o.islands)) {
          run.suspend();
          if (run.resting)
            this.o.toast('The raiders fall back into the fog. Sail back out to finish the fight.', 5);
        } else if (run.resting && !nearHarbour(p.x, p.z, this.o.islands, HARBOUR_RADIUS + 80)) run.resume();
      }
    }
    const took = run.steer(dt, s, helm, dyn);
    run.update(dt, s, dyn, cam, camera);
    if (run.spent()) this.release(cam);
    return took;
  }

  /** Whether the battle keeps you from docking at `to` (its destination, until it's won or skipped). */
  blocksDock(to: string): boolean {
    return !!this.run?.active && to === this.to;
  }

  /** The battle owns the dock key (gamepad A fires; E answers its questions). */
  get ownsKeys(): boolean {
    return this.active;
  }

  /** You left the ship (docking): an unfinished battle rests, and is built again next time you board. */
  leftShip(cam: FollowCamera): void {
    this.release(cam);
  }

  /**
   * Fast travel from `from` to `to`: a jump to a waiting battle's destination skips it, and it
   * counts as done (BATTLES.md §2.0). Anything else just rests it.
   */
  travel(from: string, to: string, cam: FollowCamera): void {
    const run = this.run;
    const b = this.battle ?? pendingBattle(from, this.o.quests(), this.done, this.o.islands, this.o.open);
    if (b && !this.done.has(b.id) && battleDestination(b, this.o.islands) === to) {
      if (run && !run.ended) {
        this.quiet = true;
        run.skip();
        this.quiet = false;
      } else if (!run?.ended) this.end(b, 'skipped', true);
    }
    this.release(cam);
  }

  private release(cam: FollowCamera): void {
    this.run?.dispose(cam);
    this.run = null;
    this.battle = null;
    this.to = null;
  }

  dispose(cam: FollowCamera): void {
    this.disposed = true;
    this.release(cam);
  }
}
