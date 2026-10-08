import {
  DepthTexture,
  ViewportDepthTextureNode,
  type CanvasTarget,
  type RenderTarget,
  type Texture,
} from 'three/webgpu';
import { nodeObject, screenUV } from 'three/tsl';
import type { Node } from 'three/webgpu';

/**
 * `viewportDepthTexture` whose per-render-target copy matches the target's depth format.
 * three clones one default DepthTexture (UnsignedInt) per target, but PassNode uses FloatType depth
 * with reversed depth, so the copy silently fails inside the post pipeline (issues.md #13).
 */
class MatchedDepthNode extends ViewportDepthTextureNode {
  private readonly cacheTextures = new Map<RenderTarget | CanvasTarget, DepthTexture>();

  override getTextureForReference(reference: RenderTarget | CanvasTarget | null = null): Texture {
    let tex: DepthTexture;
    if (reference === null) tex = shared;
    else {
      tex = this.cacheTextures.get(reference) ?? (shared.clone() as DepthTexture);
      this.cacheTextures.set(reference, tex);
    }
    const src = (reference as RenderTarget | null)?.depthTexture;
    if (src && tex !== src && (tex.type !== src.type || tex.format !== src.format)) {
      tex.type = src.type;
      tex.format = src.format;
      tex.needsUpdate = true;
    }
    return tex;
  }

  disposeDepthCopies(): void {
    for (const texture of this.cacheTextures.values()) texture.dispose();
    this.cacheTextures.clear();
  }

  override clone(): this {
    const node = new MatchedDepthNode(this.uvNode ?? screenUV, this.levelNode ?? undefined, shared) as this;
    node.generateMipmaps = this.generateMipmaps;
    nodes.add(node as MatchedDepthNode);
    return node;
  }
}

let shared = new DepthTexture();
const nodes = new Set<MatchedDepthNode>();

/** One depth copy per frame; sample it at any uv with `.sample(uv)`. */
export function matchedDepthTexture(uv: Node<'vec2'> = screenUV): ViewportDepthTextureNode {
  const node = new MatchedDepthNode(uv, null, shared);
  nodes.add(node);
  return nodeObject(node) as unknown as ViewportDepthTextureNode;
}

export function releaseMatchedDepthTextures(): void {
  for (const node of nodes) node.disposeDepthCopies();
  nodes.clear();
  shared.dispose();
  shared = new DepthTexture();
}
