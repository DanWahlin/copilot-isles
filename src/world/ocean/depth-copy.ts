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

  constructor(
    uv: ConstructorParameters<typeof ViewportDepthTextureNode>[0],
    level: ConstructorParameters<typeof ViewportDepthTextureNode>[1],
    private readonly owner: MatchedDepth,
  ) {
    super(uv, level, owner.placeholder);
  }

  override getTextureForReference(reference: RenderTarget | CanvasTarget | null = null): Texture {
    const shared = this.owner.placeholder;
    let tex: DepthTexture;
    if (reference === null) tex = shared;
    else {
      // Each `.sample(uv)` is a clone pointing at its base node: they share the base's copies (as
      // three's own viewport textures do), not one full-screen depth copy each.
      const cache = ((this as unknown as { referenceNode?: MatchedDepthNode }).referenceNode ?? this)
        .cacheTextures;
      const cached = cache.get(reference);
      if (cached) tex = cached;
      else {
        const copy = (tex = shared.clone() as DepthTexture);
        cache.set(reference, copy);
        // A target that goes (an old post stack's pass) takes its copy with it.
        const target = reference as unknown as DisposeSource;
        const drop = () => {
          target.removeEventListener('dispose', drop);
          if (cache.get(reference) === copy) cache.delete(reference);
          copy.dispose();
        };
        target.addEventListener('dispose', drop);
      }
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
    const node = new MatchedDepthNode(this.uvNode ?? screenUV, this.levelNode ?? null, this.owner) as this;
    node.generateMipmaps = this.generateMipmaps;
    this.owner.nodes.add(node as MatchedDepthNode);
    return node;
  }
}

interface DisposeSource {
  addEventListener(type: 'dispose', listener: () => void): void;
  removeEventListener(type: 'dispose', listener: () => void): void;
}

/**
 * One owner's depth copies (an ocean's): the nodes its material builds, their per-target copies, and
 * the placeholder they're bound to before the first copy. Each owner frees only its own: one shared
 * set, freed by whichever ocean went first, left the other ocean's nodes holding textures nobody freed
 * (a 1×1 depth texture more at the title after each voyage, issue 248).
 */
export class MatchedDepth {
  readonly placeholder = Object.assign(new DepthTexture(), { name: 'ocean depth copy' });
  readonly nodes = new Set<MatchedDepthNode>();

  /** One depth copy per frame; sample it at any uv with `.sample(uv)`. */
  node(uv: Node<'vec2'> = screenUV): ViewportDepthTextureNode {
    const node = new MatchedDepthNode(uv, null, this);
    this.nodes.add(node);
    return nodeObject(node) as unknown as ViewportDepthTextureNode;
  }

  dispose(): void {
    for (const node of this.nodes) node.disposeDepthCopies();
    this.nodes.clear();
    this.placeholder.dispose();
  }
}
