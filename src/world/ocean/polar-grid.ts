import {
  BufferAttribute,
  BufferGeometry,
  Frustum,
  Matrix4,
  Sphere,
  Vector3,
  type Camera,
  type Mesh,
} from 'three/webgpu';

export interface PolarGridOptions {
  /** Radial spacing of the first ring (m). */
  dr0: number;
  /** Geometric growth of the radial spacing per ring. */
  growth: number;
  /** Outer radius (m). */
  radius: number;
  /** Angular segments. */
  segments: number;
}

/**
 * Camera-centred polar grid for the ocean (PLAN §6): dense under the camera, geometrically coarser
 * outward, reaching the horizon in one draw. `aSpan` carries each vertex's local spacing so the
 * shader can filter detail it can't resolve.
 */
export function createPolarGrid(o: PolarGridOptions): BufferGeometry {
  const radii: number[] = [0];
  let dr = o.dr0;
  while (radii[radii.length - 1] < o.radius) {
    radii.push(Math.min(o.radius, radii[radii.length - 1] + dr));
    dr *= o.growth;
  }
  const rings = radii.length;
  const S = o.segments;
  // Ring 0 is a single centre vertex.
  const vCount = 1 + (rings - 1) * S;
  const pos = new Float32Array(vCount * 3);
  const span = new Float32Array(vCount);
  span[0] = o.dr0;
  let v = 1;
  for (let r = 1; r < rings; r++) {
    const R = radii[r];
    const sp = Math.max(radii[r] - radii[r - 1], (2 * Math.PI * R) / S);
    for (let a = 0; a < S; a++) {
      const t = (a / S) * Math.PI * 2;
      pos[v * 3] = Math.cos(t) * R;
      pos[v * 3 + 1] = 0;
      pos[v * 3 + 2] = Math.sin(t) * R;
      span[v] = sp;
      v++;
    }
  }
  // The disc round the camera (to INNER_RADIUS) ring by ring as before, then the rest sector by
  // sector (each wedge's rings outward), twice over, so any run of neighbouring wedges (wrapping past
  // the last) is one draw range (`cullPolarSectors`). The order within a view ray is kept: the sea
  // is drawn without depth writes, so where a crest hides the water behind it the outer ring must
  // still draw last, as it did ring by ring (a camera-centred grid's view rays run along its sectors).
  let inner = 1;
  while (inner < rings - 1 && radii[inner + 1]! <= INNER_RADIUS) inner++;
  const innerTris = S + (inner - 1) * S * 2;
  const perSector = (rings - 1 - inner) * 2;
  const outerTris = S * perSector;
  const tris = innerTris + outerTris;
  const idx =
    vCount > 65535 ? new Uint32Array((tris + outerTris) * 3) : new Uint16Array((tris + outerTris) * 3);
  let i = 0;
  const quad = (r: number, a: number) => {
    const a1 = (a + 1) % S;
    const b0 = 1 + (r - 1) * S,
      b1 = 1 + r * S;
    idx[i++] = b0 + a;
    idx[i++] = b0 + a1;
    idx[i++] = b1 + a;
    idx[i++] = b0 + a1;
    idx[i++] = b1 + a1;
    idx[i++] = b1 + a;
  };
  // Centre fan (wound so the surface faces +y).
  for (let a = 0; a < S; a++) {
    idx[i++] = 0;
    idx[i++] = 1 + ((a + 1) % S);
    idx[i++] = 1 + a;
  }
  for (let r = 1; r < inner; r++) for (let a = 0; a < S; a++) quad(r, a);
  for (let a = 0; a < S; a++) for (let r = inner; r < rings - 1; r++) quad(r, a);
  idx.copyWithin(tris * 3, innerTris * 3, tris * 3);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aSpan', new BufferAttribute(span, 1));
  g.setIndex(new BufferAttribute(idx, 1));
  g.setDrawRange(0, tris * 3);
  g.boundingSphere = new Sphere(new Vector3(), o.radius);
  const sectors: PolarSectors = {
    segments: S,
    innerIndices: innerTris * 3,
    indicesPerSector: perSector * 3,
    innerRadius: radii[inner]!,
    radius: radii[rings - 1]!,
  };
  g.userData.polarSectors = sectors;
  return g;
}

/** The disc round the camera that's always drawn whole (m): what the waves move can't reach past it. */
const INNER_RADIUS = 20;

/** How a polar grid's index is laid out (`createPolarGrid`), for `cullPolarSectors`. */
export interface PolarSectors {
  segments: number;
  /** The disc round the centre, first in the index (whole rings). */
  innerIndices: number;
  /** Each sector of the rest, sector by sector after the disc, then the same again. */
  indicesPerSector: number;
  innerRadius: number;
  /** The outer ring's radius (m). */
  radius: number;
}

/** Sector groups tested against the frustum (each a wedge of `segments / SECTOR_GROUPS` sectors, rounded up). */
const SECTOR_GROUPS = 32;

