#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$ROOT/tools/characters/source/polypizza"
OUT="$ROOT/public/packs/testcove/characters"
mkdir -p "$SRC" "$OUT"
# key|Poly Pizza id|static UUID|sha256 of source GLB. Pages are checked for creator Quaternius and CC0 before download.
MODELS=(
  "captain|sN18LyyHAU|c814c745-1cf5-4d92-bd85-200c66eb7843|688b0db0487dadaa6dbbf9e5613793aa9c1280902255212bd51bc46ff17f695d"
  "anne|tZYaOQ4l94|1cc2232d-b43e-4fc0-b97f-134b4a528bf8|cfee1b57f380ff4b51fc0b88c9d4750ea1748936eb8b7d5557291913077d1e30"
  "henry|yEdSk8tRKc|b91485bd-aaa0-4a9a-802c-b16e08ae05e7|ae91c5ec699f1f97f980628ab6d54fffaa20c0ed30d3680245fde56eea2204cf"
  "farmer|7pn3R6hPvE|81f2f0cf-6f53-4b57-92ea-dba0928620f2|f7ae6e2596c6521d296fa5948783f1dac717807456ce5355e48719e81d15e9a6"
  "lis|gjuwleUT1U|5c3f2a86-c030-49aa-8a4c-86a7a1220801|518afdbccde9ce91b44dd90c5d74bd350c03cac22f474dcb6ff693b0eb93644e"
  "worker|Yg2bQZO6Hj|3a5f3056-ffe6-42eb-bd52-122afcbd22b2|9c28614f465b7dc105f908c20c22fc045f4b07caf8c5ef0e9f8049eceb6dd38d"
  "adventurer|ZwF0K7WBmu|69689495-028d-4b81-8678-792338a5693e|38e4e6429d8af5849bb23e9585266f8c17dfe3e987bda89dec58f606aaedcf31"
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
