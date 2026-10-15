import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, type Object3D } from 'three/webgpu';
import { compileProgressively, revealPrewarm, warmProgressively } from './warm';

/** A root with a part that's shown only later (like Meridian's mooring lines or the ship's gangplank). */
function world(): { root: Group; late: Group; lateMesh: Mesh; hidden: Group } {
  const root = new Group();
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial();
  root.add(new Mesh(geometry, material));
  const late = new Group();
  late.visible = false;
  late.userData.prewarm = true;
  const lateMesh = new Mesh(geometry, material);
  late.add(lateMesh);
  root.add(late);
  const hidden = new Group();
  hidden.visible = false;
  hidden.add(new Mesh(geometry, material));
  root.add(hidden);
  return { root, late, lateMesh, hidden };
}

describe('revealPrewarm', () => {
  it('shows only the marked hidden parts, then hides them again', () => {
    const { root, late, hidden } = world();
    const hide = revealPrewarm(root);
    expect(late.visible).toBe(true);
    expect(hidden.visible).toBe(false);
    hide();
    expect(late.visible).toBe(false);
  });

  it('lets a warm compile a part that appears later', async () => {
    const { root, lateMesh } = world();
    const compiled: Object3D[] = [];
    const compile = (o: Object3D) => {
      compiled.push(o);
      return Promise.resolve();
    };
    await compileProgressively(root, compile, () => Promise.resolve());
    expect(compiled).not.toContain(lateMesh);
    compiled.length = 0;
    const hide = revealPrewarm(root);
    await compileProgressively(root, compile, () => Promise.resolve());
    hide();
    expect(compiled).toContain(lateMesh);
    expect(compiled).toHaveLength(2);
  });
});

/** Meshes over `looks` materials (`perLook` sharing each), under one root. */
function looks(count: number, perLook: number): { root: Group; meshes: Mesh[] } {
  const root = new Group();
  const geometry = new BoxGeometry(1, 1, 1);
  const meshes: Mesh[] = [];
  for (let i = 0; i < count; i++) {
    const material = new MeshBasicMaterial();
    for (let j = 0; j < perLook; j++) {
      const mesh = new Mesh(geometry, material);
      root.add(mesh);
      meshes.push(mesh);
    }
  }
  return { root, meshes };
}

/** Plays a warm, pricing each frame at `msPerLook` for each new material drawn; returns the frames. */
async function playWarm(
  root: Group,
  meshes: Mesh[],
  msPerLook: number,
  opts: Parameters<typeof warmProgressively>[2] = {},
): Promise<{ looks: number; objects: number }[]> {
  const seen = new Set<unknown>();
  const frames: { looks: number; objects: number }[] = [];
  let cost = 0;
  const nextFrame = () => {
    // A mesh is let in when it's back on its own layer (the camera's, 0).
    const drawn = meshes.filter((m) => m.layers.isEnabled(0) && !m.frustumCulled);
    const fresh = new Set(drawn.map((m) => m.material).filter((m) => !seen.has(m)));
    for (const m of fresh) seen.add(m);
    frames.push({ looks: fresh.size, objects: drawn.length });
    cost = 2 + fresh.size * msPerLook;
    return Promise.resolve();
  };
  await warmProgressively(root, nextFrame, { frameCost: () => cost, ...opts });
  return frames;
}

describe('warmProgressively', () => {
  it('lets in about as many new looks a frame as fit the target', async () => {
    const { root, meshes } = looks(20, 1);
    const frames = await playWarm(root, meshes, 10, { targetMs: 12, startBatch: 1 });
    // ~10 ms a new look: one a frame, never a pile of them (the cabin held ~110 ms for twelve).
    expect(Math.max(...frames.map((f) => f.looks))).toBeLessThanOrEqual(2);
    expect(frames.reduce((n, f) => n + f.looks, 0)).toBe(20);
  });

  it('lets objects sharing a built look in alongside, and keeps growth in check after them', async () => {
    const { root, meshes } = looks(4, 30);
    const frames = await playWarm(root, meshes, 10, { targetMs: 12, startBatch: 1 });
    // 120 objects over 4 looks: far fewer frames than objects.
    expect(frames.length).toBeLessThan(40);
    expect(Math.max(...frames.map((f) => f.looks))).toBeLessThanOrEqual(2);
  });

  it('puts every object back on its own layer and culling', async () => {
    const { root, meshes } = looks(3, 2);
    meshes[0]!.layers.set(2);
    meshes[1]!.frustumCulled = false;
    await playWarm(root, meshes, 1);
    expect(meshes[0]!.layers.mask).toBe(1 << 2);
    expect(meshes[1]!.frustumCulled).toBe(false);
    expect(meshes[2]!.layers.mask).toBe(1);
    expect(meshes[2]!.frustumCulled).toBe(true);
  });
});

describe('compileProgressively', () => {
  it('keeps at most `inFlight` compiles running', async () => {
    const { root } = looks(12, 1);
    let running = 0;
    let most = 0;
    const compile = async () => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
    };
    const out = await compileProgressively(root, compile, () => Promise.resolve(), 6, 3);
    expect(out.objects).toBe(12);
    expect(most).toBe(3);
  });
});
