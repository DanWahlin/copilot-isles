import type { Object3D } from 'three/webgpu';

/**
 * Roots the harbour mirror leaves out (characters: their reflections are small and broken up by the
 * water, and each would need its own mirror pipelines; issue 236). Add a root while it's in the scene
 * and remove it when it's disposed.
 */
export const unreflected = new Set<Object3D>();
