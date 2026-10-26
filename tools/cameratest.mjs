#!/usr/bin/env node
// Camera clearance check: the follow camera must never put its near plane inside terrain, under the
// water, or inside drawn geometry (buildings, rocks, cliffs, docks, trees, props). On Anchorage Cay
// and Port Meridian it picks spots spread over the walkable ground plus spots right beside every box
// and round collider, drives a fresh FollowCamera there with the game's own collision world, turns
// the yaw a full circle at each pitch of the mouse-look range and at the default and widest zoom, and
// tests every frame's near-plane rectangle (its centre and four corners):
//   terrain  below the terrain height
//   water    below the sea or a lake's surface
//   inside   the near plane's centre is inside closed drawn geometry (rays from it go out through a
//            back face in at least five of the six axis directions)
//   touch    the near-plane rectangle (or the frustum between the eye and it) crosses drawn geometry
// Leaves (alpha-tested) and the moored ship's rig only count as info, and so do frames where something
// hides the pivot and the mean reach (camera distance over the zoom asked for, to see how far
// collision pulls it in).
// Characters, birds, glow, water, and sky are skipped; terrain is tested through its height field.
// Spots where the pivot is inside geometry, or where geometry comes within 0.45 m of it (the head
// is already in it: a collider that's smaller than what's drawn), are skipped and counted.
// Sail spots sweep the ship's rig over the water round each coast. Before each cluster, it waits
// until the game draws the cluster's island, not its silhouette (issue 302). An island swaps by the
// game camera's distance, and after a teleport that camera needs a few seconds to get there.
// Exits 1 on a page error, on an island that doesn't draw in 20 s (notShown), or on more bad
// frames than --max-bad (default 20: the count stands at 8-17 across seeds, so this catches a
// real regression without failing on sample spread; lower it as colliders tighten).
// Needs a dev server. A no-HMR one keeps edits elsewhere from reloading the page mid-run:
//   npx vite --config tools/vite.nohmr.config.mjs --port 5322
// node tools/cameratest.mjs [--base=http://127.0.0.1:5322] [--samples=160] [--sail=30] (sail spots)
//   [--seed=7] [--max-bad=20] [--list=25] (hits to print) [--explain] (with the collider nearest each)
//   [--camera=/<path>.ts] (another FollowCamera module under the repo, served by Vite, to compare)
//   [--near=x,z,r] (only the clusters near a point) [--probe] (what the six axis rays from each
//   listed hit meet first) [--out=<dir>] (screenshots of the first 8 hits from the camera pose, and
//   from 4 m further out) [--match=<regex>] (which hits get screenshots) [--warn] (print warnings)
import { mkdirSync } from 'node:fs';
import { collectLogs, launchChrome, parseFlags } from './lib/browser.mjs';
import { ISLANDS, STREAMED } from './lib/islands.mjs';

const opt = parseFlags();
const base = opt.base || 'http://127.0.0.1:5322';
const out = opt.out || '';
const cfg = {
  camera: opt.camera || '/src/game/follow-camera.ts',
  samples: Number(opt.samples ?? 160),
  sail: Number(opt.sail ?? 30),
  seed: Number(opt.seed ?? 7),
  // Each island's terrain (tools/lib/islands.json): its box is where the spots go.
  islands: ISLANDS.map((i) => ({ id: i.id, terrain: i.terrain })),
  // Walk surfaces above the ground, by island (its `decks`): spots on them too.
  decks: Object.fromEntries(ISLANDS.filter((i) => i.decks).map((i) => [i.id, i.decks])),
};
const list = Number(opt.list ?? 25);
// --near=x,z,r runs only the clusters within r m of (x, z); --match=<regex> picks which hits get screenshots.
const near = opt.near ? opt.near.split(',').map(Number) : null;
const match = opt.match ? new RegExp(opt.match) : null;

