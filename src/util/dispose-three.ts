import type { Material, Texture } from 'three/webgpu';

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
