import {
  CircleGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
  type Bone,
} from 'three/webgpu';

export type MouthShape = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'X';
export type FaceExpression = 'neutral' | 'happy' | 'concerned' | 'surprised';

export interface MouthCue {
  readonly start: number;
  readonly end: number;
  readonly value: MouthShape;
}

export interface FacialLine {
  readonly duration: number;
  readonly mouthCues?: readonly MouthCue[];
  readonly expression?: FaceExpression;
}

export interface BlinkState {
  readonly openness: number;
  readonly justStarted: boolean;
}

const SHAPE_OPEN: Record<MouthShape, readonly [wide: number, open: number]> = {
  X: [0.1, 0.02],
  A: [0.16, 0.04],
  B: [0.1, 0.02],
  C: [0.2, 0.15],
  D: [0.16, 0.2],
  E: [0.25, 0.08],
  F: [0.12, 0.05],
  G: [0.16, 0.12],
  H: [0.14, 0.17],
};

const MOUTH_SET = new Set<MouthShape>(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X']);
const TMP_SCALE = new Vector3();

export function isMouthShape(value: string): value is MouthShape {
  return MOUTH_SET.has(value as MouthShape);
}

export function mouthShapeAt(cues: readonly MouthCue[] | undefined, time: number): MouthShape {
  if (!cues?.length || time < 0) return 'X';
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cue = cues[mid]!;
    if (time < cue.start) hi = mid - 1;
    else if (time >= cue.end) lo = mid + 1;
    else return cue.value;
  }
  return 'X';
}

export class BlinkScheduler {
  private t = 0;
  private next = 0;
  private blinking = false;
  private blinkT = 0;
  private remaining = 0;

  constructor(private readonly random: () => number = Math.random) {
    this.schedule();
  }

  update(dt: number): BlinkState {
    this.t += Math.max(0, dt);
    let justStarted = false;
    if (!this.blinking && this.t >= this.next) {
      this.blinking = true;
      this.blinkT = 0;
      this.remaining = this.random() < 0.18 ? 2 : 1;
      justStarted = true;
    }
    if (!this.blinking) return { openness: 1, justStarted };

    this.blinkT += Math.max(0, dt);
    const cycle = 0.16;
    const phase = Math.min(1, this.blinkT / cycle);
    const openness = 1 - Math.sin(phase * Math.PI);
    if (phase >= 1) {
      this.remaining--;
      if (this.remaining > 0) this.blinkT = -0.07;
      else {
        this.blinking = false;
        this.schedule();
        return { openness: 1, justStarted };
      }
    }
    return { openness: MathUtils.clamp(openness, 0, 1), justStarted };
  }

  private schedule(): void {
    this.next = this.t + 2 + this.random() * 4;
  }
}

export class StableSpring {
  value = 0;
  velocity = 0;

  constructor(
    private readonly frequency = 5.2,
    private readonly damping = 0.74,
  ) {}

  update(target: number, dt: number): number {
    const step = Math.min(0.05, Math.max(0, dt));
    const omega = Math.PI * 2 * this.frequency;
    const accel = (target - this.value) * omega * omega - 2 * this.damping * omega * this.velocity;
    this.velocity += accel * step;
    this.value += this.velocity * step;
    if (!Number.isFinite(this.value) || !Number.isFinite(this.velocity)) {
      this.value = target;
      this.velocity = 0;
    }
    return this.value;
  }
}

export class CharacterFace {
  private readonly root = new Group();
  private readonly blink = new BlinkScheduler();
  private readonly irisL: Mesh;
  private readonly irisR: Mesh;
  private readonly catchL: Mesh;
  private readonly catchR: Mesh;
  private readonly lidL: Mesh;
  private readonly lidR: Mesh;
  private readonly browL: Mesh;
  private readonly browR: Mesh;
  private readonly mouth: Mesh;
  private readonly teeth: Mesh;
  private readonly tongue: Mesh;
  private readonly springs: {
    readonly object: Object3D;
    readonly x: StableSpring;
    readonly z: StableSpring;
  }[] = [];
  private expression: FaceExpression = 'neutral';
  private mouthCues: readonly MouthCue[] = [];
  private speechStarted = 0;
  private speaking = false;
  private clock = Math.random() * 10;
  private dartAt = 0.45 + Math.random() * 1.4;
  private dartX = 0;
  private dartY = 0;
  private gazeX = 0;
  private gazeY = 0;
  private readonly headLocalTarget = new Vector3();

