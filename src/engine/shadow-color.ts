import type { NodeBuilder, NodeMaterial } from 'three/webgpu';

const plain = new WeakSet<NodeMaterial>();

/**
 * Keeps an opaque material's colour graph out of its shadow pass (PLAN §15.4).
 *
 * three builds a material's shadow shader with the alpha of its `colorNode`, so each colour graph
 * also got its own shadow shaders, though an opaque material's alpha changes nothing in a depth
 * map. This moves the graph out of `colorNode` and puts it back only while the material's own
 * shader is set up (`setupDiffuseColor`), so the lit shader is unchanged and every opaque material
 * shares one plain shadow shader. Materials that are transparent, alpha-tested or masked keep their
 * graph (their shadow needs the alpha). Call it once the graph is final, and not before a clone():
 * a clone would lose the graph.
 */
export function plainShadowColor<M extends NodeMaterial>(material: M): M {
  if (plain.has(material)) return material;
  const look = material.colorNode;
  if (!look || material.transparent || material.alphaTest > 0 || material.alphaToCoverage) return material;
  if (material.maskNode || material.maskShadowNode || material.castShadowNode) return material;
  plain.add(material);
  material.colorNode = null;
  const setup = material.setupDiffuseColor;
  material.setupDiffuseColor = function (this: M, builder: NodeBuilder): void {
    this.colorNode = look;
    try {
      setup.call(this, builder);
    } finally {
      this.colorNode = null;
    }
  };
  return material;
}
