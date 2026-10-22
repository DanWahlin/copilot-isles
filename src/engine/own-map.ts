import { RGFormat } from 'three/webgpu';
import { materialColor, normalMap, texture, uniform } from 'three/tsl';
import type { MeshStandardNodeMaterial, NodeMaterial, Texture } from 'three/webgpu';

/**
 * Gives `material` its colour from `map` through a texture node of its own instead of three's `map`
 * slot (colour × map, as three's slot does), and frees the texture with the material
 * (`disposeMaterialWithTextures` reads `userData.disposeTextures`). For a texture that's freed while
 * other looks with a `map` still build: the opening's, freed at the dive while the world lives on, and
 * an island's own (a dock gull's, a plant only Anchorage grows), freed while it's dormant or unloaded.
 *
 * three r186 reads every material's `map` (and `normalMap`, `emissiveMap`…) through one shared
 * reference node (`MaterialNode`'s property cache), which holds the texture of whichever material it
 * was last updated for. A build's texture binding keeps the value it holds at the build's generate
 * stage, and every new render object of that look uploads that texture when its bindings are made,
 * before its own update swaps in its material's. compileAsync's builds yield between stages, so a
 * frame drawn mid-build (the cabin's, while the world warms behind it) leaves its texture in another
 * look's binding: a world sprite's look kept the cabin's nameplate and uploaded it again after the
 * opening had freed it, and nothing freed it after that (issue 264). With its own node, no other
 * look can see it; its own look's binding holds the texture it draws anyway.
 *
 * For a look many materials share (each with its own texture), use `materialTexture` instead
 * (engine/texture-stand-in.ts): a node per material is a look per material.
 */
export function ownMap<M extends NodeMaterial>(material: M, map: Texture): M {
  if ('map' in material) (material as { map: Texture | null }).map = null;
  material.colorNode = materialColor.mul(texture(map));
  return freeWith(material, map);
}

/**
 * `ownMap` for a standard material's `normalMap`: the same normal (tangent or object space, scaled by
 * the material's `normalScale`) through a texture node of its own.
 */
export function ownNormalMap<M extends MeshStandardNodeMaterial>(material: M, map: Texture): M {
  material.normalMap = null;
  const node = normalMap(texture(map), uniform(material.normalScale));
  node.normalMapType = material.normalMapType;
  if (map.format === RGFormat) node.unpackNormalMode = 'rg';
  material.normalNode = node;
  return freeWith(material, map);
}

function freeWith<M extends NodeMaterial>(material: M, map: Texture): M {
  const extras = material.userData.disposeTextures as unknown;
  material.userData.disposeTextures =
    extras === undefined ? map : Array.isArray(extras) ? [...(extras as unknown[]), map] : [extras, map];
  return material;
}