  constructor(
    private readonly head: Bone,
    private readonly body: string,
  ) {
    this.root.name = 'character-face';
    this.root.renderOrder = 3;
    this.root.position.set(0, 0.065, 0.292);
    head.updateWorldMatrix(true, false);
    const scalar = 1 / Math.max(0.001, head.getWorldScale(TMP_SCALE).x);
    this.root.position.multiplyScalar(scalar);
    this.root.scale.setScalar(scalar);
    head.add(this.root);

    this.addCircle('eye white L', 0xffffff, -0.122, 0, 0.003, 0.068, 1.12).renderOrder = 4;
    this.addCircle('eye white R', 0xffffff, 0.122, 0, 0.003, 0.068, 1.12).renderOrder = 4;
    this.irisL = this.addCircle(
      'iris L',
      body === 'nell' ? 0x4b5a35 : 0x27384b,
      -0.122,
      -0.004,
      0.01,
      0.026,
      1,
    );
    this.irisR = this.addCircle(
      'iris R',
      body === 'nell' ? 0x4b5a35 : 0x27384b,
      0.122,
      -0.004,
      0.01,
      0.026,
      1,
    );
    this.irisL.renderOrder = 6;
    this.irisR.renderOrder = 6;
    this.catchL = this.addCircle('catchlight L', 0xffffff, -0.132, 0.017, 0.015, 0.011, 1);
    this.catchR = this.addCircle('catchlight R', 0xffffff, 0.112, 0.017, 0.015, 0.011, 1);
    this.catchL.renderOrder = 9;
    this.catchR.renderOrder = 9;
    this.lidL = this.addPlane('lid L', 0xd6a078, -0.122, 0.018, 0.018, 0.152, 0.02);
    this.lidR = this.addPlane('lid R', 0xd6a078, 0.122, 0.018, 0.018, 0.152, 0.02);
    this.lidL.renderOrder = 8;
    this.lidR.renderOrder = 8;
    this.browL = this.addPlane('brow L', 0x6c2d1c, -0.123, 0.084, 0.017, 0.105, 0.012);
    this.browR = this.addPlane('brow R', 0x6c2d1c, 0.123, 0.084, 0.017, 0.105, 0.012);
    this.mouth = this.addCircle('mouth', 0x331414, 0, -0.125, 0.09, 0.5, 1);
    this.mouth.renderOrder = 6;
    this.mouth.scale.set(0.09, 0.008, 1);
    this.teeth = this.addPlane('teeth', 0xfff3dd, 0, -0.106, 0.11, 0.09, 0.022);
    this.tongue = this.addPlane('tongue', 0xc65a52, 0, -0.149, 0.111, 0.075, 0.024);
    this.teeth.renderOrder = 5;
    this.tongue.renderOrder = 5;
    this.collectSprings();
  }

  speak(line: FacialLine | null): void {
    this.speaking = !!line;
    this.mouthCues = line?.mouthCues ?? [];
    this.expression = line?.expression ?? 'neutral';
    this.speechStarted = performance.now() / 1000;
  }

