import { Group, Mesh, Object3D, type Material } from 'three/webgpu';
import { sharedInstancedMesh } from '../../engine/instancing';
import type { WaveSampler } from '../contracts';
import type { VillageKit } from '../village/kit';
import { box, cylinder, merge } from './geo';
import { InstanceProxies } from './proxies';
import { SignSet } from './sign';
import { HELM_ORDER, MERIDIAN_HELMS, type HelmMode } from './helms-logic';

/** Metres from the route point to its marker float. */
const MARK_OFFSET = 9;

const LABEL: Readonly<Record<HelmMode, string>> = {
  interactive: 'INTERACTIVE',
  plan: 'PLAN',
  autopilot: 'AUTOPILOT',
};

export interface HelmBuoysSite {
  readonly group: Group;
  /** Shows a run's route markers (Plan charts its whole route; Interactive shows the next mark). */
  showRoute(mode: HelmMode | null, upTo?: number, from?: number): void;
  /** Dims a helm's flag once it's been sailed. */
  setSailed(mode: HelmMode, sailed: boolean): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

/**
 * The Three Helms' buoys in the bay (P1.2): a big float for each mode with its colour flag and a
 * name board you can read from the helm, and small marker floats along each route. They ride the
 * waves. The three float bodies draw as one instanced mesh and the name boards as one sign atlas.
 */
export function createHelmBuoys(o: { kit: VillageKit; waves: WaveSampler }): HelmBuoysSite {
  const group = new Group();
  group.name = 'three helms (P1.2)';
  const mats: Record<'wood' | 'cloth' | 'metal', Material> = {
    wood: o.kit.materials.wood,
    cloth: o.kit.materials.cloth,
    metal: o.kit.materials.metal,
  };
  const floats: { g: Group; x: number; z: number; phase: number }[] = [];
  const signs = new SignSet('helm name boards');
  const body = merge([
    cylinder(1.25, 1.5, 1.4, { y: -0.6 }, 0xb8321f, 16),
    cylinder(1.3, 1.3, 0.3, { y: 0.55 }, 0xf1e5c8, 16),
    cylinder(0.12, 0.12, 4.6, { y: 0.8 }, 0x3b2b1c, 8),
  ]);
  const bodySpots: Object3D[] = [];
  const flags = new Map<HelmMode, Mesh>();
  const routes = new Map<HelmMode, Group[]>();
  const disposables: { dispose(): void }[] = [];

  for (const mode of HELM_ORDER) {
    const run = MERIDIAN_HELMS[mode];
    const g = new Group();
    g.name = `helm buoy: ${mode}`;
    const bodySpot = new Object3D();
    bodySpots.push(bodySpot);
    const flagGeo = merge([box(1.9, 1.1, 0.06, { x: 1.0, y: 4.1 }, run.colour, 3.25, true)]);
    const flag = new Mesh(flagGeo, mats.cloth);
    flag.castShadow = true;
    flags.set(mode, flag);
    const sign = signs.add([LABEL[mode]], 3.2, 0.9, { twoSided: true, size: 0.2 });
    sign.object.position.set(0, 2.6, 0);
    g.add(bodySpot, flag, sign.object);
    g.position.set(run.buoy.x, 0, run.buoy.z);
    group.add(g);
    floats.push({ g, x: run.buoy.x, z: run.buoy.z, phase: floats.length * 1.7 });
    disposables.push(flagGeo);

    const markerGeo = merge([
      cylinder(0.05, 0.55, 1.3, { y: -0.3 }, run.colour, 10),
      cylinder(0.56, 0.56, 0.14, { y: -0.36 }, 0xf1e5c8, 10),
    ]);
    disposables.push(markerGeo);
    // Each mark floats off to port of where she heaves to, so the hull never sits on it.
    const markers = run.route.map((p, i) => {
      const prev = i === 0 ? run.buoy : run.route[i - 1]!;
      const dx = p.x - prev.x,
        dz = p.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      const x = p.x + (dz / len) * MARK_OFFSET,
        z = p.z - (dx / len) * MARK_OFFSET;
      const m = new Group();
      const mesh = new Mesh(markerGeo, mats.cloth);
      mesh.castShadow = true;
      m.add(mesh);
      m.position.set(x, 0, z);
      m.visible = false;
      group.add(m);
      floats.push({ g: m, x, z, phase: i * 0.9 + 3 });
      return m;
    });
    routes.set(mode, markers);
  }

  const bodyMesh = sharedInstancedMesh(body, mats.wood, bodySpots.length);
  bodyMesh.name = 'helm buoy floats';
  bodyMesh.castShadow = true;
  group.add(bodyMesh, signs.finalize());
  const bodies = new InstanceProxies(bodyMesh, bodySpots);
  bodies.update();
  disposables.push(body, signs);

  let t0 = 0;
  return {
    group,
    showRoute(mode, upTo = Infinity, from = 0) {
      for (const [m, markers] of routes)
        markers.forEach((g, i) => (g.visible = m === mode && i >= from && i < upTo));
    },
    setSailed(mode, sailed) {
      const flag = flags.get(mode);
      if (flag) flag.visible = !sailed;
    },
    update(_dt, t) {
      t0 = t;
      for (const f of floats) {
        if (!f.g.visible) continue;
        f.g.position.y = o.waves.heightAt(f.x, f.z, t0);
        f.g.rotation.z = Math.sin(t0 * 0.9 + f.phase) * 0.05;
        f.g.rotation.x = Math.cos(t0 * 0.7 + f.phase) * 0.04;
      }
      bodies.update();
      signs.update();
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.clear();
    },
  };
}
