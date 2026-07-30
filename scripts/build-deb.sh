#!/usr/bin/env bash
# Build a .deb of an example application: the gtkx bundle (bundle.js +
# gtkx.node for the current arch) under /opt, a launcher in /usr/bin and a
# .desktop entry. The app must be built first (npm run build in the example).
# usage: build-deb.sh <example> <app-title> <version> <out-dir>
#   e.g. build-deb.sh monitor "System Monitor" 0.1.0-alpha.1 /tmp/debs
set -euo pipefail

EXAMPLE="${1:?usage: build-deb.sh <example> <app-title> <version> <out-dir>}"
TITLE="${2:?missing app title}"
VERSION="${3:?missing version}"
OUT="${4:?missing out dir}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/examples/$EXAMPLE/dist"
[ -f "$DIST/bundle.js" ] || {
  echo "missing $DIST/bundle.js — build the example first" >&2
  exit 1
}

PKG="react-native-gtkx-$EXAMPLE"
ARCH="$(dpkg --print-architecture)"
# Debian versions use ~ for prereleases (sorts before the release).
DEB_VERSION="${VERSION//-/\~}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

install -d "$STAGE/DEBIAN" "$STAGE/opt/$PKG" "$STAGE/usr/bin" \
  "$STAGE/usr/share/applications" "$STAGE/usr/share/icons/hicolor/scalable/apps"

cp "$DIST/bundle.js" "$DIST/gtkx.node" "$STAGE/opt/$PKG/"
cp "$ROOT/docs/icon.svg" "$STAGE/usr/share/icons/hicolor/scalable/apps/$PKG.svg"

cat > "$STAGE/usr/bin/$PKG" <<LAUNCHER
#!/bin/sh
exec node "/opt/$PKG/bundle.js" "\$@"
LAUNCHER
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
Depends: nodejs (>= 22.15), libgtk-4-1 (>= 4.20), libadwaita-1-0 (>= 1.8), gir1.2-gtk-4.0, gir1.2-adw-1
Section: misc
Priority: optional
Homepage: https://github.com/itsmepetrov/react-native-gtkx
Description: $TITLE — a react-native-gtkx example
 An application written against the React Native API and rendered as native
 GTK4/Adwaita widgets by react-native-gtkx. Ships as a single Node bundle
 with the gtkx native addon.
CONTROL

mkdir -p "$OUT"
dpkg-deb --build --root-owner-group "$STAGE" \
  "$OUT/${PKG}_${DEB_VERSION}_${ARCH}.deb"
