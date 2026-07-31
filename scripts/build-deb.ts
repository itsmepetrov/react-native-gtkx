#!/usr/bin/env node
// Build a .deb of an example application. Two source shapes exist:
//
//   vite path (examples/monitor, gallery, tasks-app — `gtkx build`):
//     dist/bundle.js + dist/gtkx.node, everything except the native addon
//     inlined. Ships as-is under /opt, `node bundle.js` needs nothing else.
//
//   Metro path (examples/hn-app — `react-native build-linux`):
//     dist/main.jsbundle only. Metro deliberately keeps @gtkx/*, react and
//     yoga-layout OUT of the bundle (see packages/react-native-gtkx's
//     src/metro/index.ts, HOST_MODULE_EXTERNALS) — they have to be the same
//     instances the Node+GTK host itself loads. So the target machine needs
//     a real node_modules too, and this script builds one: `npm pack` the
//     local react-native-gtkx (never the stale registry version — we may be
//     packaging the release that publishes it), install that tarball in an
//     isolated scratch project (a `file:` reference to the directory would
//     silently resolve through the monorepo's own hoisted node_modules and
//     prove nothing), run `gtkx codegen` there, and stage the result next to
//     the bundle. Validated by hand in the VM before being encoded here:
//     built, isolated-installed, codegen'd and launched inside a real
//     desktop session — see .claude/epics/metro-production-build.
//
// The app must be built first (npm run build in the example).
// usage: build-deb.ts <example> <app-title> <version> <out-dir>
//   e.g. build-deb.ts monitor "System Monitor" 0.1.0-alpha.1 /tmp/debs
import { execFileSync } from "node:child_process"
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const usage = "usage: build-deb.ts <example> <app-title> <version> <out-dir>"
const [example, title, version, out] = process.argv.slice(2)
if (!example || !title || !version || !out) {
  console.error(usage)
  process.exit(1)
}

const ROOT = join(import.meta.dirname, "..")
const DIST = join(ROOT, "examples", example, "dist")

const PKG = `react-native-gtkx-${example}`
const ARCH = execFileSync("dpkg", ["--print-architecture"], {
  encoding: "utf8",
}).trim()
// Debian versions use ~ for prereleases (sorts before the release).
const DEB_VERSION = version.replaceAll("-", "~")
const STAGE = mkdtempSync(join(tmpdir(), "build-deb-stage-"))
const SCRATCH = mkdtempSync(join(tmpdir(), "build-deb-scratch-"))

