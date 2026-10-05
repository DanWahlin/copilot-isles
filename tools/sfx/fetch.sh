#!/usr/bin/env bash
# Fetches the opening's CC0 sound effects (docs/specs/OPENING-living-chart.md), checks their sha256,
# cuts each to its moment, loudness-matches it, and encodes Ogg/Opus plus an AAC fallback into
# public/audio. Freesound sounds come from their public HQ previews (the originals need a login: drop
# an original into tools/.cache/sfx/<id>.wav to use it instead); the Kenney sounds come from the RPG
# Audio pack. Every file is logged in ASSETS.md.
#   bash tools/sfx/fetch.sh [name]   (just the one sound when a name is given)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CACHE="$ROOT/tools/.cache/sfx"
OUT="$ROOT/public/audio"
mkdir -p "$CACHE"
FFMPEG="${FFMPEG:-ffmpeg}"
FFPROBE="${FFPROBE:-ffprobe}"
KENNEY_ZIP="kenney_rpg-audio.zip"
KENNEY_URL="https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip"
KENNEY_SHA="6dbeaf8544da958d8f2adcb4a4a4b76c1ade34a05f8ab9edccd327da7375f38b"

# name | source (fs:<preview path> or kenney:<file in zip>) | sha256 | start (s) | end (s) | loudness target (LUFS)
SOUNDS=(
  "opening_cabin|fs:31/31574_48671|0aac7a74e592768d6acb5b007c875e33c7404ec529dce23fd63566649809e9d6|60|100|-23"
  "opening_lantern|fs:411/411530_7117788|3ba990d098bcde1be8fe3d0c54c45638aba0ae956f46462140fcbb7141100c7b|2.0|6.0|-18"
  "opening_latch|kenney:Audio/metalLatch.ogg|-|0|1|-18"
  "opening_lid|fs:771/771164_789424|59dafdee19c73dcb9a2fb03ce2efee9fe683acb972e779d1db102a0651445874|0|1.4|-18"
  "opening_magic|fs:817/817466_71257|36d951736776288334ca6a88a8d4afaafc159c6aca28fbeffe0b70804eb125d1|0|2.2|-18"
  "opening_poof|fs:208/208111_2661585|eb3eba6ff3c72c97caba84aaed4936c54d25e06d0ac5e94b1905f750bafba917|0|1.0|-18"
  "opening_paper|fs:753/753282_13973196|90a1932e29e74abdcc725d62ebd6db64729fcbb57ac00c1af163a9b624e2956a|1.1|2.9|-18"
  "opening_popup|kenney:Audio/bookFlip2.ogg|-|0|1|-18"
  "opening_water|fs:866/866205_19053283|af985770f3a8d6fc6d370d91ab5693b9f6353d3590e0282eb999d20d11205f0d|17.2|19.8|-18"
  "opening_sail|fs:244/244982_3008343|56d3a77c35be6f2c85ade0a3fab8b4d2bcd16a427ac8ed6c35869ae48fa8ccfe|0|0.9|-18"
  "opening_whoosh|fs:486/486234_7254895|19f3896c4c1c7a00b1dff4dbac7954845863645c321ac8c93a17125cdff47823|0|2.2|-18"
  "opening_spray|fs:737/737233_71257|3046656ff43ac12651d3f4f0985a76a12065ac1596447cd730d47aaec126d4d6|0|0.6|-18"
)

kenney() {
  local zip="$CACHE/$KENNEY_ZIP"
  [[ -f "$zip" ]] || curl -sfL -A "Mozilla/5.0" -o "$zip" "$KENNEY_URL"
  echo "$KENNEY_SHA  $zip" | shasum -a 256 -c --quiet -
  unzip -p "$zip" "$1" >"$2"
}

ONLY="${1:-}"
for entry in "${SOUNDS[@]}"; do
  IFS='|' read -r name source sha start end target <<<"$entry"
  [[ -z "$ONLY" || "$name" == "$ONLY" ]] || continue
  if [[ "$source" == kenney:* ]]; then
    src="$CACHE/${name}.ogg"
    kenney "${source#kenney:}" "$src"
  else
    path="${source#fs:}"
    id="$(basename "$path" | cut -d_ -f1)"
    if [[ -f "$CACHE/$id.wav" ]]; then
      src="$CACHE/$id.wav"
    else
      src="$CACHE/$(basename "$path")-hq.mp3"
      [[ -f "$src" ]] || curl -sfL -A "Mozilla/5.0" -o "$src" "https://cdn.freesound.org/previews/$path-hq.mp3"
      echo "$sha  $src" | shasum -a 256 -c --quiet -
    fi
  fi
  duration=$(awk -v s="$start" -v e="$end" 'BEGIN { print e - s }')
  fade_out=$(awk -v d="$duration" 'BEGIN { print (d > 0.6 ? d - 0.25 : d * 0.6) }')
  fade_len=$(awk -v d="$duration" 'BEGIN { print (d > 0.6 ? 0.25 : d * 0.4) }')
  filter="atrim=start=$start:end=$end,asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st=$fade_out:d=$fade_len,loudnorm=I=$target:TP=-1.5:LRA=11"
  "$FFMPEG" -hide_banner -loglevel error -y -i "$src" -vn -af "$filter" -ar 48000 -ac 1 \
    -c:a libopus -b:a 64k -vbr on -compression_level 10 -map_metadata -1 "$OUT/$name.ogg"
  "$FFMPEG" -hide_banner -loglevel error -y -i "$src" -vn -af "$filter" -ar 48000 -ac 1 \
    -c:a aac -b:a 80k -map_metadata -1 -movflags +faststart "$OUT/$name.m4a"
  lufs=$("$FFMPEG" -hide_banner -nostats -i "$OUT/$name.ogg" -af ebur128 -f null - 2>&1 | awk '/I:/ { v = $2 } END { print v }')
  len=$("$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$OUT/$name.ogg")
  echo "$name  ${len}s  ${lufs} LUFS"
done
