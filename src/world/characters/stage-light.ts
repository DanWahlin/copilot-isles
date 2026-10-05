import { Color, Material, MeshStandardMaterial, MeshStandardNodeMaterial, Vector3 } from 'three/webgpu';
import {
  cameraViewMatrix,
  diffuseColor,
  dot,
  float,
  materialEmissive,
  max,
  normalView,
  positionViewDirection,
  pow,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { world } from '../uniforms';

// three's TSL fluent node typings do not cover this mixed scalar/vector graph.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/**
 * Per-character staging light (issue #188): `key` is a soft fill from the camera's upper left, and
 * `rim` an edge light in the sun's colour that grows when the sun is behind the character. Set on a
 * character's meshes (`userData.stage`) and read per object, so every character shares one program.
 */
export interface StageLight {
  key: number;
  rim: number;
}

/** Resting values: a hint of rim so silhouettes separate from the background. */
export const STAGE_REST: Readonly<StageLight> = { key: 0, rim: 0.12 };

const KEY_VIEW = new Vector3(-0.45, 0.5, 0.75).normalize();

let emissive: AnyNode = null;

function stageEmissive(): AnyNode {
  if (emissive) return emissive;
  const params = uniform(new Vector3(STAGE_REST.key, STAGE_REST.rim, 0)).onObjectUpdate(({ object }) => {
    const s = object?.userData.stage as StageLight | undefined;
    return s ? TMP.set(s.key, s.rim, 0) : TMP.set(STAGE_REST.key, STAGE_REST.rim, 0);
  });
  const n = normalView as AnyNode;
  const v = positionViewDirection as AnyNode;
  const facing = max(dot(n, v), 0) as AnyNode;
  const fresnel = pow(float(1).sub(facing), 4) as AnyNode;
  // How far the sun is behind the character, seen from the camera (view space).
  const sunView = cameraViewMatrix.mul(vec4(world.keyDir, 0)).xyz.normalize() as AnyNode;
  const back = max(dot(sunView, v.negate()), 0) as AnyNode;
  // Tinted by the surface's own colour (lifted toward white a little), so a dark hat gets a cool
  // sheen on its edge rather than a frost.
  const tint = (diffuseColor as AnyNode).rgb.mul(0.65).add(0.35) as AnyNode;
  const rim = (world.sunColor as AnyNode)
    .mul(tint)
    .mul(fresnel)
    .mul(back.mul(0.75).add(0.25))
    .mul(params.y)
    .mul(float(1).sub((world.night as AnyNode).mul(0.7)));
  const key = (diffuseColor as AnyNode).rgb
    .mul(max(dot(n, vec3(KEY_VIEW.x, KEY_VIEW.y, KEY_VIEW.z)), 0))
    .mul(params.x);
  // The material's own emissive (the warm lift every character has) stays underneath.
  emissive = (materialEmissive as AnyNode).add(rim).add(key);
  return emissive;
}

const TMP = new Vector3();
const nodeCache = new WeakMap<Material, MeshStandardNodeMaterial>();

/**
 * The node twin of a character's standard material, with the staging light in its emissive. Shared
 * per source material (accessory colours are shared), so programs don't multiply.
 */
export function stagedMaterial(source: Material): Material {
  if (!(source instanceof MeshStandardMaterial)) return source;
  const cached = nodeCache.get(source);
  if (cached) return cached;
  const m = new MeshStandardNodeMaterial();
  m.copy(source as unknown as MeshStandardNodeMaterial);
  m.userData = { ...source.userData };
  m.emissive = (source.emissive ?? new Color(0)).clone();
  m.emissiveNode = stageEmissive();
  nodeCache.set(source, m);
  return m;
}
