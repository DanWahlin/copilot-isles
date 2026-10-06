import * as THREE from '/node_modules/three/build/three.module.js';
import { GLTFLoader } from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
const framesMeta = await fetch('/frames.json').then((r) => r.json());

const frame = framesMeta.frame;
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setClearColor(0x000000, 0);
renderer.setSize(frame * framesMeta.cols, frame * framesMeta.rows, false);
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const loader = new GLTFLoader();
async function load(url) {
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  // Keep each mesh's source positions so the flying gull's wings can be re-posed per frame.
  root.traverse((o) => {
    if (o.isMesh) {
      o.userData.rest = o.geometry.attributes.position.array.slice();
      o.userData.legs = legMask(o);
    }
  });
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  root.position.sub(center);
  root.scale.setScalar(1 / Math.max(size.x, size.y, size.z));
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      if (o.material) {
        o.material = o.material.clone();
        o.material.side = THREE.DoubleSide;
        o.material.needsUpdate = true;
      }
    }
  });
  return root;
}

// The flying gull's legs: vertices behind the hips whose texel is the legs' orange. They trail
// under the tail in flight; the landing frames swing them down about the hips.
const HIP = { x: -9, y: -5.7 };
function legMask(mesh) {
  const img = mesh.material?.map?.image;
  const uv = mesh.geometry.attributes.uv;
  const pos = mesh.geometry.attributes.position;
  if (!img || !uv) return null;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const mask = new Uint8Array(pos.count);
  const wrap = (v) => ((v % 1) + 1) % 1;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getX(i) > HIP.x + 4) continue;
    const tx = Math.min(c.width - 1, Math.floor(wrap(uv.getX(i)) * c.width));
    const ty = Math.min(c.height - 1, Math.floor(wrap(uv.getY(i)) * c.height));
    const o = (ty * c.width + tx) * 4;
    if (px[o] > 150 && px[o + 2] < 120 && px[o] - px[o + 2] > 80) mask[i] = 1;
  }
  return mask;
}

/** Shoulder and wrist angles (radians) for a frame of the flying gull. */
function wingAngles(spec) {
  if (spec.glide) return { shoulder: -0.32, wrist: 0.04 };
  if (spec.flareBeat !== undefined) {
    // The landing flare: wide braking strokes from just over the back down to below the body.
    const ph = spec.flareBeat / spec.flareOf;
    const down = 0.5 - 0.5 * Math.cos(ph * Math.PI * 2);
    return {
      shoulder: 0.2 - 1.15 * down,
      wrist: -0.12 - 0.3 * down + 0.25 * Math.sin(ph * Math.PI * 2),
    };
  }
  if (spec.flare) return { shoulder: 0.25, wrist: -0.1 };
  // 0 = top of the upstroke (the model's pose), 0.5 = bottom of the downstroke
  const ph = spec.flap / 8;
  const down = 0.5 - 0.5 * Math.cos(ph * Math.PI * 2);
  return { shoulder: -1.25 * down + 0.1, wrist: -0.45 * down + 0.25 * Math.sin(ph * Math.PI * 2) };
}

// The Poly "Flying seagull" is one rigid mesh, body along x, wings spread along ±z and held
// up (+y). Each flap phase bends both wings about the body axis at the shoulder (|z| ≈ 6) with a
// softer bend at the wrist, so the sheet holds a real downstroke and upstroke.
const SHOULDER = 6;
const WRIST = 24;
function flapWings(obj, spec) {
  obj.traverse((o) => {
    if (!o.isMesh || !o.userData.rest) return;
    const rest = o.userData.rest;
    const pos = o.geometry.attributes.position;
    const out = pos.array;
    out.set(rest);
    const legs = o.userData.legs;
    if (spec.model === 'flying' && legs && spec.legs) {
      // Swing the legs down about the hips (about the body's side axis), feet reaching forward.
      const c = Math.cos(spec.legs),
        s = Math.sin(spec.legs);
      for (let i = 0; i < rest.length; i += 3) {
        if (!legs[i / 3]) continue;
        const dx = rest[i] - HIP.x,
          dy = rest[i + 1] - HIP.y;
        out[i] = HIP.x + dx * c - dy * s;
        out[i + 1] = HIP.y + dx * s + dy * c;
      }
    }
    if (spec.model === 'flying') {
      const { shoulder, wrist } = wingAngles(spec);
      for (let i = 0; i < rest.length; i += 3) {
        if (legs?.[i / 3]) continue;
        const x = rest[i],
          y = rest[i + 1],
          z = rest[i + 2];
        const az = Math.abs(z);
        if (az <= SHOULDER) continue;
        const side = Math.sign(z);
        // rotate (y, |z|) about the shoulder by the shoulder angle, then the outer wing about the wrist
        let ry = y,
          rz = az - SHOULDER;
        const c1 = Math.cos(shoulder),
          s1 = Math.sin(shoulder);
        let ny = ry * c1 + rz * s1,
          nz = -ry * s1 + rz * c1;
        if (az > WRIST) {
          const wy = (WRIST - SHOULDER) * s1,
            wz = (WRIST - SHOULDER) * c1;
          const dy = ny - wy,
            dz = nz - wz;
          const c2 = Math.cos(wrist),
            s2 = Math.sin(wrist);
          ny = wy + dy * c2 + dz * s2;
          nz = wz - dy * s2 + dz * c2;
        }
        out[i] = x;
        out[i + 1] = ny;
        out[i + 2] = side * (nz + SHOULDER);
      }
    }
    pos.needsUpdate = true;
    o.geometry.computeVertexNormals();
  });
}

