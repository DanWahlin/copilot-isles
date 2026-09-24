#!/usr/bin/env bash
# Installs the asset toolchain locally under .tools/ (no admin rights, nothing global).
#   - KTX-Software (the `ktx` CLI) for KTX2/Basis textures (PLAN §12.7)
#   - finds Blender for restyle/atlas scripts
# gltf-transform comes from devDependencies; ffmpeg is expected on PATH (voice encoding).
set -euo pipefail

KTX_VERSION="4.4.2"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="$ROOT/.tools"
mkdir -p "$TOOLS/bin"

if [ -x "$TOOLS/ktx/bin/ktx" ] && "$TOOLS/ktx/bin/ktx" --version >/dev/null 2>&1; then
  echo "ktx: already available (.tools/ktx)"
elif command -v ktx >/dev/null 2>&1; then
  echo "ktx: already available on PATH"
else
  os="$(uname -s)"; arch="$(uname -m)"
  case "$arch" in arm64|aarch64) arch_name="arm64" ;; x86_64|amd64) arch_name="x86_64" ;; *) echo "Unsupported arch: $arch" >&2; exit 1 ;; esac
  base="https://github.com/KhronosGroup/KTX-Software/releases/download/v${KTX_VERSION}"
  tmp="$(mktemp -d)"
  if [ "$os" = "Darwin" ]; then
    pkg="KTX-Software-${KTX_VERSION}-Darwin-${arch_name}.pkg"
    echo "Downloading $pkg"
    curl -fsSL -o "$tmp/$pkg" "$base/$pkg"
    pkgutil --expand-full "$tmp/$pkg" "$tmp/x" >/dev/null
    # The .pkg splits tools and library into separate payloads (each rooted at usr/local); merge them.
    mkdir -p "$tmp/merged"
    for part in tools library; do
      src="$(find "$tmp/x" -maxdepth 1 -type d -name "*-${part}.pkg")/Payload/usr/local"
      [ -d "$src" ] && cp -R "$src/." "$tmp/merged/"
    done
    payload="$tmp/merged"
  elif [ "$os" = "Linux" ]; then
    tarball="KTX-Software-${KTX_VERSION}-Linux-${arch_name}.tar.bz2"
    echo "Downloading $tarball"
    curl -fsSL -o "$tmp/$tarball" "$base/$tarball"
    mkdir -p "$tmp/x" && tar -xjf "$tmp/$tarball" -C "$tmp/x"
    payload="$(dirname "$(find "$tmp/x" -type f -path '*/bin/ktx' | head -1)")/.."
  else
    echo "Unsupported OS: $os" >&2; exit 1
  fi
  rm -rf "$TOOLS/ktx" && mkdir -p "$TOOLS/ktx"
  cp -R "$payload/." "$TOOLS/ktx/"
  rm -rf "$tmp"
  echo "ktx: installed to .tools/ktx"
fi

blender=""
if command -v blender >/dev/null 2>&1; then blender="$(command -v blender)";
elif [ -x "/Applications/Blender.app/Contents/MacOS/Blender" ]; then blender="/Applications/Blender.app/Contents/MacOS/Blender"; fi
if [ -n "$blender" ]; then echo "blender: $blender"; else echo "blender: not found (optional until asset restyling)"; fi
printf '{ "blender": "%s" }\n' "$blender" > "$TOOLS/paths.json"

node "$ROOT/tools/check-toolchain.mjs"
