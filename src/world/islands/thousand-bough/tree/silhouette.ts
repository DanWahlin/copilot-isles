import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
} from 'three/webgpu';
import { thousandBoughHeightDry } from '../height';
import { THOUSAND_BOUGH as TB } from '../layout';

/** Grid spacing (m) of the far shape. */
const CELL = 14;

/**
 * The great banyan's far shape (LOD2, and the whole island before it streams in): an asymmetric dome,
 * tallest to the north-east (the high crown), over the knoll. Height above the ground at (x, z), or
 * 0 off it. Shared with the tree's own levels of detail so every level stands in the same place.
 */
export function banyanDome(x: number, z: number): number {
  const c = TB.tree.canopy;
  const dx = x - TB.tree.x;
  const dz = z - TB.tree.z;
  const r = Math.hypot(dx, dz);
  const ring = Math.max(0, 1 - (r / (c.ring.rMax + 4)) ** 2);
  const ringTop = (c.ring.top - 4) * Math.sqrt(ring);
  // The high crown's two masses to the north-east.
  const cx = TB.tree.x + 22;
  const cz = TB.tree.z - 18;
  const k = Math.max(0, 1 - ((x - cx) ** 2 + (z - cz) ** 2) / (34 * 34));
  const crown = TB.tree.crownTop * Math.sqrt(k);
  return Math.max(ringTop, crown);
}

/**
 * Thousand-Bough as a far silhouette (before it streams in, and while the camera's far from it): the
 * island's own dry ground on a coarse grid, and the banyan's dome standing in the ridge's saddle, so
 * the tree is on the horizon from Port Meridian's citadel. Meridian's far material (same graph, so no
 * new program).
 */
export function createThousandBoughSilhouette(): Group {
  const group = new Group();
  group.name = 'thousand-bough-silhouette';
  const b = TB.bounds;
  const x0 = b.minX + 40;
  const z0 = b.minZ + 40;
  const nx = Math.floor((b.maxX - 40 - x0) / CELL);
  const nz = Math.floor((b.maxZ - 40 - z0) / CELL);
  const positions = new Float32Array((nx + 1) * (nz + 1) * 3);
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = x0 + i * CELL;
      const z = z0 + j * CELL;
      const ground = thousandBoughHeightDry(x, z);
      const tree = banyanDome(x, z);
      const y = Math.max(ground, tree > 0 ? TB.tree.deckY + tree * 0.98 : -Infinity);
      const o = (j * (nx + 1) + i) * 3;
      positions[o] = x;
      positions[o + 1] = Math.max(-6, y);
      positions[o + 2] = z;
    }
  const indices: number[] = [];
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const c = a + nx + 1;
      // Leave out cells wholly under the sea (the ocean covers them).
      if (Math.max(positions[a * 3 + 1]!, positions[(a + 1) * 3 + 1]!, positions[c * 3 + 1]!) <= -5.9)
        continue;
      indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  // Jungle green under the haze (the fog lightens it with distance): a far island, not a paper cut-out.
  const material = new MeshBasicNodeMaterial({ color: 0x3f5a4c, depthWrite: true, side: DoubleSide });
  material.fog = true;
  const mesh = new Mesh(geometry, material);
  mesh.name = 'thousand-bough-silhouette-mesh';
  group.add(mesh);
  return group;
}