try {
  // `install -d`, not mkdirSync: it gives auto-created parents and the
  // explicit target directories different default modes (0755 leaves,
  // umask-derived parents), and dpkg-deb bakes those modes into the package
  // verbatim — worth matching exactly rather than hand-rolling the same
  // distinction.
  execFileSync("install", [
    "-d",
    join(STAGE, "DEBIAN"),
    join(STAGE, "opt", PKG),
    join(STAGE, "usr/bin"),
    join(STAGE, "usr/share/applications"),
    join(STAGE, "usr/share/icons/hicolor/scalable/apps"),
  ])
  copyFileSync(
    join(ROOT, "docs/icon.svg"),
    join(STAGE, "usr/share/icons/hicolor/scalable/apps", `${PKG}.svg`),
  )

  const launcherPath = join(STAGE, "usr/bin", PKG)
  let descriptionBody = ""

  if (existsSync(join(DIST, "bundle.js"))) {
    // --- vite path -------------------------------------------------------
    copyFileSync(join(DIST, "bundle.js"), join(STAGE, "opt", PKG, "bundle.js"))
    copyFileSync(join(DIST, "gtkx.node"), join(STAGE, "opt", PKG, "gtkx.node"))
    // tasks-app (and any future GSettings-using app) also emits a compiled
    // schema; bundle.js's own banner points GSETTINGS_SCHEMA_DIR at its own
    // directory, so copying it alongside is the only thing needed.
    const gschemas = join(DIST, "gschemas.compiled")
    if (existsSync(gschemas)) {
      copyFileSync(gschemas, join(STAGE, "opt", PKG, "gschemas.compiled"))
    }

    writeFileSync(
      launcherPath,
      `#!/bin/sh\nexec node "/opt/${PKG}/bundle.js" "$@"\n`,
    )

    descriptionBody = ` An application written against the React Native API and rendered as native
 GTK4/Adwaita widgets by react-native-gtkx. Ships as a single Node bundle
 with the gtkx native addon.`
  } else if (existsSync(join(DIST, "main.jsbundle"))) {
    // --- Metro path --------------------------------------------------------
    const rngDist = join(ROOT, "packages/react-native-gtkx/dist")
    if (!existsSync(rngDist)) {
      console.error(`missing ${rngDist} — run npm run build:dist first`)
      process.exit(1)
    }
    const appConfig = join(ROOT, "examples", example, "gtkx.config.ts")
    if (!existsSync(appConfig)) {
      console.error(`missing ${appConfig} — a Metro-path app needs one`)
      process.exit(1)
    }

    console.error("packing the local react-native-gtkx build…")
    // Glob the result rather than parse npm pack's stdout: the package's own
    // prepack script (README sync) prints a notice line first, so the
    // tarball filename is not reliably "the whole output".
    execFileSync(
      "npm",
      [
        "pack",
        "-w",
        "react-native-gtkx",
        "--pack-destination",
        SCRATCH,
        "--silent",
      ],
      {
        cwd: ROOT,
        stdio: ["ignore", "ignore", "inherit"],
      },
    )
    const tarballName = readdirSync(SCRATCH).find(
      (name) => name.startsWith("react-native-gtkx-") && name.endsWith(".tgz"),
    )
    if (!tarballName) {
      throw new Error(
        `npm pack did not produce a react-native-gtkx-*.tgz in ${SCRATCH}`,
      )
    }
    const tarball = join(SCRATCH, tarballName)

    const runtime = join(SCRATCH, "runtime")
    mkdirSync(runtime, { recursive: true })
    writeFileSync(
      join(runtime, "package.json"),
      `{
  "name": "${PKG}-runtime",
  "private": true,
  "dependencies": { "react-native-gtkx": "file:${tarball}" }
}
`,
    )
    copyFileSync(appConfig, join(runtime, "gtkx.config.ts"))
    copyFileSync(join(DIST, "main.jsbundle"), join(runtime, "main.jsbundle"))

    console.error(`installing the isolated runtime closure for ${example}…`)
    execFileSync("npm", ["install", "--no-audit", "--no-fund", "--silent"], {
      cwd: runtime,
      stdio: "inherit",
    })

    console.error(`generating the ${example} codegen store…`)
    execFileSync(join(runtime, "node_modules/.bin/gtkx"), ["codegen"], {
      cwd: runtime,
      stdio: "inherit",
    })

    // Keep symlinks as symlinks (don't dereference): codegen's own store
    // links (node_modules/@gtkx/gi -> .gtkx/gi) are relative and some are
    // reflexively cyclic (a store directory linking back to its own package
    // name for resolution) — dereferencing recurses forever. `cp -a`, not
    // fs.cpSync, for the same reason this script prefers `install -d` over
    // mkdirSync elsewhere: real, already-debugged tool behavior beats a
    // hand-rolled equivalent for a case this subtle.
    execFileSync("cp", [
      "-a",
      join(runtime, "node_modules"),
      join(runtime, "gtkx.config.ts"),
      join(runtime, "main.jsbundle"),
      join(STAGE, "opt", PKG),
    ])
    // gtkx codegen creates its store (node_modules/.gtkx/{gi,jsx}) 0700 —
    // fine for a per-user dev cache, fatal here: dpkg-deb --root-owner-group
    // ships it root-owned and the installed app runs as a regular user.
    // world-readable/traversable, does not touch already-set exec bits.
    execFileSync("chmod", ["-R", "a+rX", join(STAGE, "opt", PKG)])

    writeFileSync(
      launcherPath,
      `#!/bin/sh\ncd "/opt/${PKG}" || exit 1\nexec node node_modules/react-native-gtkx/dist/runner/host.js main.jsbundle "$@"\n`,
    )

    descriptionBody = ` An application written against the React Native API on the standard Metro
 toolchain (\`react-native run-linux\`) and rendered as native GTK4/Adwaita
 widgets by react-native-gtkx. Ships its Metro release bundle alongside the
 runtime packages it does not inline (react-native-gtkx, react, yoga-layout).`
  } else {
    console.error(
      `missing ${DIST}/bundle.js or ${DIST}/main.jsbundle — build the example first`,
    )
    process.exit(1)
  }

  chmodSync(launcherPath, 0o755)

  writeFileSync(
    join(STAGE, "usr/share/applications", `${PKG}.desktop`),
    `[Desktop Entry]
Type=Application
Name=${title}
Comment=React Native on the Linux desktop — an example app from react-native-gtkx
Exec=${PKG}
Icon=${PKG}
Terminal=false
Categories=Utility;Development;
`,
  )

  const installedSize = execFileSync("du", ["-sk", STAGE, "--exclude=DEBIAN"], {
    encoding: "utf8",
  })
    .split("\t")[0]
    ?.trim()

  writeFileSync(
    join(STAGE, "DEBIAN/control"),
    `Package: ${PKG}
Version: ${DEB_VERSION}
Architecture: ${ARCH}
Maintainer: Anton Petrov <anton@itsmepetrov.com>
Installed-Size: ${installedSize}
Depends: nodejs (>= 24), libgtk-4-1 (>= 4.20), libadwaita-1-0 (>= 1.8), gir1.2-gtk-4.0, gir1.2-adw-1
Section: misc
Priority: optional
Homepage: https://github.com/itsmepetrov/react-native-gtkx
Description: ${title} — a react-native-gtkx example
${descriptionBody}
`,
  )

  mkdirSync(out, { recursive: true })
  execFileSync(
    "dpkg-deb",
    [
      "--build",
      "--root-owner-group",
      STAGE,
      join(out, `${PKG}_${DEB_VERSION}_${ARCH}.deb`),
    ],
    {
      stdio: "inherit",
    },
  )
} finally {
  rmSync(STAGE, { recursive: true, force: true })
  rmSync(SCRATCH, { recursive: true, force: true })
}
