#!/usr/bin/env bash
# Downloads the CC0 music tracks from OpenGameArt (and picks up Dan's Suno tracks from the cache),
# checks their sha256, trims the dead air at each end (leaving about a second of breath for the
# loop), and encodes Ogg/Opus plus an AAC fallback into public/audio. Prints each output's
# integrated loudness for src/audio/music/tracks.ts.
#   bash tools/music/fetch.sh [music_name]   (just the one track when a name is given)
# Suno tracks ("suno:<id>") can't be downloaded: export the MP3 from Dan's Suno library and copy it
# to tools/.cache/music/<name without the music_ prefix>.mp3 first.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CACHE="$ROOT/tools/.cache/music"
OUT="$ROOT/public/audio"
mkdir -p "$CACHE"

# name | source url | sha256 | trim start (s) | trim end (s)
TRACKS=(
  "music_bards_tale|https://opengameart.org/sites/default/files/The_Bards_Tale.mp3|6e93e8e8215bea17a209c321c182111058e024c53e3ad775ce1481ca1d1fcfc2|2.0|153.0"
  "music_reggae|https://opengameart.org/sites/default/files/regea_0.mp3|e276b0afddff4eb483d4ae13e9b7f95a04cc46d03180ebf1c3d58084f415adfd|0.4|236.0"
  "music_bamboo_tide|suno:a6655ab9-f55b-4083-baca-8b20354c928f|9a848dd048caf6830321b4b61e011d28134cc5cdc8fd11bed52bbe7c7f55d51c|0.0|151.4"
  "music_sunset_plains|https://opengameart.org/sites/default/files/sunset_plains.wav|f3750f8eda8bf42662b12f5726404675689b50f05ccaa968c5cb2e33d9172a62|0.8|329.4"
  "music_salty_sway|suno:4411cff4-7e13-45d8-a90b-07e15ad9fd2e|bbb8a91c615de57cc5e0f9b051cc86bdb61c9edb669c5b6a16be207db761cf67|0.2|157.0"
  "music_treasure_chest_opens|suno:84c60386-08ac-45c4-a820-4555a5c8e6c3|2c21f9d7e7a7de881d52a09a45c5560d16af605525d71b592d427261f0577d2a|0.0|28.7"
)

ONLY="${1:-}"
for entry in "${TRACKS[@]}"; do
  IFS='|' read -r name url sha start end <<<"$entry"
  [[ -z "$ONLY" || "$name" == "$ONLY" ]] || continue
  if [[ "$url" == suno:* ]]; then
    src="$CACHE/${name#music_}.mp3"
    [[ -f "$src" ]] || { echo "Missing $src: export Suno track ${url#suno:} from Dan's library and copy it there." >&2; exit 1; }
  else
    src="$CACHE/$(basename "$url")"
    [[ -f "$src" ]] || curl -sfL -A "Mozilla/5.0" -o "$src" "$url"
  fi
  echo "$sha  $src" | shasum -a 256 -c --quiet -
  duration=$(awk -v s="$start" -v e="$end" 'BEGIN { print e - s }')
  fade_out=$(awk -v d="$duration" 'BEGIN { print d - 0.8 }')
  filter="atrim=start=$start:end=$end,asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st=$fade_out:d=0.8"
  ffmpeg -hide_banner -loglevel error -y -i "$src" -vn -af "$filter" -ar 48000 -ac 2 \
    -c:a libopus -b:a 96k -vbr on -compression_level 10 -application audio -map_metadata -1 "$OUT/$name.ogg"
  ffmpeg -hide_banner -loglevel error -y -i "$src" -vn -af "$filter" -ar 48000 -ac 2 \
    -c:a aac -b:a 128k -movflags +faststart -map_metadata -1 "$OUT/$name.m4a"
  lufs=$(ffmpeg -hide_banner -nostats -i "$OUT/$name.ogg" -af ebur128 -f null - 2>&1 | awk '/^ +I:/ { v = $2 } END { print v }')
  echo "$name: ${duration}s, $lufs LUFS, $(du -h "$OUT/$name.ogg" | cut -f1) ogg, $(du -h "$OUT/$name.m4a" | cut -f1) m4a"
done
