import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  UnsignedByteType,
} from 'three/webgpu';

/**
 * A tileable detail texture for the ocean, generated at load (no download):
 *  R,G = ripple height slopes (∂h/∂u, ∂h/∂v) remapped to 0-1; B = ridged foam veins; A = ripple height.
 * Integer wave vectors guarantee seamless tiling; mipmaps average ripples away with distance.
 * Uses separable sin/cos tables so a 256² tile with ~100 waves builds in a few ms.
 */
export function createRippleTexture(size = 256, seed = 7): DataTexture {
  const N = size;
  let s = seed >>> 0;
  const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

  const h = new Float32Array(N * N);
  const du = new Float32Array(N * N);
  const dv = new Float32Array(N * N);
  const foam = new Float32Array(N * N);
  const su = new Float32Array(N),
    cu = new Float32Array(N),
    sv = new Float32Array(N),
    cv = new Float32Array(N);

  const addWaves = (count: number, kMin: number, kMax: number, slopeOut: boolean, target: Float32Array) => {
    for (let n = 0; n < count; n++) {
      let i = 0,
        j = 0;
      while (i === 0 && j === 0) {
        const ang = rand() * Math.PI * 2;
        const k = kMin + (kMax - kMin) * Math.pow(rand(), 1.4);
        i = Math.round(Math.cos(ang) * k);
        j = Math.round(Math.sin(ang) * k);
      }
      const kl = Math.hypot(i, j);
      const A = 1 / Math.pow(kl, 1.6);
      const ph = rand() * Math.PI * 2;
      for (let x = 0; x < N; x++) {
        const a = (2 * Math.PI * i * x) / N + ph;
        su[x] = Math.sin(a);
        cu[x] = Math.cos(a);
        const b = (2 * Math.PI * j * x) / N;
        sv[x] = Math.sin(b);
        cv[x] = Math.cos(b);
      }
      for (let y = 0; y < N; y++) {
        const row = y * N;
        for (let x = 0; x < N; x++) {
          // sin(a+b) and cos(a+b) from the separable tables.
          const sn = su[x] * cv[y] + cu[x] * sv[y];
          target[row + x] += A * sn;
          if (slopeOut) {
            const cs = cu[x] * cv[y] - su[x] * sv[y];
            du[row + x] += A * 2 * Math.PI * i * cs;
            dv[row + x] += A * 2 * Math.PI * j * cs;
          }
        }
      }
    }
  };
  addWaves(72, 2, 24, true, h);
  addWaves(40, 3, 30, false, foam);

  let maxS = 1e-6,
    maxH = 1e-6,
    maxF = 1e-6;
  for (let p = 0; p < N * N; p++) {
    maxS = Math.max(maxS, Math.abs(du[p]), Math.abs(dv[p]));
    maxH = Math.max(maxH, Math.abs(h[p]));
    maxF = Math.max(maxF, Math.abs(foam[p]));
  }
  const data = new Uint8Array(N * N * 4);
  for (let p = 0; p < N * N; p++) {
    data[p * 4] = Math.round((0.5 + (0.5 * du[p]) / maxS) * 255);
    data[p * 4 + 1] = Math.round((0.5 + (0.5 * dv[p]) / maxS) * 255);
    // Foam: soft blobs (smooth noise) laced with a few ridged streaks where the noise crosses zero.
    const n = foam[p] / maxF;
    const r = 1 - Math.min(1, Math.abs(n) * 2.4);
    const blob = Math.min(1, Math.max(0, 0.5 + 0.5 * (h[p] / maxH) * 1.6));
    data[p * 4 + 2] = Math.round(Math.min(1, 0.6 * blob * blob + 0.45 * r * r * r) * 255);
    data[p * 4 + 3] = Math.round((0.5 + (0.5 * h[p]) / maxH) * 255);
  }
  const tex = new DataTexture(data, N, N, RGBAFormat, UnsignedByteType);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = NoColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  /** Scale factor from the stored 0-1 slope back to slope-per-tile-unit. */
  tex.userData.slopeScale = maxS;
  return tex;
}