const browser = await launchChrome({ autoplay: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = collectLogs(page, { types: opt.warn ? ['error', 'warning'] : ['error'] });
await page.goto(`${base}/devpages/play.html?auto&quiet`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__dev?.ready === true && window.__dev.session(), null, {
  timeout: 120000,
});
await page.waitForTimeout(2000);
// The other islands (their towns and colliders) only load when needed: go to each in turn (its
// colliders join the world, and the ones you left stay: the session keeps them while it's open).
for (const id of STREAMED) {
  const quay = await page.evaluate((id) => window.__dev.session().islandQuay(id), id);
  if (!quay) continue;
  await page.evaluate((q) => window.__dev.session().travel(q.x, q.z, q.heading), quay);
  await page.waitForFunction(
    (id) =>
      window.__dev
        .session()
        .islandSetups()
        .some((s) => s.id === id),
    id,
    { timeout: 120000 },
  );
  await page.waitForTimeout(3000);
  // The first landfall flies in (it owns the camera, which the screenshots need); E skips it.
  for (
    let i = 0;
    i < 10 && (await page.evaluate(() => window.__dev.session().debug.arrival()?.phase)) === 'flying';
    i++
  ) {
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(600);
  }
}

const t0 = Date.now();
const clusters = await page.evaluate(async (cfg) => {
  const threeUrl = performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .find((n) => /deps\/three_webgpu\.js/.test(n));
  const { Box3, Vector3 } = await import(threeUrl);
  const { FollowCamera, WALK_RIG, SAIL_RIG } = await import(cfg.camera);
  const dev = window.__dev;
  const s = dev.session();
  const world = s.world;
  const T = s.player.tune;
  const scene = dev.scene;

  let seed = cfg.seed >>> 0 || 1;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // ---- Geometry: world-space triangles in a 2 m xz grid, rebuilt round each cluster of spots.
  const SKIP =
    /character_|(^|\/)birds|gull|ocean|foam|distant-|terrain-chunk|fresh water|site water|glow|sparkle|wingman|vegetation-grass|impostor/i;
  const pathOf = (o) => {
    const p = [];
    for (let x = o; x && x !== scene; x = x.parent) p.unshift(x.name || x.type);
    return p.join('/');
  };
  const shown = (o) => {
    for (let x = o; x; x = x.parent) if (!x.visible) return false;
    return true;
  };
  const CELL = 2;
  const G = {
    tri: new Float32Array(9 * 65536),
    owner: new Int32Array(65536),
    stamp: new Uint32Array(65536),
    n: 0,
    cells: new Map(),
    owners: [],
    ray: 0,
  };
  const grow = () => {
    const cap = G.owner.length * 2;
    const tri = new Float32Array(9 * cap);
    tri.set(G.tri);
    const owner = new Int32Array(cap);
    owner.set(G.owner);
    G.tri = tri;
    G.owner = owner;
    G.stamp = new Uint32Array(cap);
  };
  const key = (ix, iz) => (ix + 32768) * 65536 + (iz + 32768);
  const addMesh = (geometry, e, ownerId, cx, cz, R) => {
    const pos = geometry.attributes.position;
    const idx = geometry.index;
    // Only what's drawn: a mesh with levels of detail keeps its coarser lists after the full one.
    const start = geometry.drawRange.start;
    const count = Math.min(idx ? idx.count : pos.count, start + geometry.drawRange.count);
    const flip =
      e[0] * (e[5] * e[10] - e[6] * e[9]) -
        e[1] * (e[4] * e[10] - e[6] * e[8]) +
        e[2] * (e[4] * e[9] - e[5] * e[8]) <
      0;
    const v = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = start; i + 2 < count; i += 3) {
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx.getX(i + (flip && k ? 3 - k : k)) : i + (flip && k ? 3 - k : k);
        const x = pos.getX(vi),
          y = pos.getY(vi),
          z = pos.getZ(vi);
        v[k * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        v[k * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        v[k * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      }
      const x0 = Math.min(v[0], v[3], v[6]),
        x1 = Math.max(v[0], v[3], v[6]);
      const z0 = Math.min(v[2], v[5], v[8]),
        z1 = Math.max(v[2], v[5], v[8]);
      if (x1 < cx - R || x0 > cx + R || z1 < cz - R || z0 > cz + R) continue;
      if (G.n >= G.owner.length) grow();
      G.tri.set(v, G.n * 9);
      G.owner[G.n] = ownerId;
      for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++)
        for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
          const k = key(ix, iz);
          let c = G.cells.get(k);
          if (!c) G.cells.set(k, (c = []));
          c.push(G.n);
        }
      G.n++;
    }
  };
  const m4 = new Array(16);
  const build = (cx, cz, R, withShip) => {
    G.n = 0;
    G.cells.clear();
    G.owners.length = 0;
    scene.updateMatrixWorld(true);
    const sphere = { x: 0, y: 0, z: 0, r: 0 };
    const near = (geometry, e) => {
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      const b = geometry.boundingSphere;
      sphere.x = e[0] * b.center.x + e[4] * b.center.y + e[8] * b.center.z + e[12];
      sphere.z = e[2] * b.center.x + e[6] * b.center.y + e[10] * b.center.z + e[14];
      const sc = Math.max(
        Math.hypot(e[0], e[1], e[2]),
        Math.hypot(e[4], e[5], e[6]),
        Math.hypot(e[8], e[9], e[10]),
      );
      sphere.r = b.radius * sc;
      return Math.hypot(sphere.x - cx, sphere.z - cz) < R + sphere.r;
    };
    scene.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh || o.isBatchedMesh || !shown(o)) return;
      for (let x = o.parent; x; x = x.parent) if (x.isBone) return;
      const path = pathOf(o);
      if (SKIP.test(path)) return;
      if (!withShip && /brigantine/i.test(path)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.every((m) => !m || m.transparent || m.visible === false)) return;
      const g = o.geometry;
      if (!g?.attributes?.position) return;
      // The ship's rig (masts, yards, sails, rigging) counts like leaves: the camera passes through it
      // as it does under sail (sail clusters leave the ship out); her hull counts.
      const owner = { path, foliage: mats.some((m) => m && m.alphaTest > 0) || /brigantine rig/.test(path) };
      if (o.isInstancedMesh) {
        for (let i = 0; i < o.count; i++) {
          const a = o.instanceMatrix.array;
          for (let k = 0; k < 16; k++) m4[k] = a[i * 16 + k];
          // world = matrixWorld * instance
          const w = o.matrixWorld.elements;
          const e = new Array(16);
          for (let c = 0; c < 4; c++)
            for (let r = 0; r < 4; r++)
              e[c * 4 + r] =
                w[r] * m4[c * 4] +
                w[4 + r] * m4[c * 4 + 1] +
                w[8 + r] * m4[c * 4 + 2] +
                w[12 + r] * m4[c * 4 + 3];
          if (!near(g, e)) continue;
          G.owners.push(owner);
          addMesh(g, e, G.owners.length - 1, cx, cz, R);
        }
      } else {
        const e = o.matrixWorld.elements;
        if (!near(g, e)) return;
        G.owners.push(owner);
        addMesh(g, e, G.owners.length - 1, cx, cz, R);
      }
    });
    return G.n;
  };

  // Hits along a ray, nearest first: t, whether it went in through a front face, and the owner.
  const H = {
    t: new Float64Array(4096),
    enter: new Uint8Array(4096),
    owner: new Int32Array(4096),
    tri: new Int32Array(4096),
    n: 0,
  };
  const order = [];
  const cast = (ax, ay, az, bx, by, bz, extra) => {
    let dx = bx - ax,
      dy = by - ay,
      dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    H.n = 0;
    if (len < 1e-9) return 0;
    dx /= len;
    dy /= len;
    dz /= len;
    const far = len + extra;
    if (++G.ray > 0xfffffff0) {
      G.stamp.fill(0);
      G.ray = 1;
    }
    let ix = Math.floor(ax / CELL),
      iz = Math.floor(az / CELL);
    const sx = dx > 0 ? 1 : -1,
      sz = dz > 0 ? 1 : -1;
    let tx = Math.abs(dx) > 1e-12 ? ((ix + (dx > 0 ? 1 : 0)) * CELL - ax) / dx : Infinity;
    let tz = Math.abs(dz) > 1e-12 ? ((iz + (dz > 0 ? 1 : 0)) * CELL - az) / dz : Infinity;
    const ddx = Math.abs(dx) > 1e-12 ? CELL / Math.abs(dx) : Infinity;
    const ddz = Math.abs(dz) > 1e-12 ? CELL / Math.abs(dz) : Infinity;
    const P = G.tri;
    for (;;) {
      const c = G.cells.get(key(ix, iz));
      if (c)
        for (const ti of c) {
          if (G.stamp[ti] === G.ray) continue;
          G.stamp[ti] = G.ray;
          const o = ti * 9;
          const e1x = P[o + 3] - P[o],
            e1y = P[o + 4] - P[o + 1],
            e1z = P[o + 5] - P[o + 2];
          const e2x = P[o + 6] - P[o],
            e2y = P[o + 7] - P[o + 1],
            e2z = P[o + 8] - P[o + 2];
          const px = dy * e2z - dz * e2y,
            py = dz * e2x - dx * e2z,
            pz = dx * e2y - dy * e2x;
          const det = e1x * px + e1y * py + e1z * pz;
          if (Math.abs(det) < 1e-12) continue;
          const inv = 1 / det;
          const qx0 = ax - P[o],
            qy0 = ay - P[o + 1],
            qz0 = az - P[o + 2];
          const u = (qx0 * px + qy0 * py + qz0 * pz) * inv;
          if (u < 0 || u > 1) continue;
          const qx = qy0 * e1z - qz0 * e1y,
            qy = qz0 * e1x - qx0 * e1z,
            qz = qx0 * e1y - qy0 * e1x;
          const v = (dx * qx + dy * qy + dz * qz) * inv;
          if (v < 0 || u + v > 1) continue;
          const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (t < 0 || t > far || H.n >= H.t.length) continue;
          H.t[H.n] = t;
          H.enter[H.n] = det > 0 ? 1 : 0;
          H.owner[H.n] = G.owner[ti];
          H.tri[H.n] = ti;
          H.n++;
        }
      const next = Math.min(tx, tz);
      if (next > far) break;
      if (tx < tz) {
        ix += sx;
        tx += ddx;
      } else {
        iz += sz;
        tz += ddz;
      }
    }
    order.length = H.n;
    for (let i = 0; i < H.n; i++) order[i] = i;
    order.sort((a, b) => H.t[a] - H.t[b]);
    return len;
  };
  /** The first non-leaf hit of the last cast: its index, or -1. */
  const firstSolid = () => {
    for (const i of order) if (!G.owners[H.owner[i]].foliage) return i;
    return -1;
  };
  // A point is inside closed geometry when the first surface a ray meets is a back face (the ray
  // goes out through it) in at least five of the six axis directions. One open sheet (a roof seen
  // from under it, a sail) can't do that; a wall, a rock, a cliff, or a hull can.
  const DIRS = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];
  const insideAt = (p) => {
    let out = 0,
      owner = -1,
      depth = Infinity;
    for (let d = 0; d < 18; d += 3) {
      cast(p.x, p.y, p.z, p.x + DIRS[d], p.y + DIRS[d + 1], p.z + DIRS[d + 2], 24);
      const i = firstSolid();
      if (i < 0 || H.enter[i]) {
        if (++out > 1) return null;
        continue;
      }
      if (H.t[i] < depth) {
        depth = H.t[i];
        owner = H.owner[i];
      }
    }
    return { owner, depth };
  };

  const TIGHT = 0.45;
  const AROUND = [];
  for (const [a, b, c] of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 0],
    [1, -1, 0],
    [0, 1, 1],
    [0, 1, -1],
    [1, 0, 1],
    [1, 0, -1],
  ])
    for (const k of [1, -1]) {
      const l = Math.hypot(a, b, c);
      AROUND.push([(k * a) / l, (k * b) / l, (k * c) / l]);
    }
  const tightAt = (x, y, z) => {
    for (const [a, b, c] of AROUND) {
      cast(x, y, z, x + a * TIGHT, y + b * TIGHT, z + c * TIGHT, 0);
      if (firstSolid() >= 0) return true;
    }
    return false;
  };

  // ---- Spots.
  const free = (x, z, y) => {
    const p = { x, z };
    // Any hit rejects the spot: between two overlapping boxes, pushOut can bounce a point back
    // to where it started, so "didn't move" alone accepts spots inside solid buildings.
    const hit = world.pushOut(p, T.radius, y);
    return !hit && Math.hypot(p.x - x, p.z - z) < 0.03;
  };
  const standable = (x, z) => {
    const g = world.groundAt(x, z);
    if (world.waterAt(x, z, 0) - g > T.wadeMax) return null;
    if (world.surfaceHeightAt(x, z) === null && world.slopeAt(x, z) < T.minSlopeY) return null;
    return free(x, z, g) ? g : null;
  };
  const islandBox = (name) => {
    const b = new Box3(),
      tmp = new Box3();
    scene.getObjectByName(name)?.traverse((o) => {
      if (/terrain-chunk/.test(o.name) && o.geometry) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        b.union(tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
      }
    });
    return b;
  };
  const islands = cfg.islands.map((i) => ({ id: i.id, box: islandBox(i.terrain) }));
  const boxes = world.boxes();
  const circles = world.circles();
  const spots = [];
  for (const isl of islands) {
    const b = isl.box;
    if (b.isEmpty()) continue;
    const inBox = (x, z) => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z;
    const grid = [],
      sea = [],
      ring = [];
    for (let x = b.min.x; x < b.max.x; x += 6)
      for (let z = b.min.z; z < b.max.z; z += 6) {
        const px = x + rand() * 6,
          pz = z + rand() * 6;
        // The last cell can jitter past the island's height data, where the ground drops to the open
        // sea's fallback depth in one step (at Meridian's east edge, from the ridge's 86 m to -52 m).
        if (!inBox(px, pz)) continue;
        if (standable(px, pz) !== null) grid.push({ x: px, z: pz, kind: 'ground' });
        else if (world.waterAt(px, pz, 0) - world.groundAt(px, pz) > 4)
          sea.push({ x: px, z: pz, kind: 'sail' });
      }
    const around = (cx, cz, n, at) => {
      for (let i = 0; i < n; i++) {
        const [lx, lz] = at((i / n) * Math.PI * 2);
        const x = cx + lx,
          z = cz + lz;
        if (inBox(x, z) && standable(x, z) !== null) ring.push({ x, z, kind: 'beside' });
      }
    };
    const pad = T.radius + 0.12;
    for (const c of boxes) {
      const cs = Math.cos(c.rot),
        sn = Math.sin(c.rot);
      around(c.x, c.z, 8, (a) => {
        // A point on the padded outline, box-local to world (the inverse of collision's toLocal).
        const ux = Math.cos(a),
          uz = Math.sin(a);
        const k = Math.min(
          (c.hx + pad) / Math.max(1e-6, Math.abs(ux)),
          (c.hz + pad) / Math.max(1e-6, Math.abs(uz)),
        );
        return [ux * k * cs + uz * k * sn, -ux * k * sn + uz * k * cs];
      });
    }
    for (const c of circles)
      if (c.r >= 0.25) around(c.x, c.z, 6, (a) => [Math.cos(a) * (c.r + pad), Math.sin(a) * (c.r + pad)]);
    shuffle(grid);
    shuffle(ring);
    const take = ring.slice(0, Math.floor(cfg.samples / 2));
    take.push(...grid.slice(0, cfg.samples - take.length));
    for (const p of take) spots.push({ ...p, island: isl.id, y: world.groundAt(p.x, p.z) });
    // Decks above the ground (Thousand-Bough's tree village): spots on its stair, decks, bridges and
    // lookouts too (feet on the walk surface under each).
    for (const [x, z, y] of cfg.decks[isl.id] ?? []) {
      const g = world.groundAt(x, z, y + 0.3);
      if (Math.abs(g - y) < 0.6 && free(x, z, g)) spots.push({ x, z, kind: 'deck', island: isl.id, y: g });
    }
    const coast = shuffle(
      sea.filter((p) => {
        for (let a = 0; a < 8; a++)
          if (world.groundAt(p.x + Math.cos(a) * 40, p.z + Math.sin(a) * 40) > 0.5) return true;
        return false;
      }),
    );
    for (const p of coast.slice(0, cfg.sail)) spots.push({ ...p, island: isl.id, y: 0 });
  }
  // Walk spots in clusters (the player stands at the middle so vegetation near it is drawn); sail
  // spots one by one.
  const clusters = [];
  for (const sp of spots) {
    if (sp.kind === 'sail') {
      clusters.push({ x: sp.x, z: sp.z, sail: true, spots: [sp] });
      continue;
    }
    let c = clusters.find((c) => !c.sail && Math.hypot(c.x - sp.x, c.z - sp.z) < 18);
    if (!c) clusters.push((c = { x: sp.x, z: sp.z, sail: false, spots: [] }));
    c.spots.push(sp);
  }

  // The collider nearest a point (to explain a hit): how far outside its footprint, and its top.
  const nearestCollider = (x, y, z) => {
    let best = null;
    const consider = (kind, d, top, c) => {
      if (!best || d < best.d) best = { kind, d, top, c };
    };
    for (const b of boxes) {
      if (Math.abs(b.x - x) > 40 || Math.abs(b.z - z) > 40) continue;
      const dx = x - b.x,
        dz = z - b.z;
      const c = Math.cos(b.rot),
        sn = Math.sin(b.rot);
      const lx = Math.abs(dx * c - dz * sn) - b.hx,
        lz = Math.abs(dx * sn + dz * c) - b.hz;
      const d = lx > 0 || lz > 0 ? Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) : Math.max(lx, lz);
      consider('box', d, b.y1 ?? world.ground.heightAt(b.x, b.z) + (b.height ?? 9), b);
    }
    for (const c of circles) {
      if (Math.abs(c.x - x) > 40 || Math.abs(c.z - z) > 40) continue;
      consider(
        `r${c.r.toFixed(2)}`,
        Math.hypot(x - c.x, z - c.z) - c.r,
        c.y1 ?? world.groundAt(c.x, c.z) + (c.height ?? (c.r >= 1.5 ? 12 : 0)),
        c,
      );
    }
    if (!best) return 'none';
    const c = best.c;
    const at =
      `at (${c.x.toFixed(1)}, ${c.z.toFixed(1)})` +
      (c.hx ? ` ${(2 * c.hx).toFixed(1)}x${(2 * c.hz).toFixed(1)}` : '');
    const size = `h ${c.height ?? '-'} base ${world.groundAt(c.x, c.z).toFixed(1)}`;
    return `${best.kind} ${best.d >= 0 ? '+' : ''}${best.d.toFixed(2)}m ${at} ${size} top ${best.top.toFixed(1)} (eye y ${y.toFixed(1)})`;
  };

  // ---- The camera sweep.
  const three = new dev.camera.constructor(dev.camera.fov, dev.camera.aspect, dev.camera.near, 2000);
  const hh = three.near * Math.tan((three.fov * Math.PI) / 360);
  const hw = hh * three.aspect;
  const look = { lookX: 0, lookY: 0, zoom: 0 };
  const eye = new Vector3(),
    fwd = new Vector3(),
    up = new Vector3(),
    right = new Vector3();
  const pts = [new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  const hitAt = new Vector3();
  const frameKeys = new Set();
  const YAWS = 24;
  let clock = 0;
  const runSpot = (spot, rig, pitches, zooms, rep) => {
    const target = { x: spot.x, y: spot.y, z: spot.z };
    const py = spot.y + rig.pivotY;
    // A pivot that's already inside something (a spot under a low beam) isn't the camera's fault.
    if (insideAt({ x: spot.x, y: py, z: spot.z })) {
      rep.skipped++;
      return;
    }
    // Nor is one where drawn geometry comes closer to the pivot than the player's own radius plus the
    // near plane (trim or a sill that sticks out past its collider): the head is already in it there.
    if (tightAt(spot.x, py, spot.z)) {
      rep.tight++;
      return;
    }
    rep.spots++;
    const worst = new Map();
    // Frames per hit (kind + what was hit) at this spot.
    const hitFrames = new Map();
    for (const want of zooms)
      for (const pitch of pitches) {
        const fc = new FollowCamera();
        if (rig !== WALK_RIG) fc.setRig(rig, true);
        fc.wantDist = want;
        fc.pitch = pitch;
        fc.snapBehind(rand() * Math.PI * 2);
        look.lookX = 0;
        fc.update(1 / 60, three, look, target, 0, false, world, clock);
        look.lookX = (Math.PI * 2) / YAWS;
        for (let f = 0; f <= YAWS; f++) {
          clock += 1 / 60;
          if (f > 0) fc.update(1 / 60, three, look, target, 0, false, world, clock);
          rep.frames++;
          three.updateMatrixWorld();
          rep.reach += three.position.distanceTo(fc.pivot) / want;
          const m = three.matrixWorld.elements;
          eye.set(m[12], m[13], m[14]);
          right.set(m[0], m[1], m[2]);
          up.set(m[4], m[5], m[6]);
          fwd.set(-m[8], -m[9], -m[10]);
          const c = pts[0].copy(eye).addScaledVector(fwd, three.near);
          pts[1].copy(c).addScaledVector(right, -hw).addScaledVector(up, -hh);
          pts[2].copy(c).addScaledVector(right, hw).addScaledVector(up, -hh);
          pts[3].copy(c).addScaledVector(right, hw).addScaledVector(up, hh);
          pts[4].copy(c).addScaledVector(right, -hw).addScaledVector(up, hh);
          let bad = false;
          frameKeys.clear();
          const flag = (kind, depth, path = '', at = pts[0], tri = -1) => {
            bad = true;
            const k = kind + path;
            frameKeys.add(k);
            const prev = worst.get(k);
            if (prev && depth <= prev.depth) return;
            worst.set(k, {
              kind,
              depth: +depth.toFixed(3),
              path,
              yaw: +fc.yaw.toFixed(3),
              pitch: +fc.pitch.toFixed(3),
              want,
              dist: +eye.distanceTo(fc.pivot).toFixed(2),
              near: nearestCollider(eye.x, eye.y, eye.z),
              eye: [eye.x, eye.y, eye.z],
              hit: [at.x, at.y, at.z],
              tri: tri < 0 ? null : Array.from(G.tri.subarray(tri * 9, tri * 9 + 9), (v) => +v.toFixed(2)),
              fwd: [fwd.x * three.near, fwd.y * three.near, fwd.z * three.near],
              at: [fc.pivot.x, fc.pivot.y, fc.pivot.z],
            });
          };
          for (const p of pts) {
            const g = world.ground.heightAt(p.x, p.z);
            if (p.y < g - 0.01) flag('terrain', g - p.y);
            const w = world.waterAt(p.x, p.z, clock);
            if (p.y < w - 0.01) flag('water', w - p.y);
          }
          const inside = insideAt(pts[0]);
          if (inside) flag('inside', inside.depth, G.owners[inside.owner].path);
          else {
            const len = cast(fc.pivot.x, fc.pivot.y, fc.pivot.z, pts[0].x, pts[0].y, pts[0].z, 0);
            for (const i of order)
              if (H.t[i] < len - 0.3 && !G.owners[H.owner[i]].foliage) {
                rep.occluded++;
                break;
              }
          }
          for (let i = 1; i <= 4; i++) {
            const a = pts[i],
              b = pts[i === 4 ? 1 : i + 1];
            let from = a,
              to = b;
            let len = cast(a.x, a.y, a.z, b.x, b.y, b.z, 0);
            if (!H.n) {
              from = eye;
              to = a;
              len = cast(eye.x, eye.y, eye.z, a.x, a.y, a.z, 0);
            }
            if (H.n) {
              const ow = G.owners[H.owner[order[0]]];
              if (ow.foliage) rep.foliage++;
              else
                flag(
                  'touch',
                  0.05,
                  ow.path,
                  hitAt
                    .copy(to)
                    .sub(from)
                    .multiplyScalar(H.t[order[0]] / len)
                    .add(from),
                  H.tri[order[0]],
                );
            }
          }
          if (bad) rep.badFrames++;
          for (const k of frameKeys) hitFrames.set(k, (hitFrames.get(k) ?? 0) + 1);
        }
      }
    for (const [k, v] of worst) {
      rep.counts[v.kind] = (rep.counts[v.kind] ?? 0) + 1;
      rep.hits.push({
        frames: hitFrames.get(k) ?? 0,
        island: spot.island,
        spot: spot.kind,
        x: +spot.x.toFixed(2),
        z: +spot.z.toFixed(2),
        y: +spot.y.toFixed(2),
        ...v,
      });
    }
  };
  const wr = WALK_RIG,
    sr = SAIL_RIG;
  window.__camtest = {
    clusters,
    // What the six axis rays from p meet first (for --probe).
    probe(i, p) {
      const c = clusters[i];
      build(c.x, c.z, 18 + (c.sail ? sr : wr).maxDist + 22, !c.sail);
      const r = [];
      for (let d = 0; d < 18; d += 3) {
        cast(p[0], p[1], p[2], p[0] + DIRS[d], p[1] + DIRS[d + 1], p[2] + DIRS[d + 2], 24);
        const k = firstSolid();
        r.push(
          k < 0
            ? 'none'
            : `${H.enter[k] ? 'front' : 'BACK'} ${H.t[k].toFixed(2)} ${G.owners[H.owner[k]].path}`,
        );
      }
      return r;
    },
    run(i) {
      const c = clusters[i];
      const rig = c.sail ? sr : wr;
      const rep = {
        spots: 0,
        skipped: 0,
        tight: 0,
        frames: 0,
        badFrames: 0,
        foliage: 0,
        occluded: 0,
        reach: 0,
        counts: {},
        hits: [],
      };
      const tris = build(c.x, c.z, 18 + rig.maxDist + 22, !c.sail);
      const pitches = c.sail
        ? [sr.pitchMin, sr.pitch, 0.6, sr.pitchMax]
        : [wr.pitchMin, -0.15, wr.pitch, 0.8, wr.pitchMax];
      for (const sp of c.spots) runSpot(sp, rig, pitches, [rig.dist, rig.maxDist], rep);
      rep.tris = tris;
      return rep;
    },
  };
  return clusters.map((c) => ({
    x: c.x,
    z: c.z,
    sail: c.sail,
    n: c.spots.length,
    island: c.spots[0].island,
  }));
}, cfg);

