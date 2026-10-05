import { BufferGeometry, Float32BufferAttribute, MeshStandardNodeMaterial, Vector4 } from 'three/webgpu';
import {
  abs,
  attribute,
  color,
  float,
  fwidth,
  length,
  max,
  min,
  mix,
  select,
  sign,
  smoothstep,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import type { FaceFit } from './face-fit';

// three's TSL fluent node typings do not cover this mixed scalar/vector graph.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/**
 * Per-face values the shader reads for the mesh being drawn (`uniform().onObjectUpdate`), so every
 * character shares one material and one pipeline (PLAN §15.4).
 */
export interface FaceParams {
  /** Gaze x, gaze y (metres on the sheet), upper-lid openness (1 rest, 0 shut), lower-lid lift. */
  readonly eye: Vector4;
  /** Iris colour (linear) and the brow tilt: + worried (inner lids up), − cross. */
  readonly iris: Vector4;
  /** Skin colour (linear) and how much upper teeth show. */
  readonly skin: Vector4;
  /** Mouth half-width, half-open, roundness, smile. */
  readonly mouth: Vector4;
  /** Sclera half-width, half-height, iris radius, tongue. */
  readonly shape: Vector4;
}

export function createFaceParams(): FaceParams {
  return {
    eye: new Vector4(0, 0, 1, 0),
    iris: new Vector4(0.1, 0.1, 0.1, 0),
    skin: new Vector4(0.6, 0.4, 0.3, 0),
    mouth: new Vector4(0.03, 0, 0, 0),
    shape: new Vector4(0.05, 0.05, 0.027, 0),
  };
}

type Key = keyof FaceParams;
function faceUniform(key: Key): AnyNode {
  return uniform(new Vector4()).onObjectUpdate(
    ({ object }) => (object?.userData.face as FaceParams | undefined)?.[key],
  );
}

let shared: MeshStandardNodeMaterial | null = null;

/** The one face material: eyes with lids, lashes, irises and catchlights, and a lip-synced mouth. */
export function faceMaterial(): MeshStandardNodeMaterial {
  if (shared) return shared;
  const m = new MeshStandardNodeMaterial({ roughness: 0.62, metalness: 0 });
  m.name = 'character-face';
  m.alphaTest = 0.5;

  // ±lash weight on the eyes (sign: +1 left, −1 right), 0 on the mouth.
  const sideRaw = attribute('faceSide', 'float') as AnyNode;
  const side = sign(sideRaw) as AnyNode;
  const lashWeight = abs(sideRaw) as AnyNode;
  const local = attribute('faceLocal', 'vec2') as AnyNode;
  const eyeU = faceUniform('eye');
  const irisU = faceUniform('iris');
  const skinU = faceUniform('skin');
  const mouthU = faceUniform('mouth');
  const shapeU = faceUniform('shape');
  const skin = skinU.xyz as AnyNode;
  const lash = color(0x24150f);
  const isEye = lashWeight.greaterThan(0.5) as AnyNode;

  // Eye, in metres with +x toward the outer corner on both sides.
  const px = local.x.mul(side) as AnyNode;
  const py = local.y as AnyNode;
  const rx = shapeU.x as AnyNode;
  const ry = shapeU.y as AnyNode;
  const irisR = shapeU.z as AnyNode;
  const nx = px.div(rx);
  const e = length(vec2(nx, py.div(ry))) as AnyNode;
  const eAa = max(fwidth(e), float(0.0008)) as AnyNode;

  // The upper lid: arched, a touch lower at the corners, tilted by the brow, shut by the blink.
  const open = eyeU.z as AnyNode;
  const tilt = irisU.w as AnyNode;
  const lidY = mix(ry.mul(-0.8), ry.mul(0.68), open)
    .sub(ry.mul(0.16).mul(nx.mul(nx)))
    .sub(tilt.mul(ry).mul(0.3).mul(nx)) as AnyNode;
  const lowY = ry
    .mul(-0.9)
    .add(ry.mul(eyeU.w).mul(0.55))
    .add(ry.mul(0.18).mul(nx.mul(nx))) as AnyNode;
  const lashT = ry
    .mul(0.11)
    .mul(lashWeight)
    .mul(float(1).add(smoothstep(0.2, 1.0, nx).mul(lashWeight.mul(0.9)))) as AnyNode;
  const pyAa = max(fwidth(py), float(0.0002)) as AnyNode;
  const aboveLid = smoothstep(lidY.sub(pyAa), lidY.add(pyAa), py) as AnyNode;
  const aboveLash = smoothstep(lidY.sub(lashT).sub(pyAa), lidY.sub(lashT).add(pyAa), py) as AnyNode;
  const belowLow = float(1).sub(smoothstep(lowY.sub(pyAa), lowY.add(pyAa), py)) as AnyNode;
  const belowLowLine = float(1).sub(
    smoothstep(lowY.add(ry.mul(0.05)).sub(pyAa), lowY.add(ry.mul(0.05)).add(pyAa), py),
  ) as AnyNode;

  // Eyeball: warm white, shaded under the lid; the iris lighter at the bottom, a dark limbal ring.
  const gx = eyeU.x.mul(side) as AnyNode;
  const gy = eyeU.y as AnyNode;
  const ix = px.sub(gx);
  const iy = py.sub(gy);
  const di = length(vec2(ix, iy)).div(irisR) as AnyNode;
  const diAa = max(fwidth(di), float(0.01)) as AnyNode;
  const lidShade = smoothstep(float(0), ry.mul(0.55), lidY.sub(py)) as AnyNode;
  const sclera = mix(color(0xaea397), color(0xebe4d8), lidShade.mul(0.75).add(0.25));
  const irisCol = irisU.xyz as AnyNode;
  const irisLit = mix(irisCol.mul(0.55), irisCol.mul(1.35), smoothstep(-0.9, 0.7, iy.div(irisR).negate()));
  const irisFull = mix(irisLit, irisCol.mul(0.28), smoothstep(0.72, 1.0, di)).mul(
    lidShade.mul(0.45).add(0.55),
  );
  const pupil = float(1).sub(smoothstep(float(0.42).sub(diAa), float(0.42).add(diAa), di));
  const irisMask = float(1).sub(smoothstep(float(1).sub(diAa), float(1).add(diAa), di));
  let ball = mix(sclera, irisFull, irisMask) as AnyNode;
  ball = mix(ball, color(0x090605), pupil.mul(irisMask));
  // The catchlight sits up and toward the character's right in both eyes (one key light).
  const cx = local.x.sub(eyeU.x).add(irisR.mul(0.34));
  const cy = py.sub(gy).sub(irisR.mul(0.36));
  const dc = length(vec2(cx, cy)).div(irisR.mul(0.24)) as AnyNode;
  const catchMask = float(1)
    .sub(smoothstep(float(1).sub(max(fwidth(dc), float(0.02))), float(1).add(max(fwidth(dc), 0.02)), dc))
    .mul(float(1).sub(aboveLash)) as AnyNode;
  ball = mix(ball, color(0xffffff), catchMask);

  // Only the opening between the lids, the lash line and the lower crease are drawn. The lids are
  // the kit's own eyeballs, painted in skin (npc-palettes), so they take the light like the face.
  const inBall = float(1).sub(smoothstep(float(1).sub(eAa), float(1).add(eAa), e)) as AnyNode;
  const flick = float(1).add(smoothstep(0.55, 1.0, nx).mul(lashWeight).mul(0.07)) as AnyNode;
  const inFlick = float(1).sub(smoothstep(flick.sub(eAa), flick.add(eAa), e)) as AnyNode;
  const opening = inBall.mul(float(1).sub(aboveLid)).mul(float(1).sub(belowLow)) as AnyNode;
  const lashTop = lidY.add(lashT.mul(0.35)) as AnyNode;
  const lashBand = aboveLash
    .mul(float(1).sub(smoothstep(lashTop.sub(pyAa), lashTop.add(pyAa), py)))
    .mul(inFlick) as AnyNode;
  const creaseBand = belowLowLine
    .mul(smoothstep(lowY.sub(ry.mul(0.06)).sub(pyAa), lowY.sub(ry.mul(0.06)).add(pyAa), py))
    .mul(inBall) as AnyNode;
  let eyeCol = mix(skin.mul(0.6), ball, opening) as AnyNode;
  eyeCol = mix(eyeCol, lash, lashBand);
  const eyeAlpha = max(max(opening, lashBand), creaseBand) as AnyNode;
  const eyeRough = mix(float(0.7), float(0.18), opening);

  // Mouth, in metres: an ellipse bent by the smile; teeth on top, tongue below, lips round it.
  const hw = mouthU.x as AnyNode;
  const hhRaw = mouthU.y as AnyNode;
  const mx = local.x as AnyNode;
  // The upper lip stays with the skull; the opening grows downward with the jaw.
  const my = local.y.add(hhRaw.mul(0.45)) as AnyNode;
  const round = mouthU.z as AnyNode;
  const smile = mouthU.w as AnyNode;
  const line = float(0.0032);
  const hh = max(hhRaw, line) as AnyNode;
  const w = mix(hw, max(hh.mul(1.1), hw.mul(0.55)), round) as AnyNode;
  const u = mx.div(w) as AnyNode;
  const qy = my.sub(smile.mul(hw).mul(0.32).mul(u.mul(u))).add(smile.mul(hw).mul(0.08)) as AnyNode;
  const em = length(vec2(u, qy.div(hh))) as AnyNode;
  const emAa = max(fwidth(em), float(0.01)) as AnyNode;
  const lipRing = float(1).add(min(float(0.35), float(0.0042).div(hh))) as AnyNode;
  const mouthAlpha = float(1).sub(smoothstep(lipRing.sub(emAa), lipRing.add(emAa), em));
  const inMouth = float(1).sub(smoothstep(float(1).sub(emAa), float(1).add(emAa), em)) as AnyNode;
  const openness = smoothstep(line, line.mul(3.5), hhRaw) as AnyNode;
  const cavity = mix(
    color(0x4a221b),
    mix(color(0x3a120f), color(0x5c1f1a), qy.div(hh).negate().max(0)),
    openness,
  );
  const teeth = skinU.w as AnyNode;
  const tongue = shapeU.w as AnyNode;
  const teethMask = smoothstep(
    float(1).sub(teeth.mul(0.42)).sub(0.04),
    float(1).sub(teeth.mul(0.42)),
    qy.div(hh),
  )
    .mul(openness)
    .mul(smoothstep(0, 0.05, teeth)) as AnyNode;
  const tongueMask = float(1)
    .sub(smoothstep(float(-1).add(tongue.mul(0.62)), float(-1).add(tongue.mul(0.62)).add(0.06), qy.div(hh)))
    .mul(float(1).sub(smoothstep(0.55, 0.8, abs(u))))
    .mul(openness) as AnyNode;
  let mouthIn = mix(cavity, color(0xf2eadb), teethMask) as AnyNode;
  mouthIn = mix(mouthIn, color(0xb5524b), tongueMask);
  const lip = skin.mul(vec3(0.8, 0.68, 0.64));
  const mouthCol = mix(lip, mouthIn, inMouth);

  m.colorNode = select(isEye, eyeCol, mouthCol) as AnyNode;
  m.opacityNode = select(isEye, eyeAlpha, mouthAlpha) as AnyNode;
  m.roughnessNode = select(isEye, eyeRough, mix(float(0.55), float(0.4), inMouth)) as AnyNode;
  m.emissiveNode = select(
    isEye,
    color(0xffffff)
      .mul(catchMask.mul(0.9))
      .add(sclera.mul(inBall.mul(0.02))),
    vec3(0, 0, 0),
  ) as AnyNode;
  shared = m;
  return m;
}

const geometries = new Map<FaceFit, BufferGeometry>();
/** How fast each eye sheet curves back above and below its centre (1/m). */
const EYE_KY = 1.6;

/**
 * Three curved sheets in one geometry (one draw per face): two eyes and a mouth. Each carries its own
 * local metres (`faceLocal`) and side (`faceSide`: + left eye, − right eye, 0 mouth; its size is
 * the lash weight).
 */
export function faceGeometry(fit: FaceFit): BufferGeometry {
  const cached = geometries.get(fit);
  if (cached) return cached;
  const pos: number[] = [];
  const nor: number[] = [];
  const loc: number[] = [];
  const sides: number[] = [];
  const idx: number[] = [];
  const sheet = (
    cx: number,
    cy: number,
    hx: number,
    hy: number,
    z0: number,
    k: number,
    ky: number,
    pitch: number,
    side: number,
  ): void => {
    const cols = 6;
    const rows = ky > 0 ? 4 : 1;
    const base = pos.length / 3;
    for (let r = 0; r <= rows; r++) {
      const ly = -hy + (2 * hy * r) / rows;
      for (let c = 0; c <= cols; c++) {
        const lx = -hx + (2 * hx * c) / cols;
        const x = cx + lx;
        // Curved across (the head) and, for the eyes, up and down (lid and cheek), so the lid skin
        // takes the light like the face round it.
        const z = z0 - k * x * x - ky * ly * ly - Math.sin(pitch) * ly;
        const y = cy + ly * Math.cos(pitch);
        pos.push(x, y, z);
        const sx = 2 * k * x;
        const sy = 2 * ky * ly + Math.sin(pitch);
        const n = Math.hypot(sx, sy, 1);
        nor.push(sx / n, sy / n, 1 / n);
        loc.push(lx, ly);
        sides.push(side);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = base + r * (cols + 1) + c;
        const b = a + 1;
        const d = a + cols + 1;
        const e = d + 1;
        idx.push(a, b, e, a, e, d);
      }
    }
  };
  const ex = fit.eyeRx * 1.13 + 0.004;
  const ey = fit.eyeRy * 1.13 + 0.004;
  const gap = 0.004;
  sheet(fit.eyeX, fit.eyeY, ex, ey, fit.eyeZ0 + gap, fit.eyeK, EYE_KY, 0, fit.lash);
  sheet(-fit.eyeX, fit.eyeY, ex, ey, fit.eyeZ0 + gap, fit.eyeK, EYE_KY, 0, -fit.lash);
  sheet(
    0,
    fit.mouthY,
    fit.mouthW * 1.9,
    fit.mouthW * 1.25,
    fit.mouthZ0 + gap,
    fit.mouthK,
    0,
    fit.mouthPitch,
    0,
  );
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('faceLocal', new Float32BufferAttribute(loc, 2));
  g.setAttribute('faceSide', new Float32BufferAttribute(sides, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  geometries.set(fit, g);
  return g;
}
