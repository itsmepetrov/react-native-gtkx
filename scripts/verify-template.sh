#!/usr/bin/env bash
# Container-side: end-to-end check of the project template — install with
# local workspace deps, build via gtkx (vite preset does the react-native
# alias + platform extensions), then screenshot the running app.
set -euo pipefail

(cd /work/packages/vite-preset && npx tsc -p tsconfig.build.json)

TPL=/tmp/tpl
rm -rf "$TPL"
cp -r /work/template "$TPL"
cd "$TPL"

node - <<'EOF'
const fs = require("node:fs")
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"))
pkg.dependencies["react-native-gtkx"] = "file:/work/packages/react-native-gtkx"
pkg.devDependencies ??= {}
pkg.devDependencies["@react-native-gtkx/vite-preset"] =
  "file:/work/packages/vite-preset"
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2))
EOF

# --install-links copies file: deps instead of symlinking, so their own
# dependencies (@gtkx/react etc.) install into the template's node_modules —
# matching what a registry install will do once the package is published.
INSTALL_START=$SECONDS
npm install --install-links --no-audit --no-fund >install.log 2>&1 || {
  tail -5 install.log
  exit 1
}

# Treeshake probe: a dead ios branch marker; grepped in the bundle below.
cat > src/treeshake-probe.ts <<'PROBE'
import { Platform } from "react-native"

export const probeValue: string = Platform.select({
  ios: "__DEAD_IOS_BRANCH__",
  default: "linux-alive",
})
PROBE
sed -i '1i import { probeValue } from "./treeshake-probe"\nconsole.log(probeValue)' src/index.tsx
npx gtkx codegen >codegen.log 2>&1 || true
echo "--- store layout ---"
ls node_modules/.gtkx 2>/dev/null || echo "(no store)"
ls node_modules/.gtkx/jsx 2>/dev/null || echo "(no jsx)"
tail -3 codegen.log

npx gtkx build >build.log 2>&1 || {
  tail -15 build.log
  exit 1
}
echo "TEMPLATE BUILD OK"
echo "TIME install+build: $((SECONDS - INSTALL_START))s"

if grep -q "__DEAD_IOS_BRANCH__" dist/bundle.js; then
  echo "TREESHAKE: dead ios branch PRESENT in bundle"
else
  echo "TREESHAKE: dead ios branch ELIMINATED"
fi

bash /work/scripts/app-shot.sh "$TPL" /work/template.png 640x480
echo "TIME install..window: $((SECONDS - INSTALL_START))s"

# Dev-mode smoke: `gtkx dev` (vite dev server + app process) must come up and
# present a window. Fast Refresh itself is exercised manually via VNC.
export DISPLAY=:95
Xvfb :95 -screen 0 640x480x24 &
XVFB2=$!
sleep 1
dbus-run-session -- timeout 20 npx gtkx dev >dev.log 2>&1 &
DEV=$!
sleep 12
import -display :95 -window root /work/template-dev.png && echo "DEV SMOKE OK"
kill $DEV 2>/dev/null || true
kill $XVFB2 2>/dev/null || true
tail -3 dev.log