function applyPose(obj, spec) {
  flapWings(obj, spec);
  obj.rotation.set(0, 0, 0);
  obj.position.set(0, spec.crouch ? -0.08 : spec.bob ? 0.04 : 0, 0);
  obj.rotation.y = spec.yaw ?? 0;
  obj.rotation.x = spec.pitch ?? 0;
  obj.rotation.z = spec.roll ?? 0;
  if (spec.model === 'flying') obj.rotation.x += -0.12;
}

function poseCamera(camera, spec) {
  camera.position.set(0.45, spec.model === 'perched' ? 0.28 : 0.34, 3.4);
  camera.lookAt(0, spec.model === 'perched' ? 0.0 : -0.02, 0);
}

window.__bakeWordmarkGull = async () => {
  const [perched, flying] = await Promise.all([load('/perched.glb'), load('/flying.glb')]);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(25, 1, 0.01, 20);
  const sun = new THREE.DirectionalLight(0xfff4dc, 3.5);
  sun.position.set(-1.4, 2.2, 2.4);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xaec8ff, 1.5);
  rim.position.set(1.5, 1.2, -1.5);
  scene.add(rim, new THREE.AmbientLight(0xffffff, 1.5));
  renderer.setScissorTest(true);
  const placements = {};
  // The foot line is the idle pose's lowest point (see the perched branch below).
  applyPose(perched, { model: 'perched', yaw: -0.32 });
  perched.scale.multiplyScalar(0.82);
  perched.updateMatrixWorld(true);
  const footLine = new THREE.Box3().setFromObject(perched, true).min.y;
  perched.scale.multiplyScalar(1 / 0.82);
  for (let i = 0; i < framesMeta.frames.length; i++) {
    const spec = framesMeta.frames[i];
    const col = i % framesMeta.cols;
    const row = Math.floor(i / framesMeta.cols);
    const x = col * frame;
    const y = row * frame;
    const obj = spec.model === 'perched' ? perched : flying;
    scene.add(obj);
    applyPose(obj, spec);
    poseCamera(camera, spec);
    const scale = spec.model === 'perched' ? 0.82 : 0.9;
    obj.scale.multiplyScalar(scale);
    if (spec.model === 'perched') {
      // Every perched pose stands on the same foot line: the crouch's pitch and drop (and the
      // bob) move the body, never the feet, so the bird can't sink into the letter.
      obj.updateMatrixWorld(true);
      const lowest = new THREE.Box3().setFromObject(obj, true).min.y;
      obj.position.y += footLine - lowest;
    }
    renderer.setViewport(x, canvas.height - y - frame, frame, frame);
    renderer.setScissor(x, canvas.height - y - frame, frame, frame);
    renderer.setClearColor(0x000000, 0);
    renderer.clearColor();
    renderer.clearDepth();
    renderer.render(scene, camera);
    obj.scale.multiplyScalar(1 / scale);
    scene.remove(obj);
    placements[spec.name] = { x, y, w: frame, h: frame };
  }
  renderer.setScissorTest(false);
  return {
    webp: canvas.toDataURL('image/webp', 0.88),
    png: canvas.toDataURL('image/png'),
    meta: { frame, cols: framesMeta.cols, rows: framesMeta.rows, frames: placements },
  };
};
