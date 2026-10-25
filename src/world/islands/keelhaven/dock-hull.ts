import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  type BufferGeometry,
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Tier } from '../../contracts';
import { createDeckGeometry, createHullGeometry, createTrimGeometry } from '../../ship/brigantine-hull';
import { makeShipMaterial, type ShipLabel } from '../../ship/brigantine-materials';

/**
 * The hull on the keel blocks in Dock 2: the brigantine's own hull, deck and trim (no rig, no name
 * board: she's being fitted out), drawn with the ship's material (the ship's livery, no new shader),
 * one mesh. Lite and Low draw the hull's coarser levels.
 */
export interface DockHull {
  mesh: Mesh;
  dispose(): void;
}

/** No name board on her: a small plain label (filtered like the ship's, so the same shader). */
function plainLabel(): ShipLabel {
  const data = new Uint8Array(4 * 4 * 4).fill(180);
  const texture = new DataTexture(data, 4, 4, RGBAFormat, UnsignedByteType);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return { texture, canvas: null, name: '', release: () => {} };
}

export function createDockHull(
  tier: Tier,
  at: { x: number; y: number; z: number; heading: number },
): DockHull {
  const detail: Tier = tier === 'lite' ? 'lite' : tier === 'low' ? 'low' : 'medium';
  const pieces: BufferGeometry[] = [
    createHullGeometry(detail),
    createDeckGeometry(detail === 'lite' ? 'lite' : 'low'),
  ];
  if (detail !== 'lite') pieces.push(createTrimGeometry(detail === 'low' ? 'lite' : 'low'));
  const geometry = mergeGeometries(pieces, false);
  for (const p of pieces) p.dispose();
  if (!geometry) throw new Error('keelhaven: the dock hull did not merge');
  geometry.computeBoundingSphere();
  const label = plainLabel();
  const material = makeShipMaterial(label, uniform(0), uniform(0), uniform(0));
  const mesh = new Mesh(geometry, material);
  mesh.name = 'keelhaven-dock-hull';
  mesh.position.set(at.x, at.y, at.z);
  mesh.rotation.y = at.heading;
  mesh.updateMatrix();
  mesh.updateMatrixWorld(true);
  mesh.matrixAutoUpdate = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
      label.texture.dispose();
    },
  };
}
