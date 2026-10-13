#!/usr/bin/env bash
# Fetches the opening's and Thousand-Bough's CC0 sounds (docs/specs/OPENING-living-chart.md,
# docs/specs/ISLAND-02-thousand-bough.md §8.2), checks their sha256,
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
# [| loop]: a seamless loop (its second half crossfaded onto its first, so the wrap is the recording's own
# join) at a fixed gain, so the level never pumps at the seam.
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
  # Thousand-Bough Isle (Chapter 02).
  "waterfall_large|fs:321/321886_252156|b1206a4f4907b316b25f842ed8b8630fde5db0c3fe614e7f6117c9153f442f44|6|46|-23|loop"
  "rain_canopy|fs:836/836411_10255582|4b2a88bf98148a8122c4733780775922be3b11291f81146c01c9924fa0843c5d|4|64|-26|loop"
  "frogs_dusk|fs:429/429590_3173615|f55dacf01ac68d5b108b68f6cde1455e15a6a7ae0061779494d2854187af4041|14|74|-24|loop"
  "booth_kalimba|fs:415/415104_2147722|b7405558e29828b63e2c9bc6cc18149c89ee5b8355fde93839eba6ed42e00976|4|26|-21|loop"
  "booth_flute|fs:196/196381_3654176|b95e88dde0d84bc72e814bdf7c086b126e15c63d8063757ea6a576d21c2672bc|0.5|25.5|-21|loop"
  "booth_rainstick|fs:235/235966_2649560|951e4ebd1e74e8998133f3649b4f84070a2bd1f4c1eefe42ccebc92d88bc46b7|3|27|-22|loop"
  "parrot_call|fs:187/187928_3488149|c4effb3a92056309277ca7526a86fbf15979b266587189d836553ec29f4bd7a1|0|7.25|-20"
  "gondola_bell|fs:452/452379_1844073|25a80be065cddd124ef8a7d50a180867439227cff6dcfb6c1f4c0c0300b4e077|0|1.9|-18"
  "rope_hoist|fs:394/394222_109726|ec46b42ed63a8151488d4c1bcf89eea8c2739e44259247b3f10f943c70eaed42|0|4.5|-20"
  "rock_tumble|fs:567/567249_7108319|6fdc4ecbc4c1140d9354a64575892f57a5d476cf8b8421fdd2daa90a401342e4|0|4.2|-17"
)

kenney() {
  local zip="$CACHE/$KENNEY_ZIP"
  [[ -f "$zip" ]] || curl -sfL -A "Mozilla/5.0" -o "$zip" "$KENNEY_URL"
  echo "$KENNEY_SHA  $zip" | shasum -a 256 -c --quiet -
  unzip -p "$zip" "$1" >"$2"
}

ONLY="${1:-}"
for entry in "${SOUNDS[@]}"; do
  IFS='|' read -r name source sha start end target loop <<<"$entry"
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
  if [[ "$loop" == "loop" ]]; then
    half=$(awk -v d="$duration" 'BEGIN { print d / 2 }')
    xf=$(awk -v d="$duration" 'BEGIN { x = d / 6; print (x > 2 ? 2 : x) }')
    wav="$CACHE/$name.loop.wav"
    "$FFMPEG" -hide_banner -loglevel error -y -i "$src" -vn -filter_complex \
      "[0:a]atrim=start=$start:end=$end,asetpts=PTS-STARTPTS,aformat=channel_layouts=mono,asplit=2[a][b];[a]atrim=0:$half,asetpts=PTS-STARTPTS[p1];[b]atrim=$half,asetpts=PTS-STARTPTS[p2];[p2][p1]acrossfade=d=$xf:c1=qsin:c2=qsin" \
      -ar 48000 -ac 1 "$wav"
    have=$("$FFMPEG" -hide_banner -nostats -i "$wav" -af ebur128 -f null - 2>&1 | awk '/I:/ { v = $2 } END { print v }')
    gain=$(awk -v t="$target" -v h="$have" 'BEGIN { print t - h }')
    filter="volume=${gain}dB,alimiter=limit=0.84:level=false"
    src="$wav"
  else
    fade_out=$(awk -v d="$duration" 'BEGIN { print (d > 0.6 ? d - 0.25 : d * 0.6) }')
    fade_len=$(awk -v d="$duration" 'BEGIN { print (d > 0.6 ? 0.25 : d * 0.4) }')
    filter="atrim=start=$start:end=$end,asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st=$fade_out:d=$fade_len,loudnorm=I=$target:TP=-1.5:LRA=11"
  fi
  "$FFMPEG" -hide_banner -loglevel error -y -i "$src" -vn -af "$filter" -ar 48000 -ac 1 \
    -c:a libopus -b:a 64k -vbr on -compression_level 10 -map_metadata -1 "$OUT/$name.ogg"
  "$FFMPEG" -hide_banner -loglevel error -y -i "$src" -vn -af "$filter" -ar 48000 -ac 1 \
    -c:a aac -b:a 80k -map_metadata -1 -movflags +faststart "$OUT/$name.m4a"
  lufs=$("$FFMPEG" -hide_banner -nostats -i "$OUT/$name.ogg" -af ebur128 -f null - 2>&1 | awk '/I:/ { v = $2 } END { print v }')
  len=$("$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$OUT/$name.ogg")
  echo "$name  ${len}s  ${lufs} LUFS"
done
