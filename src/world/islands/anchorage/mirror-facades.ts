import type { HeightField } from '../../contracts';
import { COVE } from '../../layout';
import { houseFaceSteps, readKitTexels, type FacadeFace } from '../../village/facade-colours';
import { buildHouse } from '../../village/house-builder';
import type { VillageKit } from '../../village/kit';
import { BUILDINGS } from './buildings';
import { houseSpecForBuilding, kitPaintColour } from './village';

/** How long (ms) it works between breaths. */
const SLICE_MS = 8;

/**
 * Anchorage's houses for the harbour mirror's stand-in (#31): each one's kit house (the same plan,
 * place and tints the village builds) as coloured faces, its walls' cells and roofs sampled from the
 * kit's textures (`houseFaces`), a few ms a breath.
 */
export async function anchorageMirrorFacades(
  kit: VillageKit,
  heightField: HeightField,
  breathe: () => Promise<void>,
): Promise<FacadeFace[]> {
  const texels = readKitTexels(kit);
  await breathe();
  let since = performance.now();
  const faces: FacadeFace[] = [];
  const cache = new Map<string, number[]>();
  for (const b of BUILDINGS) {
    const y = b.quay ? COVE.quay.height : heightField.heightAt(b.x, b.z);
    const placements = buildHouse(houseSpecForBuilding(b, y, false));
    const steps = houseFaceSteps(kit, texels, placements, { x: b.x, y, z: b.z }, kitPaintColour, cache);
    let r = steps.next();
    while (!r.done) {
      if (performance.now() - since > SLICE_MS) {
        await breathe();
        since = performance.now();
      }
      r = steps.next();
    }
    faces.push(...r.value);
  }
  return faces;
}
