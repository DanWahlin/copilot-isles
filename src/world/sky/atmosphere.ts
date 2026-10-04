// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/sky/Atmosphere.js@fd6cae6
import {
  AdditiveBlending,
  BackSide,
  Mesh,
  MeshBasicNodeMaterial,
  NormalBlending,
  SphereGeometry,
  Color,
} from 'three/webgpu';
import {
  Fn,
  clamp,
  dot,
  exp,
  float,
  max,
  mix,
  normalize,
  positionLocal,
  pow,
  sin,
  smoothstep,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { world } from '../uniforms';

export interface AtmosphereSky {
  mesh: Mesh<SphereGeometry, MeshBasicNodeMaterial>;
  material: MeshBasicNodeMaterial;
  haze: {
    rayleigh: { value: Color };
    mie: { value: Color };
    groundBounce: { value: Color };
  };
  dispose(): void;
}

export interface AtmosphereSkyOptions {
  radius: number;
  sunDisc?: boolean;
  clouds?: boolean;
}

/**
 * Hillaire-style atmospheric sky folded into one TSL dome shader for Phase 0.
 * Tidewater's full path builds transmittance / multi-scatter / sky-view LUTs; this keeps the
 * same contract and constants in an analytic fragment path so WebGPU and the WebGL2 backend match.
 */
export function createAtmosphereSky(options: AtmosphereSkyOptions): AtmosphereSky {
  const rayleighU = uniform(new Color(0.1, 0.34, 0.96));
  const mieU = uniform(new Color(1.0, 0.68, 0.42));
  const bounceU = uniform(new Color(0.18, 0.14, 0.1));
  const mat = new MeshBasicNodeMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
  });

  mat.colorNode = Fn(() => {
    const dir = normalize(positionLocal);
    const sun = normalize(world.sunDir);
    const mu = dot(dir, sun);
    const sunUp = smoothstep(-0.08, 0.08, sun.y);
    const up = clamp(dir.y.mul(0.5).add(0.5), 0, 1);
    const viewUp = max(dir.y, -0.08).add(0.11);
    const opticalDepth = float(1).div(max(viewUp, 0.035));

    const rayleighPhase = mu.mul(mu).add(1).mul(0.75);
    const mieForward = pow(max(mu, 0), 70)
      .mul(1.2)
      .add(pow(max(mu, 0), 12).mul(0.12));
    const horizon = exp(dir.y.abs().mul(-7));
    const transmittance = exp(vec3(-0.07, -0.03, -0.012).mul(opticalDepth).mul(sunUp.mul(0.3).add(0.1)));
    const skyGradient = mix(vec3(0.74, 0.92, 1.1), rayleighU.mul(1.45), pow(up, 0.56))
      .mul(transmittance.mul(0.22).add(0.78))
      .mul(sunUp.mul(0.75).add(0.24));
    const zenith = skyGradient.mul(rayleighPhase.mul(0.12).add(0.88));
    const lowSun = mieU.mul(mieForward.mul(0.3).add(horizon.mul(0.14))).mul(sunUp);
    const ground = bounceU.mul(float(1).sub(up).mul(0.5));
    let col = zenith.mul(up.mul(0.72).add(0.18)).add(lowSun).add(ground);

    if (options.clouds !== false) {
      const t = world.time.mul(float(1).sub(world.reducedMotion).mul(0.018));
      const uv = dir.xz
        .div(max(dir.y, 0.18))
        .mul(0.72)
        .add(vec2(t, t.mul(0.23)));
      const large = sin(uv.x.mul(0.9).add(uv.y.mul(0.33)))
        .mul(0.5)
        .add(0.5)
        .mul(0.28)
        .add(0.58);
      const puff = sin(uv.x.mul(2.2).sub(uv.y.mul(1.1)).add(t.mul(0.7)))
        .mul(0.5)
        .add(0.5)
        .mul(0.34)
        .add(
          sin(uv.x.mul(4.9).add(uv.y.mul(2.7)).sub(t.mul(0.35)))
            .mul(0.5)
            .add(0.5)
            .mul(0.18),
        )
        .add(0.5);
      const detail = sin(uv.x.mul(11.0).sub(uv.y.mul(6.0)).add(t.mul(1.1)))
        .mul(0.5)
        .add(0.5)
        .mul(0.08);
      const density = puff.add(detail).mul(large);
      const band = smoothstep(0.03, 0.14, dir.y).mul(smoothstep(0.9, 0.42, dir.y));
      const cloud = smoothstep(0.44, 0.7, density).mul(band);
      const selfShadow = smoothstep(0.42, 0.82, density);
      const lit = pow(max(mu, 0), 5).mul(0.5).add(0.82);
      const top = mix(vec3(0.9, 0.94, 1.0), vec3(1.0, 0.86, 0.66), smoothstep(-0.02, 0.18, sun.y)).mul(lit);
      const base = mix(vec3(0.55, 0.62, 0.72), vec3(0.7, 0.6, 0.52), smoothstep(-0.02, 0.18, sun.y));
      const silver = pow(max(mu, 0), 12).mul(cloud.mul(float(1).sub(cloud)).mul(3.2));
      const cloudCol = mix(base, top, selfShadow).add(vec3(1.0, 0.82, 0.56).mul(silver));
      col = mix(col, cloudCol, cloud.mul(0.72));
    }

    if (options.sunDisc !== false) {
      const disc = smoothstep(0.99972, 0.9999, mu).mul(sunUp);
      const aureole = pow(max(mu, 0), 260).mul(0.14).mul(sunUp);
      col = col.add(vec3(1.0, 0.74, 0.42).mul(aureole)).add(vec3(8.0, 5.5, 2.5).mul(disc));
    }

    return mix(col, vec3(0.01, 0.018, 0.04), world.night.mul(0.88));
  })();

  const mesh = new Mesh(new SphereGeometry(options.radius, 64, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return {
    mesh,
    material: mat,
    haze: {
      rayleigh: rayleighU,
      mie: mieU,
      groundBounce: bounceU,
    },
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
    },
  };
}

