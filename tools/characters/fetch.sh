#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$ROOT/tools/characters/source/polypizza"
OUT="$ROOT/public/packs/testcove/characters"
mkdir -p "$SRC" "$OUT"
# Quaternius Pirate Kit, CC0, verified at https://quaternius.com/packs/piratekit.html.
# Its official glTF folder only has these three human chibi pirates (plus creatures/skeletons), so NPC
# variety is built from period accessories instead of mixing in lanky non-kit rigs.
# key|Poly Pizza id|static UUID|sha256 of source GLB. Pages are checked for creator Quaternius and CC0 before download.
MODELS=(
  "captain|sN18LyyHAU|c814c745-1cf5-4d92-bd85-200c66eb7843|688b0db0487dadaa6dbbf9e5613793aa9c1280902255212bd51bc46ff17f695d"
  "anne|tZYaOQ4l94|1cc2232d-b43e-4fc0-b97f-134b4a528bf8|cfee1b57f380ff4b51fc0b88c9d4750ea1748936eb8b7d5557291913077d1e30"
  "henry|yEdSk8tRKc|b91485bd-aaa0-4a9a-802c-b16e08ae05e7|ae91c5ec699f1f97f980628ab6d54fffaa20c0ed30d3680245fde56eea2204cf"
)
rm -f "$OUT"/*.glb
for spec in "${MODELS[@]}"; do
  IFS='|' read -r name id uuid sha <<<"$spec"
  page="$SRC/$name.html"
  src="$SRC/$name.source.glb"
  out="$OUT/$name.glb"
  curl -L -sS "https://poly.pizza/m/$id" -o "$page"
  grep -q 'CC0' "$page"
  grep -q 'Quaternius' "$page"
  grep -q "https://static.poly.pizza/$uuid.glb" "$page"
  curl -L -sS "https://static.poly.pizza/$uuid.glb" -o "$src"
  actual="$(shasum -a 256 "$src" | awk '{print $1}')"
  if [[ "$sha" != "__SHA_${name}__" && "$actual" != "$sha" ]]; then
    echo "sha256 mismatch for $name: $actual" >&2
    exit 1
  fi
  npx gltf-transform optimize "$src" "$out" --compress meshopt --texture-compress false >/dev/null
  echo "$name $id $actual"
done
for name in captain anne henry; do
  npx gltf-transform optimize "$OUT/$name.glb" "$OUT/$name-npc.glb" \
    --compress meshopt \
    --texture-compress false \
    --simplify \
    --simplify-ratio 0.72 \
    --simplify-error 0.0008 >/dev/null
done
