import { BlendMode, NormalBlending, type Material, type Node, type NodeBuilder } from 'three/webgpu';
import { Fn, float, positionLocal, positionPrevious, velocity, vec4 } from 'three/tsl';

const writers = new WeakSet<Material>();

/**
 * Lets a see-through material that doesn't write depth write motion vectors too. Only for one whose
 * vertices give three their real last position (the ocean sets `positionPrevious` from the last
 * frame's waves).
 */
export function writesMotionVectors<M extends Material>(material: M): M {
  writers.add(material);
  return material;
}

/**
 * The scene pass's motion vectors for temporal AA, drawn with `velocityBlend`: alpha 1 from opaque
 * materials and from see-through ones that write depth (TRAA takes its depth from them too), so they
 * write their motion as before, and alpha 0 from see-through effects that don't (fog, mist cards,
 * sprites, glows, splashes), so the motion of what's behind them stays.
 *
 * Velocity takes no blending by default, so a transparent card wrote its own motion over its whole
 * quad, even where it's clear. A camera-facing card's motion is nonsense (three works it out from the
 * quad's plain corners, not from the sprite's position), so TRAA threw away the history of everything
 * behind it and its sub-pixel jitter showed: the trees and hills behind Thousand-Bough's mist shook.
 */
export const sceneVelocity = Fn((builder: NodeBuilder) => {
  const material = (builder as NodeBuilder & { material?: Material | null }).material;
  return vec4(velocity as unknown as Node<'vec2'>, float(0), float(writesMotion(material) ? 1 : 0));
})();

/** Whether a material's draws write motion vectors (see `sceneVelocity`). */
export function writesMotion(material: Material | null | undefined): boolean {
  return !material || !material.transparent || material.depthWrite || writers.has(material);
}

/** The velocity target's blending for `sceneVelocity` (source alpha over what's there). */
export const velocityBlend = new BlendMode(NormalBlending);

/**
 * Wraps a material's `positionNode` so its motion vectors follow the displacement it adds.
 *
 * three works out a vertex's last position from the plain geometry (and the instance and object
 * matrices), not from the `positionNode`. Wind sway, or grass set on the terrain in the shader, then
 * read as motion every frame even with the camera and the scene still: TRAA reprojected from the
 * wrong pixel or threw its history away, and its sub-pixel jitter showed (grass and palms shimmering
 * at Anchorage). This moves the last position by the same displacement, so a still scene has no
 * motion; the displacement's own change in one frame is small and TRAA's clipping handles it. Only
 * the scene pass's build with motion vectors changes (WebGPU, Medium and up).
 */
export function trackedPosition(position: Node<'vec3'>): Node<'vec3'> {
  return Fn((_: readonly unknown[], builder: NodeBuilder) => {
    const moved = position.toVar();
    if ((builder as NodeBuilder & { needsPreviousData(): boolean }).needsPreviousData()) {
      positionPrevious.addAssign(moved.sub(positionLocal));
    }
    return moved;
  })() as unknown as Node<'vec3'>;
}
