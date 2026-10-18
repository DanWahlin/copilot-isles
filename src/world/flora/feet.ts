import type { Object3D } from 'three/webgpu';

/**
 * Characters whose feet part the grass and flowers: add a character's root while it's in the scene,
 * remove it when it's disposed (`RuntimeCharacter` does both). The grass's pushers follow the ones
 * nearest the camera (`updateFloraPushers`).
 */
export const floraFeet = new Set<Object3D>();
