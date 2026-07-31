#!/usr/bin/env bash
# Build a .deb of an example application. Two source shapes exist:
#
#   vite path (examples/monitor, gallery, tasks-app — `gtkx build`):
#     dist/bundle.js + dist/gtkx.node, everything except the native addon
#     inlined. Ships as-is under /opt, `node bundle.js` needs nothing else.
#
#   Metro path (examples/hn-app — `react-native build-linux`):
#     dist/main.jsbundle only. Metro deliberately keeps @gtkx/*, react and
#     yoga-layout OUT of the bundle (see packages/react-native-gtkx's
#     src/metro/index.ts, HOST_MODULE_EXTERNALS) — they have to be the same
#     instances the Node+GTK host itself loads. So the target machine needs
#     a real node_modules too, and this script builds one: `npm pack` the
#     local react-native-gtkx (never the stale registry version — we may be
#     packaging the release that publishes it), install that tarball in an
#     isolated scratch project (a `file:` reference to the directory would
#     silently resolve through the monorepo's own hoisted node_modules and
#     prove nothing), run `gtkx codegen` there, and stage the result next to
#     the bundle. Validated by hand in the VM before being encoded here:
#     built, isolated-installed, codegen'd and launched inside a real
#     desktop session — see .claude/epics/metro-production-build.
#
# The app must be built first (npm run build in the example).
# usage: build-deb.sh <example> <app-title> <version> <out-dir>
#   e.g. build-deb.sh monitor "System Monitor" 0.1.0-alpha.1 /tmp/debs
set -euo pipefail

EXAMPLE="${1:?usage: build-deb.sh <example> <app-title> <version> <out-dir>}"
TITLE="${2:?missing app title}"
VERSION="${3:?missing version}"
OUT="${4:?missing out dir}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/examples/$EXAMPLE/dist"

PKG="react-native-gtkx-$EXAMPLE"
ARCH="$(dpkg --print-architecture)"
# Debian versions use ~ for prereleases (sorts before the release).
DEB_VERSION="${VERSION//-/\~}"
STAGE="$(mktemp -d)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$STAGE" "$SCRATCH"' EXIT

install -d "$STAGE/DEBIAN" "$STAGE/opt/$PKG" "$STAGE/usr/bin" \
  "$STAGE/usr/share/applications" "$STAGE/usr/share/icons/hicolor/scalable/apps"
cp "$ROOT/docs/icon.svg" "$STAGE/usr/share/icons/hicolor/scalable/apps/$PKG.svg"

DESCRIPTION_BODY=""

if [ -f "$DIST/bundle.js" ]; then
  # --- vite path -------------------------------------------------------
  cp "$DIST/bundle.js" "$DIST/gtkx.node" "$STAGE/opt/$PKG/"
  # tasks-app (and any future GSettings-using app) also emits a compiled
  # schema; bundle.js's own banner points GSETTINGS_SCHEMA_DIR at its own
  # directory, so copying it alongside is the only thing needed.
  if [ -f "$DIST/gschemas.compiled" ]; then
    cp "$DIST/gschemas.compiled" "$STAGE/opt/$PKG/"
  fi

  cat > "$STAGE/usr/bin/$PKG" <<LAUNCHER
#!/bin/sh
exec node "/opt/$PKG/bundle.js" "\$@"
LAUNCHER

  DESCRIPTION_BODY=" An application written against the React Native API and rendered as native
 GTK4/Adwaita widgets by react-native-gtkx. Ships as a single Node bundle
 with the gtkx native addon."

