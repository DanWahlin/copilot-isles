/** Where a wreck lies: her waterline origin (world), heading, bow pitch and heel (three's 'YXZ' order). */
export interface WreckPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly pitch: number;
  readonly heel: number;
}

interface Vec3Out {
  x: number;
  y: number;
  z: number;
}

/**
 * A wreck's own frame (ship-local: +x port, +y up, +z bow, waterline at 0) in the world, as plain
 * numbers: her mesh, her weathering, her ship obstacles and the ground under her all place things
 * from it, so they agree.
 */
export class WreckFrame {
  private readonly ch: number;
  private readonly sh: number;
  private readonly cp: number;
  private readonly sp: number;
  private readonly cr: number;
  private readonly sr: number;

  constructor(readonly pose: WreckPose) {
    this.ch = Math.cos(pose.heading);
    this.sh = Math.sin(pose.heading);
    this.cp = Math.cos(pose.pitch);
    this.sp = Math.sin(pose.pitch);
    this.cr = Math.cos(pose.heel);
    this.sr = Math.sin(pose.heel);
  }

  /** A wreck-local point in world space (yaw, then pitch, then roll). */
  toWorld(x: number, y: number, z: number, out: Vec3Out): Vec3Out {
    const { ch, sh, cp, sp, cr, sr } = this;
    const x1 = x * cr - y * sr;
    const y1 = x * sr + y * cr;
    const y2 = y1 * cp - z * sp;
    const z2 = y1 * sp + z * cp;
    out.x = this.pose.x + x1 * ch + z2 * sh;
    out.y = this.pose.y + y2;
    out.z = this.pose.z - x1 * sh + z2 * ch;
    return out;
  }

  /** World-down in the wreck's own frame (what hanging ropes and rags follow). */
  down(out: Vec3Out): Vec3Out {
    out.x = -this.cp * this.sr;
    out.y = -this.cp * this.cr;
    out.z = this.sp;
    return out;
  }
}
