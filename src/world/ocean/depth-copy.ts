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
  override getTextureForReference(reference: RenderTarget | CanvasTarget | null = null): Texture {
    const tex = super.getTextureForReference(reference) as DepthTexture;
    const src = (reference as RenderTarget | null)?.depthTexture;
    if (src && tex !== src && (tex.type !== src.type || tex.format !== src.format)) {
      tex.type = src.type;
      tex.format = src.format;
      tex.needsUpdate = true;
    }
    return tex;
  }
}

const shared = new DepthTexture();

/** One depth copy per frame; sample it at any uv with `.sample(uv)`. */
export function matchedDepthTexture(uv: Node<'vec2'> = screenUV): ViewportDepthTextureNode {
  return nodeObject(new MatchedDepthNode(uv, null, shared)) as unknown as ViewportDepthTextureNode;
}