const total = {
  spots: 0,
  skipped: 0,
  tight: 0,
  frames: 0,
  badFrames: 0,
  foliage: 0,
  occluded: 0,
  reach: 0,
  counts: {},
  hits: [],
  notShown: 0,
};
// Each island's terrain and silhouette (the scene's object names, tools/lib/islands.json).
const SHOWN = Object.fromEntries(ISLANDS.map((i) => [i.id, [i.terrain, i.silhouette]]));
for (const [i, c] of clusters.entries()) {
  if (near && Math.hypot(c.x - near[0], c.z - near[1]) > near[2]) continue;
  if (!c.sail) {
    // Stand at the cluster so the vegetation round it is drawn (plants are culled by distance).
    await page.evaluate((c) => window.__dev.bench.teleport(c.x, c.z, 0), c);
    await page.waitForTimeout(250);
  }
  // Test what the game draws when you stand there: the island, not its silhouette. Each island
  // swaps by the game camera's distance. After a teleport, that camera moves across from the last
  // island in a few seconds (from Thousand-Bough to Anchorage, 14 clusters had the silhouette).
  const parts = SHOWN[c.island];
  const shown = await page
    .waitForFunction(
      ([terrain, silhouette]) => {
        const scene = window.__dev.scene;
        const drawn = (o) => {
          for (let x = o; x; x = x.parent) if (!x.visible) return false;
          return !!o;
        };
        const s = scene.getObjectByName(silhouette);
        return drawn(scene.getObjectByName(terrain)) && !(s && drawn(s));
      },
      parts,
      { timeout: 20000 },
    )
    .then(
      () => true,
      () => false,
    );
  if (!shown) {
    total.notShown++;
    process.stderr.write(`  cluster ${i} (${c.island}): its island didn't show in 20 s\n`);
  }
  const r = await page.evaluate((i) => window.__camtest.run(i), i);
  for (const k of ['spots', 'skipped', 'tight', 'frames', 'badFrames', 'foliage', 'occluded', 'reach'])
    total[k] += r[k];
  for (const [k, v] of Object.entries(r.counts)) total.counts[k] = (total.counts[k] ?? 0) + v;
  total.hits.push(...r.hits);
  if (i % 20 === 19)
    process.stderr.write(`  ${i + 1}/${clusters.length} clusters, ${total.badFrames} bad frames\n`);
}

