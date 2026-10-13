import type { Material, Object3D, Texture } from 'three/webgpu';

const MATERIAL_TEXTURE_KEYS = [
  'map',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'displacementMap',
  'emissiveMap',
  'envMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'lightMap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'specularColorMap',
  'specularIntensityMap',
  'specularMap',
  'thicknessMap',
  'transmissionMap',
] as const;

interface RenderTargetLike {
  texture?: Texture | Texture[];
  textures?: Texture[];
  depthTexture?: Texture | null;
  dispose(): void;
}

interface MaterialUserData {
  disposeTextures?: unknown;
}

function isTexture(value: unknown): value is Texture {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { isTexture?: unknown }).isTexture === true &&
    typeof (value as { dispose?: unknown }).dispose === 'function'
  );
}

export function disposeTextureOnce(texture: Texture | null | undefined, disposed: Set<Texture>): void {
  if (!texture || disposed.has(texture)) return;
  disposed.add(texture);
  texture.dispose();
}

export function disposeMaterialWithTextures(
  material: Material | Material[] | null | undefined,
  disposedTextures = new Set<Texture>(),
): void {
  if (!material) return;
  if (Array.isArray(material)) {
    for (const entry of material) disposeMaterialWithTextures(entry, disposedTextures);
    return;
  }
  const record = material as Material & Record<string, unknown>;
  for (const key of MATERIAL_TEXTURE_KEYS) {
    const texture = record[key];
    if (isTexture(texture)) disposeTextureOnce(texture, disposedTextures);
  }
  const extras = (material.userData as MaterialUserData | undefined)?.disposeTextures;
  if (Array.isArray(extras)) {
    for (const texture of extras) if (isTexture(texture)) disposeTextureOnce(texture, disposedTextures);
  } else if (isTexture(extras)) disposeTextureOnce(extras, disposedTextures);
  material.dispose();
}

/**
 * Frees the GPU copies of every texture a cached material holds (any property, e.g. a palette map),
 * keeping the material and the images: the next draw uploads them again.
 */
export function releaseMaterialTextures(material: Material): void {
  for (const value of Object.values(material)) if (isTexture(value)) value.dispose();
}

export function disposeRenderTargetTextures(target: RenderTargetLike): void {
  const disposedTextures = new Set<Texture>();
  const textures = target.textures ?? target.texture;
  if (Array.isArray(textures)) {
    for (const texture of textures) disposeTextureOnce(texture, disposedTextures);
  } else {
    disposeTextureOnce(textures, disposedTextures);
  }
  disposeTextureOnce(target.depthTexture, disposedTextures);
}

export function disposeRenderTarget(target: RenderTargetLike): void {
  disposeRenderTargetTextures(target);
  target.dispose();
}

export function disposeLightShadow(shadow: {
  map?: RenderTargetLike | null;
  mapPass?: RenderTargetLike | null;
  dispose(): void;
}): void {
  if (shadow.map) disposeRenderTarget(shadow.map);
  if (shadow.mapPass) disposeRenderTarget(shadow.mapPass);
  shadow.dispose();
}

/**
 * three keeps a drawn object's render objects (and so its shaders) until the object or its material
 * is disposed; freeing the geometry isn't enough. Objects that shared a cached material (chests,
 * palms, faces) kept theirs after a voyage. This sends `dispose` to each of `objects` that's no longer
 * under `root` (snapshot them before tearing a world down), so its render objects go.
 */
export function releaseRemovedObjects(objects: readonly Object3D[], root: Object3D): void {
  for (const object of objects) {
    let top = object;
    while (top.parent) top = top.parent;
    if (top !== root)
      (object as unknown as { dispatchEvent(e: { type: string }): void }).dispatchEvent({ type: 'dispose' });
  }
}
