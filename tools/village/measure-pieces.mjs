#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const sourceDir = path.resolve(
  process.argv[2] ?? path.join(root, 'tools/.cache/village/medieval_village_megakitstandard/glTF'),
);
const fetchSh = fs.readFileSync(path.join(root, 'tools/village/fetch.sh'), 'utf8');
const pieces = [...fetchSh.matchAll(/^ {2}([A-Za-z0-9_]+)$/gm)].map((match) => match[1]);

function boundsForGltf(file) {
  const gltf = JSON.parse(fs.readFileSync(file, 'utf8'));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let tris = 0;
  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const accessor = gltf.accessors?.[primitive.attributes?.POSITION];
      if (!accessor?.min || !accessor.max) continue;
      for (let i = 0; i < 3; i += 1) {
        min[i] = Math.min(min[i], accessor.min[i]);
        max[i] = Math.max(max[i], accessor.max[i]);
      }
      const indices =
        primitive.indices === undefined ? accessor.count : gltf.accessors?.[primitive.indices]?.count;
      tris += (indices ?? 0) / 3;
    }
  }
  return { min, max, tris };
}

for (const piece of pieces) {
  const file = path.join(sourceDir, `${piece}.gltf`);
  if (!fs.existsSync(file)) {
    console.log(`${piece.padEnd(36)} missing`);
    continue;
  }
  const { min, max, tris } = boundsForGltf(file);
  const size = max.map((value, i) => value - min[i]);
  const center = max.map((value, i) => (value + min[i]) * 0.5);
  console.log(
    `${piece.padEnd(36)} min ${min.map((v) => v.toFixed(3)).join(',')} max ${max
      .map((v) => v.toFixed(3))
      .join(',')} size ${size.map((v) => v.toFixed(3)).join('x')} center ${center
      .map((v) => v.toFixed(3))
      .join(',')} tris ${Math.round(tris)}`,
  );
}