const frustum = new Frustum();
const viewProj = new Matrix4();
const visibleGroups = new Uint8Array(SECTOR_GROUPS);

/**
 * Draws a camera-centred polar grid (`mesh`) as two draws of its one geometry: the disc round the
 * camera whole (`near`, a child drawn first), and of the rest only the wedges the drawing camera can
 * see. Before each draw (any camera: the view, the harbour mirror) the range is set to the shortest
 * run of wedges holding every one that may be in the camera's frustum, and put back to the whole grid
 * after it. A wedge is left out only when it lies wholly outside one of the frustum's side planes,
 * grown by `margin()` metres across and `lift()` up and down for what the vertex shader moves (the
 * waves), so no triangle the camera could see is dropped. About half the sea is behind or beside you.
 * The disc stays whole because every wedge meets at the camera: grown by the waves' reach, each would
 * reach into the view there.
 */
export function cullPolarSectors(mesh: Mesh, near: Mesh, margin: () => number, lift: () => number): void {
  const sectors = mesh.geometry.userData.polarSectors as PolarSectors | undefined;
  if (!sectors || near.geometry !== mesh.geometry) return;
  const S = sectors.segments;
  const per = sectors.indicesPerSector;
  const disc = sectors.innerIndices;
  const size = Math.ceil(S / SECTOR_GROUPS);
  const groups = Math.ceil(S / size);
  // Each group's annular wedge: its inner corners, and its outer ones pushed out so the chord holds the arc.
  const corners = new Float64Array(groups * 8);
  for (let g = 0; g < groups; g++) {
    const t0 = ((g * size) / S) * Math.PI * 2;
    const t1 = (Math.min(S, (g + 1) * size) / S) * Math.PI * 2;
    const r0 = sectors.innerRadius;
    const r1 = sectors.radius / Math.cos((t1 - t0) / 2);
    corners.set(
      [
        Math.cos(t0) * r0,
        Math.sin(t0) * r0,
        Math.cos(t1) * r0,
        Math.sin(t1) * r0,
        Math.cos(t0) * r1,
        Math.sin(t0) * r1,
        Math.cos(t1) * r1,
        Math.sin(t1) * r1,
      ],
      g * 8,
    );
  }
  const full = disc + S * per;
  const whole: Mesh['onAfterRender'] = (_renderer, _scene, _camera, geometry) => {
    geometry.drawRange.start = 0;
    geometry.drawRange.count = full;
  };
  near.onBeforeRender = (_renderer, _scene, _camera, geometry) => {
    geometry.drawRange.start = 0;
    geometry.drawRange.count = disc;
  };
  near.onAfterRender = whole;
  mesh.onAfterRender = whole;
  mesh.onBeforeRender = (_renderer, _scene, camera, geometry) => {
    const cam = camera as Camera & { coordinateSystem?: number; reversedDepth?: boolean };
    viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProj, cam.coordinateSystem, cam.reversedDepth);
    const e = mesh.matrixWorld.elements;
    const ox = e[12]!;
    const oy = e[13]!;
    const oz = e[14]!;
    const m = margin();
    const h = lift();
    let shown = 0;
    for (let g = 0; g < groups; g++) {
      let seen = true;
      // The side planes only (left, right, bottom, top): they meet at the eye, so they hold the view
      // whatever the depth convention. Hidden when all four corners, grown, are outside one.
      for (let k = 0; k < 4 && seen; k++) {
        const { normal: n, constant } = frustum.planes[k]!;
        const grow = (Math.abs(n.x) + Math.abs(n.z)) * m + Math.abs(n.y) * h + n.y * oy + constant;
        let out = true;
        for (let c = 0; c < 4 && out; c++)
          out = n.x * (ox + corners[g * 8 + c * 2]!) + n.z * (oz + corners[g * 8 + c * 2 + 1]!) + grow < 0;
        seen = !out;
      }
      visibleGroups[g] = seen ? 1 : 0;
      shown += visibleGroups[g]!;
    }
    geometry.drawRange.start = disc;
    geometry.drawRange.count = S * per;
    if (shown === groups) return;
    if (shown === 0) {
      geometry.drawRange.count = 0;
      return;
    }
    // The longest run of hidden groups (round the circle); draw the rest, starting after it.
    let best = 0;
    let bestEnd = 0;
    let run = 0;
    for (let i = 0; i < groups * 2; i++) {
      run = visibleGroups[i % groups] ? 0 : run + 1;
      if (run > best) {
        best = run;
        bestEnd = i;
      }
    }
    const start = (bestEnd + 1) % groups;
    let count = 0;
    for (let j = 0; j < groups - best; j++) {
      const g = (start + j) % groups;
      count += Math.min(S, (g + 1) * size) - g * size;
    }
    geometry.drawRange.start = disc + start * size * per;
    geometry.drawRange.count = count * per;
  };
}