const rank = { inside: 0, terrain: 1, water: 2, touch: 3 };
total.hits.sort((a, b) => rank[a.kind] - rank[b.kind] || b.depth - a.depth);
for (const h of total.hits.slice(0, list))
  console.log(
    `${h.kind.padEnd(8)} ${h.island.padEnd(9)} ${h.spot.padEnd(6)} (${h.x}, ${h.z}) y ${h.y} frames ${h.frames} eye (${h.eye.map((v) => v.toFixed(1)).join(', ')}) ` +
      `yaw ${h.yaw} pitch ${h.pitch} dist ${h.dist}/${h.want} depth ${h.depth}${h.path ? ` ${h.path}` : ''}` +
      ` at (${h.hit.map((v) => v.toFixed(2)).join(', ')})` +
      (opt.explain ? `  [nearest: ${h.near}]${h.tri ? ` tri ${h.tri.join(',')}` : ''}` : ''),
  );

if (opt.probe)
  for (const h of total.hits.slice(0, list)) {
    const i = clusters.findIndex(
      (c) => Math.hypot(c.x - h.x, c.z - h.z) < 30 && c.sail === (h.spot === 'sail'),
    );
    const p = h.eye.map((v, k) => v + (h.fwd?.[k] ?? 0));
    console.log(
      `probe eye ${p.map((v) => v.toFixed(2)).join(', ')}:\n  ` +
        (await page.evaluate(([i, p]) => window.__camtest.probe(i, p), [i, p])).join('\n  '),
    );
  }

