#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$ROOT/tools/ship/source/lion-head"
mkdir -p "$SRC/textures" "$SRC/lods"
# Poly Haven lion_head by Tina, CC0 1.0: https://polyhaven.com/a/lion_head
BASE="https://dl.polyhaven.org/file/ph-assets/Models"
FILES=(
  "lion_head_1k.gltf|$BASE/gltf/1k/lion_head/lion_head_1k.gltf|979bd8c7668c02dc26dafb137f8e9e49ecba9eb74ad8bf79c045e9f48fb40cd8"
  "lion_head.bin|$BASE/gltf/8k/lion_head/lion_head.bin|5ed0d6324198711ad30e506789f25e570ee82babbd74f1f09abe459e3c0f9ca3"
  "textures/lion_head_diff_1k.jpg|$BASE/jpg/1k/lion_head/lion_head_diff_1k.jpg|6f04773c186dedc6a8b6737091fb9c41dc0699cd72dcbcad0168a943d4e2e177"
  "textures/lion_head_nor_gl_1k.jpg|$BASE/jpg/1k/lion_head/lion_head_nor_gl_1k.jpg|8ae7aebe71bfaec856367c3f8e5ceabed99316507ff823d04f932518d994f561"
  "textures/lion_head_arm_1k.jpg|$BASE/jpg/1k/lion_head/lion_head_arm_1k.jpg|9c19d88c7348c852c59195064296a7dfe4f8b43029b03cc3519046349b3538c0"
)
: > "$SRC/SHA256SUMS"
for spec in "${FILES[@]}"; do
  IFS='|' read -r file url sha <<<"$spec"
  mkdir -p "$(dirname "$SRC/$file")"
  curl -L -sS "$url" -o "$SRC/$file"
  actual="$(shasum -a 256 "$SRC/$file" | awk '{print $1}')"
  if [[ "$actual" != "$sha" ]]; then
    echo "sha256 mismatch for $file: $actual" >&2
    exit 1
  fi
  echo "$actual  $file" >> "$SRC/SHA256SUMS"
done
sort -o "$SRC/SHA256SUMS" "$SRC/SHA256SUMS"

npx gltf-transform copy "$SRC/lion_head_1k.gltf" "$SRC/lion_head.glb" >/dev/null
for spec in high:0.13 medium:0.08 low:0.04 lite:0.025; do
  name="${spec%:*}"
  ratio="${spec#*:}"
  npx gltf-transform weld "$SRC/lion_head.glb" "$SRC/lods/$name-weld.glb" >/dev/null
  npx gltf-transform simplify "$SRC/lods/$name-weld.glb" "$SRC/lods/$name.glb" --ratio "$ratio" --error 0.02 >/dev/null
  rm "$SRC/lods/$name-weld.glb"
done
node "$ROOT/tools/ship/build-lion-head.mjs"
