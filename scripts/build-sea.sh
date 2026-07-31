#!/usr/bin/env bash
# Build a single-executable (Node SEA) build of a Metro-path example —
# one file, no node_modules, no system Node required to run it. The vite
# path is deliberately NOT supported here yet; see docs/getting-started.md's
# "Shipping an app" section for why (the vite bundle loads the native
# addon through a dynamically-obtained require that neither esbuild nor a
# real SEA blob resolve the way this script needs).
#
# Follows gtkx's own tutorial (gtkx-org/gtkx examples/tutorial/scripts/
# build-sea.sh, bundle-postject.ts) for the SEA/postject mechanics:
# esbuild-bundle to CJS, `node --experimental-sea-config`, copy the node
# binary, postject-inject the blob, strip the copy's signature on macOS.
# Diverges on the two hard parts specific to this project — see
# packages/react-native-gtkx/src/sea/bundle.ts's header for the reasoning:
#   - the native addon is embedded as a SEA asset and extracted to a
#     per-user cache directory at startup, not copied beside the binary;
#   - Metro's HOST_MODULE_EXTERNALS are inlined by a generated host entry
#     instead of being left for a runtime node_modules to supply.
#
# The app must be built first: `npm run build:dist` (react-native-gtkx
# itself) and `react-native build-linux` (the example) — see build-deb.sh's
# Metro branch, which needs the same two things.
#
# usage: build-sea.sh <example> <out-dir>
#   e.g. build-sea.sh examples/hn-app /tmp/sea
set -euo pipefail

EXAMPLE="${1:?usage: build-sea.sh <example> <out-dir>}"
OUT="${2:?missing out dir}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_ROOT="$ROOT/$EXAMPLE"
DIST="$APP_ROOT/dist"
RNG_DIST="$ROOT/packages/react-native-gtkx/dist"

[ -f "$DIST/main.jsbundle" ] || {
  echo "missing $DIST/main.jsbundle — run 'react-native build-linux' in $EXAMPLE first" >&2
  exit 1
}
[ -d "$RNG_DIST/sea" ] || {
  echo "missing $RNG_DIST/sea — run 'npm run build:dist' first" >&2
  exit 1
}
[ -f "$APP_ROOT/gtkx.config.ts" ] || {
  echo "missing $APP_ROOT/gtkx.config.ts — a Metro-path app needs one" >&2
  exit 1
}

mkdir -p "$OUT"

echo "bundling $EXAMPLE for a single executable…" >&2
BUNDLE_INFO="$(node "$RNG_DIST/sea/cli.js" metro \
  --app-root "$EXAMPLE" \
  --jsbundle "$DIST/main.jsbundle" \
  --out "$DIST/bundle.cjs")"

NATIVE_ASSET_PATH="$(node -e "console.log(JSON.parse(process.argv[1]).nativeAddonPath)" "$BUNDLE_INFO")"
NATIVE_ASSET_KEY="$(node -e "console.log(JSON.parse(process.argv[1]).nativeAddonKey)" "$BUNDLE_INFO")"

echo "  native addon: $NATIVE_ASSET_PATH" >&2

SEA_CONFIG="$DIST/sea-config.json"
cat > "$SEA_CONFIG" <<EOF
{
  "main": "$DIST/bundle.cjs",
  "output": "$DIST/sea-prep.blob",
  "disableExperimentalSEAWarning": true,
  "assets": { "$NATIVE_ASSET_KEY": "$NATIVE_ASSET_PATH" }
}
EOF

echo "generating the SEA blob…" >&2
node --experimental-sea-config "$SEA_CONFIG"

echo "copying the node binary…" >&2
cp "$(command -v node)" "$OUT/app"

if [[ "$OSTYPE" == "darwin"* ]]; then
  codesign --remove-signature "$OUT/app"
fi

echo "injecting the SEA blob…" >&2
npx --yes --ignore-scripts postject@1.0.0-alpha.6 "$OUT/app" NODE_SEA_BLOB "$DIST/sea-prep.blob" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

chmod +x "$OUT/app"

echo "" >&2
echo "single executable built: $OUT/app" >&2
echo "size: $(du -h "$OUT/app" | cut -f1)" >&2
echo "run: $OUT/app" >&2
