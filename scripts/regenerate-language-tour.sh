#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

shopt -s nullglob
examples=(examples/language-tour/*.zax)
if [[ ${#examples[@]} -eq 0 ]]; then
  echo "No language-tour .zax files found" >&2
  exit 1
fi

echo "Regenerating language-tour artifacts..."
for f in "${examples[@]}"; do
  base="${f%.zax}"
  echo "==> $f" >&2
  if ! npm run -s zax -- --nobin --nohex --nolist -o "${base}.hex" "$f" >/tmp/zax_regen.log 2>&1; then
    echo "FAILED: $f" >&2
    cat /tmp/zax_regen.log >&2
    exit 1
  fi
done

echo "Done." >&2