elif [ -f "$DIST/main.jsbundle" ]; then
  # --- Metro path --------------------------------------------------------
  RNG_DIST="$ROOT/packages/react-native-gtkx/dist"
  [ -d "$RNG_DIST" ] || {
    echo "missing $RNG_DIST — run npm run build:dist first" >&2
    exit 1
  }
  APP_CONFIG="$ROOT/examples/$EXAMPLE/gtkx.config.ts"
  [ -f "$APP_CONFIG" ] || {
    echo "missing $APP_CONFIG — a Metro-path app needs one" >&2
    exit 1
  }

  echo "packing the local react-native-gtkx build…" >&2
  # Glob the result rather than parse npm pack's stdout: the package's own
  # prepack script (README sync) prints a notice line first, so the tarball
  # filename is not reliably "the whole output".
  (cd "$ROOT" && npm pack -w react-native-gtkx --pack-destination "$SCRATCH" --silent >/dev/null)
  TARBALL="$(ls "$SCRATCH"/react-native-gtkx-*.tgz)"

  RUNTIME="$SCRATCH/runtime"
  mkdir -p "$RUNTIME"
  cat > "$RUNTIME/package.json" <<EOF
{
  "name": "$PKG-runtime",
  "private": true,
  "dependencies": { "react-native-gtkx": "file:$TARBALL" }
}
EOF
  cp "$APP_CONFIG" "$RUNTIME/gtkx.config.ts"
  cp "$DIST/main.jsbundle" "$RUNTIME/main.jsbundle"

  echo "installing the isolated runtime closure for $EXAMPLE…" >&2
  (cd "$RUNTIME" && npm install --no-audit --no-fund --silent)

  echo "generating the $EXAMPLE codegen store…" >&2
  (cd "$RUNTIME" && node_modules/.bin/gtkx codegen)

  # Keep symlinks as symlinks (don't -L/dereference): codegen's own store
  # links (node_modules/@gtkx/gi -> .gtkx/gi) are relative and some are
  # reflexively cyclic (a store directory linking back to its own package
  # name for resolution) — dereferencing recurses forever. Relative
  # symlinks stay valid once the whole node_modules subtree moves as a
  # unit, which is all that happens here.
  mkdir -p "$STAGE/opt/$PKG"
  cp -a "$RUNTIME/node_modules" "$RUNTIME/gtkx.config.ts" \
    "$RUNTIME/main.jsbundle" "$STAGE/opt/$PKG/"
  # gtkx codegen creates its store (node_modules/.gtkx/{gi,jsx}) 0700 —
  # fine for a per-user dev cache, fatal here: dpkg-deb --root-owner-group
  # ships it root-owned and the installed app runs as a regular user.
  # world-readable/traversable, does not touch already-set exec bits.
  chmod -R a+rX "$STAGE/opt/$PKG"

  cat > "$STAGE/usr/bin/$PKG" <<LAUNCHER
#!/bin/sh
cd "/opt/$PKG" || exit 1
exec node node_modules/react-native-gtkx/dist/runner/host.js main.jsbundle "\$@"
LAUNCHER

  DESCRIPTION_BODY=" An application written against the React Native API on the standard Metro
 toolchain (\`react-native run-linux\`) and rendered as native GTK4/Adwaita
 widgets by react-native-gtkx. Ships its Metro release bundle alongside the
 runtime packages it does not inline (react-native-gtkx, react, yoga-layout)."

else
  echo "missing $DIST/bundle.js or $DIST/main.jsbundle — build the example first" >&2
  exit 1
fi

chmod 755 "$STAGE/usr/bin/$PKG"

cat > "$STAGE/usr/share/applications/$PKG.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=$TITLE
Comment=React Native on the Linux desktop — an example app from react-native-gtkx
Exec=$PKG
Icon=$PKG
Terminal=false
Categories=Utility;Development;
DESKTOP

INSTALLED_SIZE="$(du -sk "$STAGE" --exclude=DEBIAN | cut -f1)"
cat > "$STAGE/DEBIAN/control" <<CONTROL
Package: $PKG
Version: $DEB_VERSION
Architecture: $ARCH
Maintainer: Anton Petrov <anton@itsmepetrov.com>
Installed-Size: $INSTALLED_SIZE
Depends: nodejs (>= 24), libgtk-4-1 (>= 4.20), libadwaita-1-0 (>= 1.8), gir1.2-gtk-4.0, gir1.2-adw-1
Section: misc
Priority: optional
Homepage: https://github.com/itsmepetrov/react-native-gtkx
Description: $TITLE — a react-native-gtkx example
$DESCRIPTION_BODY
CONTROL

mkdir -p "$OUT"
dpkg-deb --build --root-owner-group "$STAGE" \
  "$OUT/${PKG}_${DEB_VERSION}_${ARCH}.deb"
