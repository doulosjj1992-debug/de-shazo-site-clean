#!/usr/bin/env bash
set -euo pipefail

URL="${1:-https://www.deshazogroup.com}"
OUT="./public/webflow-export"

mkdir -p "$OUT"
echo "Mirroring $URL → $OUT"
wget --mirror --convert-links --adjust-extension --page-requisites --no-parent "$URL" -P "$OUT"
echo "Done."
