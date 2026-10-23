import type { Camera, Node, TempNode } from 'three/webgpu';

/** three's TRAANode (r186), with its depth stand-in freed on dispose and `restartJitter` (traa-node.js). */
export declare class TRAANode extends TempNode {
  getTextureNode(): Node<'vec4'>;
  /** Starts the jitter sequence over at its first offset (frozen shots). */
  restartJitter(): void;
  dispose(): void;
}

export declare const traa: (
  beautyNode: Node,
  depthNode: Node,
  velocityNode: Node,
  camera: Camera,
) => TRAANode;

export default TRAANode;
