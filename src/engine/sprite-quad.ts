import { BufferGeometry, Float32BufferAttribute, type Sprite } from 'three/webgpu';

/**
 * The quad our sprites draw (issue 251). three's `Sprite` shares one module-wide geometry with
 * interleaved attributes, and three r186's WebGPU backend can't upload an interleaved buffer again
 * once it's disposed: it keeps the destroyed GPU buffer, so every sprite drawn after a dispose (the
 * next voyage's chest glows, fireflies, mist, gun smoke) failed validation each frame. This quad has
 * plain attributes and counts its sprites: the last release frees the GPU copy and keeps the CPU
 * data, so the next voyage uploads it again.
 */
let quad: BufferGeometry | null = null;
const users = new Set<Sprite>();

function makeQuad(): BufferGeometry {
  const g = new BufferGeometry();
  g.name = 'sprite-quad';
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute(
    'position',
    new Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3),
  );
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  return g;
}

/** Gives `sprite` the shared quad; `releaseSpriteQuad(sprite)` when the sprite's done. */
export function useSpriteQuad<T extends Sprite>(sprite: T): T {
  quad ??= makeQuad();
  sprite.geometry = quad;
  users.add(sprite);
  return sprite;
}

/** The sprite's done with the quad; the last one frees its GPU copy. Releasing twice is harmless. */
export function releaseSpriteQuad(sprite: Sprite): void {
  if (!users.delete(sprite)) return;
  if (users.size === 0) quad?.dispose();
}

/** Sprites holding the quad (tests). */
export function spriteQuadUsers(): number {
  return users.size;
}
