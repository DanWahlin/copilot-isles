import { texture } from 'three/tsl';
import type { NodeMaterial, Texture } from 'three/webgpu';

/**
 * Gives `material` its colour from `map` through a texture node of its own instead of three's `map`
 * slot (it replaces the material's `color`), and frees the texture with the material
 * (`disposeMaterialWithTextures` reads `userData.disposeTextures`). For a texture that's freed while
 * other looks with a `map` still build: the opening's, freed at the dive while the world lives on.
 *
 * three r186 reads every material's `map` (and `normalMap`, `emissiveMap`…) through one shared
 * reference node (`MaterialNode`'s property cache), which holds the texture of whichever material it
 * was last updated for. A build's texture binding keeps the value it holds at the build's generate
 * stage, and every new render object of that look uploads that texture when its bindings are made,
 * before its own update swaps in its material's. compileAsync's builds yield between stages, so a
 * frame drawn mid-build (the cabin's, while the world warms behind it) leaves its texture in another
 * look's binding: a world sprite's look kept the cabin's nameplate and uploaded it again after the
 * opening had freed it, and nothing freed it after that (issue 264).
 */
export function ownMap<M extends NodeMaterial>(material: M, map: Texture): M {
  material.colorNode = texture(map);
  const extras = material.userData.disposeTextures as unknown;
  material.userData.disposeTextures =
    extras === undefined ? map : Array.isArray(extras) ? [...(extras as unknown[]), map] : [extras, map];
  return material;
}
