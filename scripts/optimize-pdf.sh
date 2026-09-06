#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <pdf-path>" >&2
  exit 2
fi

pdf_path="$1"

[[ -f "$pdf_path" && -s "$pdf_path" ]] || {
  echo "PDF does not exist or is empty: $pdf_path" >&2
  exit 1
}

command -v qpdf >/dev/null 2>&1 || {
  echo "qpdf is required for PDF optimization" >&2
  exit 1
}

command -v pdfinfo >/dev/null 2>&1 || {
  echo "pdfinfo is required for PDF validation" >&2
  exit 1
}

qpdf --check "$pdf_path" >/dev/null

before_bytes="$(stat -c '%s' "$pdf_path")"
before_pages="$(pdfinfo "$pdf_path" | awk '/^Pages:/ { print $2; exit }')"

[[ "$before_pages" =~ ^[0-9]+$ && "$before_pages" -gt 0 ]] || {
  echo "Could not determine source PDF page count" >&2
  exit 1
}

pdf_dir="$(dirname "$pdf_path")"
pdf_name="$(basename "$pdf_path")"
tmp_path="$(mktemp --tmpdir="$pdf_dir" ".${pdf_name}.optimized.XXXXXX.pdf")"

cleanup() {
  rm -f "$tmp_path"
}
trap cleanup EXIT

qpdf \
  --object-streams=generate \
  --recompress-flate \
  --compression-level=9 \
  "$pdf_path" \
  "$tmp_path"

qpdf --check "$tmp_path" >/dev/null

after_pages="$(pdfinfo "$tmp_path" | awk '/^Pages:/ { print $2; exit }')"
[[ "$after_pages" == "$before_pages" ]] || {
  echo "Optimized PDF page count changed: ${before_pages} -> ${after_pages}" >&2
  exit 1
}

after_bytes="$(stat -c '%s' "$tmp_path")"

if (( after_bytes < before_bytes )); then
  mv -f "$tmp_path" "$pdf_path"
  trap - EXIT
  saved_bytes=$((before_bytes - after_bytes))
  saved_percent="$(awk -v before="$before_bytes" -v after="$after_bytes" 'BEGIN { printf "%.1f", (before-after)*100/before }')"
  echo "PDF optimized losslessly: ${before_bytes} -> ${after_bytes} bytes (${saved_percent}% smaller, saved ${saved_bytes} bytes)"
else
  echo "Optimized PDF was not smaller (${before_bytes} -> ${after_bytes} bytes); keeping original"
fi
