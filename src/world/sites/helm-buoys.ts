import { Group, Mesh, Object3D, type Material } from 'three/webgpu';
import { sharedInstancedMesh } from '../../engine/instancing';
import type { WaveSampler } from '../contracts';
import { unreflected } from '../reflection';
import type { VillageKit } from '../village/kit';
import { box, cylinder, merge } from './geo';
import { InstanceProxies } from './proxies';
import { SignSet } from './sign';
import { HELM_ORDER, HELM_ORDERS, MERIDIAN_HELMS, SHOAL, sampleCourse, type HelmMode } from './helms-logic';

/** Metres from the route point to its marker float. */
const MARK_OFFSET = 9;
/** The charted route's dashes on the water (`review`): length, width, and spacing, in metres. */
const DASH = { length: 2.8, width: 0.9, every: 5 } as const;

/** A route on the water: a helm's, or the `review` helm's first chart (the one across the Shoal). */
export type HelmRoute = HelmMode | 'draft';

export interface HelmBuoysSite {
  readonly group: Group;
  /**
   * Shows a route's marker floats (the `review` helm's chart also as a dashed line on the water;
   * `steer` shows the next mark).
   */
  showRoute(route: HelmRoute | null, upTo?: number, from?: number): void;
  /** Dims a helm's flag once it's been sailed. */
  setSailed(mode: HelmMode, sailed: boolean): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

/**
 * The Three Helms' buoys in the bay (P1.2): a big float for each of Rhea's orders with its colour
 * flag and a board you can read from the helm (the order's number and name, not its mode), small
 * marker floats along each route, the `review` helm's chart as a dashed line, and the Shoal: a hazard
 * float on rocks that Rhea's first chart cuts across. They ride the waves. The float bodies draw as
 * one instanced mesh and the boards as one sign atlas.
 */
export function createHelmBuoys(o: { kit: VillageKit; waves: WaveSampler }): HelmBuoysSite {
  const group = new Group();
  group.name = 'three helms (P1.2)';
  // A Meridian site, so never in the Anchorage harbour mirror: leaving it out spares the mirror's
  // copies of its shaders (PLAN §15.4).
  unreflected.add(group);
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
  const routes = new Map<HelmRoute, Group[]>();
  const lines = new Map<HelmRoute, Mesh>();
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
    const n = HELM_ORDER.indexOf(mode) + 1;
    const sign = signs.add([`ORDER ${n}`, HELM_ORDERS[mode].name.toUpperCase()], 3.6, 1.2, {
      twoSided: true,
      size: 0.13,
    });
    sign.object.position.set(0, 2.75, 0);
    g.add(bodySpot, flag, sign.object);
    g.position.set(run.buoy.x, 0, run.buoy.z);
    group.add(g);
    floats.push({ g, x: run.buoy.x, z: run.buoy.z, phase: floats.length * 1.7 });
    disposables.push(flagGeo);

    routes.set(mode, routeMarkers(run.buoy, run.route, run.colour));
    if (mode === 'review') {
      routes.set('draft', routeMarkers(run.buoy, run.draft!.route, run.colour));
      lines.set('review', routeLine(run.buoy, run.route, run.colour));
      lines.set('draft', routeLine(run.buoy, run.draft!.route, run.colour));
    }
  }

  // The Shoal: a red float with its board, on a ring of rocks just breaking the surface.
  const shoal = new Group();
  shoal.name = 'the Shoal';
  const shoalSpot = new Object3D();
  bodySpots.push(shoalSpot);
  const shoalSign = signs.add(['SHOAL'], 2.6, 0.8, { twoSided: true, size: 0.2, fill: '#8b1f1f' });
  shoalSign.object.position.set(0, 2.5, 0);
  shoal.add(shoalSpot, shoalSign.object);
  shoal.position.set(SHOAL.x, 0, SHOAL.z);
  group.add(shoal);
  floats.push({ g: shoal, x: SHOAL.x, z: SHOAL.z, phase: 5.1 });
  const rockGeo = merge(
    [0, 1, 2, 3, 4, 5].map((i) => {
      const a = i * 1.05 + 0.4,
        r = 3.2 + (i % 3) * 1.1;
      return cylinder(
        0.5 + (i % 2) * 0.3,
        0.9 + (i % 2) * 0.3,
        1.4,
        {
          x: SHOAL.x + Math.cos(a) * r,
          y: -1.05,
          z: SHOAL.z + Math.sin(a) * r,
        },
        0x4a4640,
        7,
      );
    }),
  );
  disposables.push(rockGeo);
  const rocks = new Mesh(rockGeo, mats.wood);
  rocks.name = 'the Shoal: rocks';
  group.add(rocks);

  /** Marker floats along a route: each floats off to port of where she heaves to, so the hull never sits on it. */
  function routeMarkers(
    buoy: { x: number; z: number },
    route: readonly { x: number; z: number }[],
    colour: number,
  ): Group[] {
    const markerGeo = merge([
      cylinder(0.05, 0.55, 1.3, { y: -0.3 }, colour, 10),
      cylinder(0.56, 0.56, 0.14, { y: -0.36 }, 0xf1e5c8, 10),
    ]);
    disposables.push(markerGeo);
    return route.map((p, i) => {
      const prev = i === 0 ? buoy : route[i - 1]!;
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
      // Shown only on a run: the island's warm shows it once so its first sighting builds nothing.
      m.userData.prewarm = true;
      group.add(m);
      floats.push({ g: m, x, z, phase: i * 0.9 + 3 });
      return m;
    });
  }

  /**
   * A charted route as dashes on the water, thick enough to read from the review's high shot. The
   * dashes stand a little proud of the surface (a static mesh, so the swell doesn't drown them).
   */
  function routeLine(
    buoy: { x: number; z: number },
    route: readonly { x: number; z: number }[],
    colour: number,
  ): Mesh {
    const path = sampleCourse([buoy, ...route], 1);
    const parts = [];
    let along = 0;
    let next = 10;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!,
        b = path[i]!;
      along += Math.hypot(b.x - a.x, b.z - a.z);
      if (along < next) continue;
      next += DASH.every;
      parts.push(
        box(
          DASH.width,
          0.9,
          DASH.length,
          { x: b.x, y: -0.4, z: b.z, ry: Math.atan2(b.x - a.x, b.z - a.z) },
          colour,
        ),
      );
    }
    const geo = merge(parts);
    disposables.push(geo);
    const line = new Mesh(geo, mats.cloth);
    line.name = 'helm route line';
    line.visible = false;
    line.userData.prewarm = true;
    group.add(line);
    return line;
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
    showRoute(route, upTo = Infinity, from = 0) {
      for (const [m, markers] of routes)
        markers.forEach((g, i) => (g.visible = m === route && i >= from && i < upTo));
      for (const [m, line] of lines) line.visible = m === route;
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
      unreflected.delete(group);
      for (const d of disposables) d.dispose();
      group.clear();
    },
  };
}