if (out && total.hits.length) {
  // Freeze the game loop and draw each hit from the tested camera pose (the HUD stays on top).
  mkdirSync(out, { recursive: true });
  let n = 0;
  for (const h of total.hits) {
    if (n >= 8) break;
    if (match && !match.test(`${h.island} ${h.path ?? ''} ${h.near ?? ''}`)) continue;
    if (h.spot !== 'sail') {
      await page.evaluate((h) => window.__dev.bench.teleport(h.x, h.z, h.yaw, h.yaw, h.pitch), h);
      await page.waitForTimeout(600);
    }
    for (const back of [0, 4]) {
      await page.evaluate(
        ([h, back]) =>
          new Promise((done) => {
            const { engine, camera } = window.__dev;
            engine.stop();
            camera.position.set(...h.eye);
            if (back) {
              // The context view: from further out along the same line (and up), looking at the eye.
              const d = camera.position
                .clone()
                .sub(camera.position.clone().set(...h.at))
                .normalize();
              camera.position.addScaledVector(d, back).setY(camera.position.y + back * 0.5);
              camera.lookAt(...h.eye);
            } else camera.lookAt(...h.at);
            camera.updateMatrixWorld();
            // One draw per animation frame (the canvas only shows draws made in one), several of them
            // so temporal AA settles on the new pose.
            let k = 0;
            const draw = () => {
              engine.renderNow();
              if (++k < 12) requestAnimationFrame(draw);
              else requestAnimationFrame(() => requestAnimationFrame(done));
            };
            requestAnimationFrame(draw);
          }),
        [h, back],
      );
      await page.screenshot({
        path: `${out}/camera-${n}-${h.kind}${back ? '-context' : ''}.jpg`,
        quality: 70,
      });
    }
    n++;
    await page.evaluate(() => window.__dev.engine.start());
  }
}

if (opt.warn) for (const l of logs) console.log(l);
const errors = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
console.log(
  JSON.stringify({
    seconds: Math.round((Date.now() - t0) / 1000),
    clusters: clusters.length,
    spots: total.spots,
    skipped: total.skipped,
    tight: total.tight,
    notShown: total.notShown,
    frames: total.frames,
    badFrames: total.badFrames,
    hits: total.counts,
    info: {
      foliageTouches: total.foliage,
      occludedFrames: total.occluded,
      // How far out the camera gets on average, as a share of the zoom you asked for.
      meanReach: +(total.reach / Math.max(1, total.frames)).toFixed(3),
    },
    errors: errors.slice(0, 5),
  }),
);
await browser.close();
process.exit(total.badFrames > Number(opt['max-bad'] ?? 20) || total.notShown || errors.length ? 1 : 0);
