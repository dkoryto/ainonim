#!/usr/bin/env bash
# Rebuild vendor/polanon-*.whl from a polanon checkout (default: ../polanon, at its HEAD).
# Builds from a `git archive` copy, so the checkout gets no build/ or *.egg-info directories.
set -euo pipefail

repo="${1:-../polanon}"
here="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

git -C "$repo" archive --format=tar HEAD | tar -x -C "$tmp"
rm -f "$here"/vendor/polanon-*.whl
python3 -m pip wheel --quiet --no-deps "$tmp" -w "$here/vendor"
echo "polanon commit: $(git -C "$repo" rev-parse HEAD)"
shasum -a 256 "$here"/vendor/polanon-*.whl
