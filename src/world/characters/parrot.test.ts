import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { addShoulderMacaw, createMacawGeometry } from './parrot';

const cellUv = (col: number, row: number) => [(col * 32 + 16) / 1024, (row * 32 + 16) / 1024];

describe('hero parrots', () => {
  it("repaints Ernest's swatches into a scarlet macaw standing on the origin", () => {
    // One triangle per part, centred at x (Ernest's tail→beak axis), with its source uv.
    const parts: [x: number, u: number, v: number][] = [
      [0.5, 0.512, 0.238], // crest (green)
      [0.2, 0.547, 0.236], // chest (grey, left spot)
      [0.6, 0.551, 0.234], // face (grey, right spot)
      [0.9, 0.644, 0.235], // beak (orange)
      [0.8, 0.61, 0.238], // wing near the head
      [-0.1, 0.61, 0.238], // wing middle
      [-0.9, 0.61, 0.238], // wing tip / tail
      [0.4, 0.702, 0.236], // eye mask (black)
    ];
    const position: number[] = [];
    const uv: number[] = [];
    for (const [x, u, v] of parts) {
      position.push(x - 0.1, 0.3, 0, x + 0.1, 0.3, 0, x, 0.5, 0);
      uv.push(u, v, u, v, u, v);
    }
    position.push(-1, 0.3, 0, -0.99, 0.3, 0, -1, 0.31, 0, 1, 0.3, 0, 0.99, 0.3, 0, 1, 0.31, 0);
    uv.push(...Array(12).fill(0.702));
    const { captain } = captainWithErnest(position, uv);

    const macaw = createMacawGeometry(captain)!;
    const out = macaw.getAttribute('uv');
    const at = (part: number) => [out.getX(part * 3), out.getY(part * 3)];
    const scarlet = cellUv(0, 20);
    expect(at(0)).toEqual(scarlet);
    expect(at(1)).toEqual(scarlet);
    expect(at(2)[0]).toBeCloseTo(0.551);
    expect(at(3)).toEqual(cellUv(3, 20));
    expect(at(4)).toEqual(scarlet);
    expect(at(5)).toEqual(cellUv(1, 20));
    expect(at(6)).toEqual(cellUv(2, 20));
    expect(at(7)[0]).toBeCloseTo(0.702);
    expect(macaw.getAttribute('skinIndex')).toBeUndefined();
    expect(macaw.boundingBox!.min.y).toBeCloseTo(0);
  });

  it("perches the macaw on Anne's torso, beside her right shoulder joint", () => {
    const root = new Group();
    const torso = new Bone();
    torso.name = 'Torso';
    torso.position.set(0, 0.6, 0);
    const upperArm = new Bone();
    upperArm.name = 'UpperArmR';
    upperArm.position.set(-0.3, 0.1, 0);
    torso.add(upperArm);
    const body = new SkinnedMesh(new BufferGeometry(), new MeshStandardMaterial());
    body.bind(new Skeleton([torso, upperArm]));
    root.add(torso, body);

    addShoulderMacaw(root, new BufferGeometry());

    const parrot = torso.getObjectByName('hero parrot')!;
    expect(parrot.parent).toBe(torso);
    const perch = parrot.getWorldPosition(new Vector3());
    expect(perch.x).toBeLessThan(-0.3);
    expect(perch.y).toBeGreaterThan(0.7);
  });
});

function captainWithErnest(position: number[], uv: number[]): { captain: Group } {
  const captain = new Group();
  const arm = new Bone();
  arm.name = 'LowerArmL';
  captain.add(arm);
  const geometry = new BufferGeometry();
  const count = position.length / 3;
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute(
    'normal',
    new Float32BufferAttribute(
      Array(count * 3)
        .fill(0)
        .map((_, i) => (i % 3 === 2 ? 1 : 0)),
      3,
    ),
  );
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(Array(count * 4).fill(0), 4));
  geometry.setAttribute(
    'skinWeight',
    new Float32BufferAttribute(
      Array(count * 4)
        .fill(0)
        .map((_, i) => (i % 4 ? 0 : 1)),
      4,
    ),
  );
  const ernest = new SkinnedMesh(geometry, new MeshStandardMaterial());
  ernest.name = 'Ernest';
  captain.add(ernest);
  captain.updateMatrixWorld(true);
  ernest.bind(new Skeleton([arm]));
  return { captain };
}