export function createCloudDome(radius: number): Mesh<SphereGeometry, MeshBasicNodeMaterial> {
  const mat = new MeshBasicNodeMaterial({
    side: BackSide,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    blending: NormalBlending,
    fog: false,
  });
  const cloudAlpha = Fn(() => {
    const dir = normalize(positionLocal);
    const t = world.time.mul(float(1).sub(world.reducedMotion).mul(0.01));
    const uv = dir.xz
      .div(max(dir.y, 0.24))
      .mul(1.35)
      .add(vec2(t, t.mul(0.18)));
    const n1 = sin(uv.x.mul(3.2).add(uv.y.mul(1.1)).add(t))
      .mul(0.5)
      .add(0.5);
    const n2 = sin(uv.x.mul(7.6).sub(uv.y.mul(3.1)).add(t.mul(1.7)))
      .mul(0.5)
      .add(0.5);
    const n3 = sin(uv.x.mul(15.5).add(uv.y.mul(6.4)).sub(t.mul(0.8)))
      .mul(0.5)
      .add(0.5);
    const streak = sin(uv.x.mul(1.3).sub(uv.y.mul(0.65)).add(t.mul(0.35)))
      .mul(0.5)
      .add(0.5);
    const coverage = n1.mul(0.34).add(n2.mul(0.28)).add(n3.mul(0.22)).add(streak.mul(0.16));
    const band = smoothstep(0.08, 0.2, dir.y).mul(smoothstep(0.86, 0.46, dir.y));
    return smoothstep(0.68, 0.86, coverage).mul(band).mul(0.34).mul(float(1).sub(world.night));
  })();
  mat.colorNode = Fn(() => {
    const dir = normalize(positionLocal);
    const mu = dot(dir, normalize(world.sunDir));
    const lit = pow(max(mu, 0), 4).mul(0.42).add(0.82);
    return mix(vec3(0.86, 0.91, 0.98), vec3(1.0, 0.82, 0.58), smoothstep(-0.02, 0.18, world.sunDir.y)).mul(
      lit,
    );
  })();
  mat.opacityNode = cloudAlpha;
  const mesh = new Mesh(new SphereGeometry(radius, 64, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -8;
  return mesh;
}

/** The moonlit glow and moon halo for the environment capture (the visible stars and moon are in Sky.ts). */
export function createNightDome(radius: number): Mesh {
  const mat = new MeshBasicNodeMaterial({
    side: BackSide,
    depthWrite: false,
    transparent: true,
    blending: AdditiveBlending,
    fog: false,
  });
  mat.colorNode = Fn(() => {
    const dir = normalize(positionLocal);
    const up = max(dir.y, 0);
    const md = dot(dir, world.moonDir);
    const moonUp = smoothstep(-0.1, 0.25, world.moonDir.y);
    const glow = mix(vec3(0.055, 0.085, 0.16), vec3(0.012, 0.022, 0.055), pow(up, 0.5))
      .mul(moonUp.mul(0.6).add(0.4))
      .add(vec3(0.25, 0.3, 0.42).mul(pow(max(md, 0), 8).mul(0.35).mul(moonUp)));
    const halo = vec3(0.7, 0.78, 0.95).mul(pow(max(md, 0), 180).mul(0.3));
    const col = glow.add(halo);
    return col.mul(world.night);
  })();
  const m = new Mesh(new SphereGeometry(radius, 48, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -9;
  return m;
}
