#!/usr/bin/env bash
# 4.21 — Fetch the Tesseract LSTM language data files needed by the
# TesseractModule native bridge. The files are gitignored (the entire
# `app/android/` tree is gitignored per app/.gitignore:44), so each fresh
# clone needs to run this once before `./gradlew :app:assembleRelease` or
# `npm run android` will produce a working APK.
#
# Source: github.com/tesseract-ocr/tessdata_best (CC0-1.0 license).
# `tessdata_best` is the highest-accuracy variant (best for Indian
# receipts), at the cost of ~2x the disk size of `tessdata_fast`. The
# user-selected option for 4.21 was `tessdata_best` for eng+hin only —
# see Decision log 2026-05-19.
#
# Usage (from repo root):
#   bash app/scripts/download_tessdata.sh
#
# Idempotent — skips files that already exist with non-zero size.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS_DIR="$REPO_ROOT/android/app/src/main/assets/tessdata"
BASE_URL="https://github.com/tesseract-ocr/tessdata_best/raw/main"

# Languages bundled with Drift. To add more (Tamil/Telugu), append below.
LANGUAGES=("eng" "hin")

mkdir -p "$ASSETS_DIR"

for lang in "${LANGUAGES[@]}"; do
  out="$ASSETS_DIR/$lang.traineddata"
  if [[ -s "$out" ]]; then
    echo "✓ $lang.traineddata already present ($(stat -c %s "$out" 2>/dev/null || stat -f %z "$out") bytes) — skipping"
    continue
  fi
  url="$BASE_URL/$lang.traineddata"
  echo "↓ fetching $lang.traineddata from $url"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$out"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$url" -O "$out"
  else
    echo "ERROR: neither curl nor wget available" >&2
    exit 1
  fi
  size=$(stat -c %s "$out" 2>/dev/null || stat -f %z "$out")
  if [[ "$size" -lt 100000 ]]; then
    echo "ERROR: $out is only $size bytes — likely a 404 HTML page, not the trained data" >&2
    rm -f "$out"
    exit 1
  fi
  echo "✓ wrote $out ($size bytes)"
done

echo ""
echo "Done. $(ls -lh "$ASSETS_DIR"/*.traineddata 2>/dev/null | wc -l) language file(s) in $ASSETS_DIR"
