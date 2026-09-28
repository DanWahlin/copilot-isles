import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import {
  HOVER,
  ParrotFlight,
  bodyFrame,
  buildWing,
  hoverPoint,
  wingPose,
  type FlightView,
} from './parrot-flight';

const ERNEST = { covert: [16, 7], band: [19, 7], flight: [19, 7], tip: [21, 7] } as const;

/** A box-ish bird: tail at -z, beak at +z, yawed by `yaw`, 0.4 wide at the shoulders. */
function birdGeometry(yaw = 0): BufferGeometry {
  const pts: [number, number, number][] = [
    [0, 0.2, -0.4],
    [0, 0.25, 0.4],
    [0, 0, 0],
    [0, 0.5, 0],
  ];
  for (let x = -0.2; x <= 0.2001; x += 0.05) for (const y of [0.15, 0.2, 0.25]) pts.push([x, y, 0.02]);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const position = pts.flatMap(([x, y, z]) => [x * c + z * s, y, -x * s + z * c]);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.name = 'ernest';
  return g;
}

function flightRig() {
  const scene = new Group();
  const hero = new Group();
  const perched = new Mesh(birdGeometry(), new MeshStandardMaterial());
  perched.name = 'hero parrot';
  perched.position.set(0.25, 1.5, 0);
  perched.scale.setScalar(0.5);
  hero.add(perched);
  scene.add(hero);
  const flight = ParrotFlight.attach(hero, scene)!;
  const view: FlightView = { captain: new Vector3(), height: 1.78, eye: new Vector3(0, 2.4, -4) };
  return { scene, hero, perched, flight, view };
}

describe('Wingman flight', () => {
  it('folds the wings when closed and spreads them to full size when open', () => {
    for (let phase = 0; phase < Math.PI * 2; phase += 0.3) {
      const folded = wingPose(phase, 0, 1);
      expect(folded.scale).toBeCloseTo(0.34);
      expect(folded.sweep).toBeCloseTo(1.38);
      expect(folded.twist).toBeCloseTo(0);
      const open = wingPose(phase, 1, 1);
      expect(open.scale).toBe(1);
      expect(Math.abs(open.flap)).toBeLessThan(1.2);
      expect(Math.abs(open.sweep)).toBeLessThan(0.4);
    }
  });

  it('hovers above and ahead of the captain, on the side asked for', () => {
    const view: FlightView = { captain: new Vector3(5, 1, 5), height: 1.7, eye: new Vector3(5, 3, 1) };
    const right = hoverPoint(view, 1);
    const left = hoverPoint(view, -1);
    expect(right.y).toBeCloseTo(1 + 1.7 + HOVER.up);
    // The camera looks along +z, so ahead is +z and screen-right is -x.
    expect(right.z).toBeCloseTo(5 + HOVER.ahead);
    expect(right.x).toBeCloseTo(5 - HOVER.aside);
    expect(left.x).toBeCloseTo(5 + HOVER.aside);
    // An explicit facing wins over the camera.
    const facing = hoverPoint({ ...view, ahead: { x: 1, z: 0 } }, 1);
    expect(facing.x).toBeCloseTo(5 + HOVER.ahead);
    expect(facing.z).toBeCloseTo(5 + HOVER.aside);
  });

  it("finds the body's axis and shoulder hinge", () => {
    for (const yaw of [0, 0.3, -0.5]) {
      const frame = bodyFrame(birdGeometry(yaw));
      expect(frame.yaw).toBeCloseTo(Math.atan2(0, 0.8) + yaw, 1);
      expect(frame.halfWidth).toBeCloseTo(0.2 * 0.82, 2);
      expect(Math.abs(frame.hinge.x)).toBeLessThan(0.02);
    }
  });

  it('builds mirrored wings whose top faces point up', () => {
    for (const side of [1, -1] as const) {
      const wing = buildWing(ERNEST, side);
      const pos = wing.getAttribute('position');
      let outward = 0;
      let upward = 0;
      const a = new Vector3();
      const b = new Vector3();
      const c = new Vector3();
      for (let i = 0; i < pos.count; i += 3) {
        a.fromBufferAttribute(pos, i);
        b.fromBufferAttribute(pos, i + 1);
        c.fromBufferAttribute(pos, i + 2);
        outward += (a.x + b.x + c.x) * side;
        const n = b.clone().sub(a).cross(c.clone().sub(a));
        // Top triangles share the raised hub; they should face up, the bottom ones down.
        const top = Math.max(a.y, b.y, c.y) > 0.02;
        upward += top === n.y > 0 ? 1 : 0;
      }
      expect(outward).toBeGreaterThan(0);
      expect(upward).toBe(pos.count / 3);
      wing.dispose();
    }
  });

  it('lifts off the shoulder, hovers, and lands back where it started', () => {
    const { perched, flight, view } = flightRig();
    const start = new Vector3();
    perched.getWorldPosition(start);
    expect(flight.phase).toBe('perched');
    expect(flight.root.visible).toBe(false);

    flight.takeOff(view);
    expect(flight.phase).toBe('takeoff');
    expect(perched.visible).toBe(false);
    expect(flight.root.visible).toBe(true);

    for (let i = 0; i < 90; i++) flight.update(1 / 60, view);
    expect(flight.phase).toBe('hover');
    const hover = flight.hoverAt(view);
    expect(flight.root.position.distanceTo(hover)).toBeLessThan(0.2);
    expect(flight.root.position.y).toBeGreaterThan(start.y + 0.3);

    flight.land();
    expect(flight.phase).toBe('landing');
    for (let i = 0; i < 90; i++) flight.update(1 / 60, view);
    expect(flight.phase).toBe('perched');
    expect(perched.visible).toBe(true);
    expect(flight.root.visible).toBe(false);
  });

  it('snaps back to the shoulder and leaves the scene on dispose', () => {
    const { scene, perched, flight, view } = flightRig();
    flight.takeOff(view);
    flight.update(1 / 60, view);
    flight.landNow();
    expect(flight.phase).toBe('perched');
    expect(perched.visible).toBe(true);
    flight.dispose();
    expect(scene.getObjectByName('wingman flight')).toBeUndefined();
  });

  it('skips characters without a shoulder parrot', () => {
    expect(ParrotFlight.attach(new Group(), new Group())).toBeNull();
  });
});