  update(dt: number, lookTarget: Object3D | Vector3 | null): void {
    this.clock += dt;
    this.updateDarts(dt);
    this.updateGaze(lookTarget, dt);
    const blink = this.blink.update(dt).openness;
    const blinkClosed = 1 - blink;
    this.lidL.scale.y = 1 + blinkClosed * 4.2;
    this.lidR.scale.y = this.lidL.scale.y;
    this.lidL.position.y = 0.054 + this.gazeY * 0.25 - blinkClosed * 0.036;
    this.lidR.position.y = this.lidL.position.y;
    this.lidL.position.x = -0.122 + this.gazeX * 0.35;
    this.lidR.position.x = 0.122 + this.gazeX * 0.35;

    const time = this.speaking ? performance.now() / 1000 - this.speechStarted : -1;
    const shape = mouthShapeAt(this.mouthCues, time);
    this.root.userData.mouthShape = shape;
    this.root.userData.mouthTime = time;
    const [wide, open] = SHAPE_OPEN[shape];
    const smile = this.expression === 'happy' ? 1 : 0;
    const surprised = this.expression === 'surprised' ? 1 : 0;
    const mouthClosed = shape === 'X' || shape === 'B';
    const rounded = shape === 'F' || shape === 'G' || shape === 'H';
    const targetW = (rounded ? wide * 0.5 : wide) * (1 + smile * 0.2);
    const targetH = mouthClosed ? 0.006 : Math.max(0.055, open * 0.56 + surprised * 0.04);
    this.mouth.scale.x += (targetW - this.mouth.scale.x) * 0.5;
    this.mouth.scale.y += (targetH - this.mouth.scale.y) * 0.5;
    this.mouth.rotation.z = mouthClosed ? -smile * 0.03 : 0;
    const detailOn = !mouthClosed && targetH > 0.035;
    this.teeth.visible = detailOn && !rounded;
    this.tongue.visible = detailOn && !rounded;
    this.teeth.scale.x = Math.max(0.55, targetW * 8.5);
    this.tongue.scale.x = Math.max(0.45, targetW * 7);

    const concerned = this.expression === 'concerned' ? 1 : 0;
    this.browL.rotation.z = -0.12 - concerned * 0.18 + smile * 0.08;
    this.browR.rotation.z = 0.12 + concerned * 0.18 - smile * 0.08;
    this.browL.position.y = 0.084 - concerned * 0.01 + surprised * 0.018;
    this.browR.position.y = this.browL.position.y;

    this.updateSprings(dt);
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        if (o.material instanceof MeshBasicMaterial) o.material.dispose();
      }
    });
  }

  private updateDarts(dt: number): void {
    this.dartAt -= dt;
    if (this.dartAt > 0) return;
    this.dartAt = 0.45 + Math.random() * 1.6;
    this.dartX = (Math.random() - 0.5) * 0.03;
    this.dartY = (Math.random() - 0.5) * 0.018;
  }

  private updateGaze(lookTarget: Object3D | Vector3 | null, dt: number): void {
    let tx = this.dartX;
    let ty = this.dartY;
    if (lookTarget) {
      if (lookTarget instanceof Object3D) lookTarget.getWorldPosition(this.headLocalTarget);
      else this.headLocalTarget.copy(lookTarget);
      this.head.worldToLocal(this.headLocalTarget);
      tx += MathUtils.clamp(this.headLocalTarget.x * 0.12, -0.028, 0.028);
      ty += MathUtils.clamp((this.headLocalTarget.y - 0.06) * 0.08, -0.018, 0.018);
    }
    const k = 1 - Math.exp(-dt * 24);
    this.gazeX += (tx - this.gazeX) * k;
    this.gazeY += (ty - this.gazeY) * k;
    this.irisL.position.x = -0.122 + this.gazeX;
    this.irisR.position.x = 0.122 + this.gazeX;
    this.irisL.position.y = -0.004 + this.gazeY;
    this.irisR.position.y = -0.004 + this.gazeY;
    this.catchL.position.x = this.irisL.position.x - 0.01;
    this.catchR.position.x = this.irisR.position.x - 0.01;
    this.catchL.position.y = this.irisL.position.y + 0.015;
    this.catchR.position.y = this.irisR.position.y + 0.015;
  }

  private updateSprings(dt: number): void {
    if (!this.springs.length) return;
    const driveX = Math.sin(this.clock * 1.6) * 0.004;
    const driveZ = Math.sin(this.clock * 1.1 + 0.7) * 0.006;
    for (const spring of this.springs) {
      spring.object.rotation.x = MathUtils.clamp(spring.x.update(driveX, dt), -0.01, 0.01);
      spring.object.rotation.z = MathUtils.clamp(spring.z.update(driveZ, dt), -0.012, 0.012);
    }
  }

  private collectSprings(): void {
    if (this.body !== 'nell') return;
    for (const name of ['bicorne cockade']) {
      const object = this.head.getObjectByName(name);
      if (object)
        this.springs.push({ object, x: new StableSpring(3.8, 0.7), z: new StableSpring(4.5, 0.72) });
    }
  }

  private addCircle(
    name: string,
    color: number,
    x: number,
    y: number,
    z: number,
    r: number,
    sx: number,
  ): Mesh {
    const mesh = new Mesh(new CircleGeometry(r, 24), faceMaterial(color));
    mesh.name = name;
    mesh.renderOrder = 4;
    mesh.position.set(x, y, z);
    mesh.scale.x = sx;
    this.root.add(mesh);
    return mesh;
  }

  private addPlane(name: string, color: number, x: number, y: number, z: number, w: number, h: number): Mesh {
    const mesh = new Mesh(new PlaneGeometry(w, h), faceMaterial(color));
    mesh.name = name;
    mesh.renderOrder = 4;
    mesh.position.set(x, y, z);
    this.root.add(mesh);
    return mesh;
  }
}

function faceMaterial(color: number): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, depthTest: false, depthWrite: false });
}
