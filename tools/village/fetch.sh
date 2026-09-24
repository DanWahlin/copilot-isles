#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CACHE="$ROOT/tools/.cache/village"
WORK="$CACHE/medieval_village_megakitstandard"
ZIP="$CACHE/medieval_village_megakitstandard.zip"
OUT_DIR="$ROOT/public/packs/testcove/village"
RAW="$CACHE/kit.raw.glb"
RESIZED="$CACHE/kit.resized.glb"
WEBP="$CACHE/kit.webp.glb"
OUT="$OUT_DIR/kit.glb"
URL="https://opengameart.org/sites/default/files/medieval_village_megakitstandard.zip"
SHA="58c3e1b9713ee85749ade230c36e1195af5d96951435532b4411e993b46387bd"
PIECES=(
  Wall_Plaster_Window_Wide_Flat
  Wall_Plaster_Window_Wide_Round
  Wall_Plaster_Window_Thin_Round
  Wall_Plaster_Door_Flat
  Wall_Plaster_Door_Round
  Wall_Plaster_Straight
  Wall_Plaster_Straight_Base
  Wall_Plaster_WoodGrid
  Wall_UnevenBrick_Door_Flat
  Wall_UnevenBrick_Door_Round
  Wall_UnevenBrick_Window_Wide_Flat
  Wall_UnevenBrick_Window_Wide_Round
  Wall_UnevenBrick_Window_Thin_Round
  Wall_UnevenBrick_Straight
  Corner_Exterior_Wood
  DoorFrame_Round_Brick
  DoorFrame_Flat_Brick
  Door_1_Flat
  Door_1_Round
  Door_2_Round
  Window_Wide_Round1
  Window_Wide_Flat1
  Window_Thin_Round1
  WindowShutters_Wide_Flat_Open
  WindowShutters_Wide_Round_Open
  WindowShutters_Thin_Flat_Open
  WindowShutters_Thin_Round_Open
  Balcony_Simple_Straight
  Balcony_Cross_Straight
  Balcony_Cross_Corner
  Overhang_Plaster_Long
  Overhang_Plaster_Corner
  Overhang_UnevenBrick_Long
  Roof_RoundTiles_4x4
  Roof_RoundTiles_4x6
  Roof_RoundTiles_6x4
  Roof_RoundTiles_6x6
  Roof_RoundTiles_6x8
  Roof_RoundTiles_8x8
  Roof_Front_Brick4
  Roof_Front_Brick6
  Roof_Front_Brick8
  Roof_Dormer_RoundTile
  Roof_Tower_RoundTiles
  Roof_FrontSupports
  Prop_Chimney
  Prop_Chimney2
  Prop_Crate
  Prop_Wagon
  Prop_Vine1
  Prop_Vine2
  Prop_Vine4
  Prop_Support
  Stairs_Exterior_Straight
  Stairs_Exterior_Platform
  Floor_UnevenBrick
  Floor_RedBrick
  Floor_WoodLight
  Prop_WoodenFence_Single
  Prop_WoodenFence_Extension1
)
mkdir -p "$CACHE" "$OUT_DIR"
if [[ ! -f "$ZIP" ]]; then
  curl -L -sS "$URL" -o "$ZIP"
fi
actual="$(shasum -a 256 "$ZIP" | awk '{print $1}')"
if [[ "$actual" != "$SHA" ]]; then
  echo "sha256 mismatch for $ZIP: $actual" >&2
  exit 1
fi
rm -rf "$WORK"
mkdir -p "$WORK"
python - <<PY
import zipfile
from pathlib import Path
zip_path = Path('$ZIP')
out = Path('$WORK')
with zipfile.ZipFile(zip_path) as z:
    z.extractall(out)
PY
inputs=()
for piece in "${PIECES[@]}"; do
  inputs+=("$WORK/glTF/$piece.gltf")
done
npx gltf-transform merge "${inputs[@]}" "$RAW" --partition false >/dev/null
npx gltf-transform resize "$RAW" "$RESIZED" --width 1024 --height 1024 >/dev/null
npx gltf-transform webp "$RESIZED" "$WEBP" --quality 82 >/dev/null
npx gltf-transform meshopt "$WEBP" "$OUT" --level medium >/dev/null
node --input-type=module - <<NODE
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read('$OUT');
for (const node of doc.getRoot().listNodes()) if (node.getMesh()) node.getMesh().setName(node.getName());
await io.write('$OUT', doc);
NODE
printf 'kit %s %s\n' "$actual" "$(shasum -a 256 "$OUT" | awk '{print $1}')"
