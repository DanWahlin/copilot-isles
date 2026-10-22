import {
  DataTexture,
  MaterialReferenceNode,
  RGBAFormat,
  UnsignedByteType,
  type NodeBuilder,
  type Texture,
} from 'three/webgpu';
import { nodeObject } from 'three/tsl';

/**
 * A texture a look reads per material (a palette, a sign atlas) through a reference made in its build,
 * whose build binds a stand-in instead of the building material's own texture.
 *
 * three r186 builds a look once and gives every new render object of it a copy of that build's
 * bindings (NodeBuilderState.createBindings). A texture binding starts from the texture its build saw
 * (`NodeSampledTexture` reads the node's value when it's made), and a new render object uploads that
 * texture when its bindings are made (Bindings `_createBindings`), before its own update swaps in its
 * material's. So a look built first for a texture that's freed later (Anchorage's sign atlas and NPC
 * palettes, freed while it's dormant; a streamed island's, freed when it unloads) uploads it again for
 * every later object of that look: Thousand-Bough's signs uploaded Anchorage's 4 MB atlas at each warm
 * (issue 265). Here the build sees a stand-in instead: a 1 × 1 texture with every property the shader
 * code and the binding layout depend on (format, type, colour space, filters, wrapping), so the look's
 * shader is the one its own texture would have built, and no material's texture is held by a binding
 * it doesn't draw. Each draw still reads its material's texture (three's per-object reference update).
 */
class StandInReference extends MaterialReferenceNode {
  override setup(builder: NodeBuilder): ReturnType<MaterialReferenceNode['setup']> {
    const node = super.setup(builder);
    const inner = this.node as (typeof this.node & { value: unknown }) | null;
    const own = inner?.value as Texture | null | undefined;
    if (inner && own?.isTexture) inner.value = textureStandIn(own);
    return node;
  }
}

/**
 * The material's texture property `property`, read per draw like three's `materialReference(…,
 * 'texture')`, with no material's texture in the look's bindings (`StandInReference`). Make it inside
 * the material's build (`setupDiffuseColor`), as three's own material references are: one node made
 * once would be every look's, and a frame drawn mid-build would leave its texture there (issue 264).
 */
export function materialTexture(property: string): ReturnType<typeof nodeObject<MaterialReferenceNode>> {
  return nodeObject(new StandInReference(property, 'texture'));
}

const standIns = new Map<string, Texture>();

/** What a texture binding's shader code and layout depend on (three's WGSL and GLSL builders). */
function standInKey(t: Texture): string {
  return [
    t.format,
    t.type,
    t.internalFormat,
    t.colorSpace,
    t.minFilter,
    t.magFilter,
    t.wrapS,
    t.wrapT,
  ].join();
}

/**
 * The stand-in for `source`: shared by every look whose textures are alike, kept for the page (4 bytes
 * each). Only 8-bit RGBA textures (canvases, images) have one; anything else stands for itself.
 */
export function textureStandIn(source: Texture): Texture {
  if (source.format !== RGBAFormat || source.type !== UnsignedByteType) return source;
  const key = standInKey(source);
  let t = standIns.get(key);
  if (!t) {
    t = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    t.name = 'texture stand-in';
    t.internalFormat = source.internalFormat;
    t.colorSpace = source.colorSpace;
    t.minFilter = source.minFilter;
    t.magFilter = source.magFilter;
    t.wrapS = source.wrapS;
    t.wrapT = source.wrapT;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    standIns.set(key, t);
  }
  return t;
}

/**
 * Frees the stand-ins' GPU copies (the world's owner, after a voyage, like the other shared caches);
 * the next voyage's first draws upload them again.
 */
export function releaseTextureStandIns(): void {
  for (const t of standIns.values()) t.dispose();
}
