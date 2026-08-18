#!/usr/bin/env node
// Build a .deb of an example application.
//
// The artifact kind is DECLARED by the caller (--artifact), never inferred
// from which file happens to exist in dist/. That used to be a filename
// probe, and the probe broke the moment a second Metro artifact appeared:
// `build-linux --standalone` writes dist/main.jsbundle AND dist/<name>.cjs,
// so "does main.jsbundle exist" stopped answering "which artifact am I
// packaging" and started silently answering "yes" for both. Declaring the
// kind turns every existsSync below into validation of a stated intent
// rather than the decision itself.
//
// Two kinds ship as a .deb, and both are one bundle plus a `nodejs`
// dependency — the same shape, reached from the two toolchains:
//
//   --artifact vite (examples/monitor, gallery, tasks-app, tasks-nav —
//     `gtkx build`): dist/bundle.mjs + dist/gtkx.node, everything except the
//     native addon inlined. Ships as-is under /opt; `node bundle.mjs` needs
//     nothing else.
//
//   --artifact standalone (examples/hn-app — `react-native build-linux
//     --standalone`): dist/<name>.cjs, ONE file with the whole dependency
//     closure and the native addon inlined (the addon as a base64 literal,
//     extracted to a per-user cache on first run — see the package's
//     src/sea/native-shim.ts).
//
// A third Metro artifact exists and is deliberately NOT packaged here: the
// plain `build-linux` output, dist/main.jsbundle, which is not
// self-contained. Metro keeps @gtkx/*, react and yoga-layout out of the
// bundle (src/metro/index.ts, HOST_MODULE_EXTERNALS), so packaging it means
// shipping a real node_modules beside it, and this script used to build one
// — npm pack, an isolated install, `gtkx codegen`, `cp -a`. Measured on the
// v0.2.0-alpha.1 release that produced: 10,515 files and 206 MiB installed
// to run a 369 KB bundle, because the runtime closure of react-native-gtkx
// drags its BUILD toolchain along (typescript, @swc, rolldown, babel,
// lightningcss). --standalone is that same app as a single 6.9 MB file, so
// the closure-building has no reason left to exist.
//
// The app must be built first (npm run build in the example; for hn-app
// that is `react-native build-linux --standalone`).
// usage: build-deb.ts <example> <app-title> <version> <out-dir> --artifact <kind>
//   e.g. build-deb.ts monitor "System Monitor" 0.1.0-alpha.1 debs --artifact vite
//        build-deb.ts hn-app "Hacker News" 0.1.0-alpha.1 debs --artifact standalone
import { execFileSync } from "node:child_process"
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/** The artifact kinds this script knows how to package. */
const ARTIFACTS = ["vite", "standalone"] as const
type Artifact = (typeof ARTIFACTS)[number]

const usage =
  "usage: build-deb.ts <example> <app-title> <version> <out-dir> " +
  `--artifact <${ARTIFACTS.join("|")}>`

const argv = process.argv.slice(2)
const artifactIndex = argv.indexOf("--artifact")
const artifactArg = artifactIndex === -1 ? undefined : argv[artifactIndex + 1]
const positional =
  artifactIndex === -1 ? argv : argv.toSpliced(artifactIndex, 2)
const [example, title, version, out] = positional

const isArtifact = (value: string | undefined): value is Artifact =>
  ARTIFACTS.includes(value as Artifact)

if (!example || !title || !version || !out || !isArtifact(artifactArg)) {
  console.error(usage)
  process.exit(1)
}
const artifact: Artifact = artifactArg

const ROOT = join(import.meta.dirname, "..")
const APP = join(ROOT, "examples", example)
const DIST = join(APP, "dist")

/**
 * The basename `build-linux --standalone` gives its artifact: the app's
 * package name with any npm scope stripped, so hn-app writes
 * dist/hn-app.cjs. Deliberately re-derived from package.json the same way
 * the runner's appBinaryName() does, rather than assumed to equal the
 * example directory name — the two are free to differ, and reading the
 * manifest is how the file got its name in the first place.
 */
const standaloneName = (): string => {
  const manifest = JSON.parse(
    readFileSync(join(APP, "package.json"), "utf8"),
  ) as { name?: string }
  const name = manifest.name?.split("/").pop()
  if (!name) {
    throw new Error(`${APP}/package.json has no usable "name"`)
  }
  return `${name}.cjs`
}

const PKG = `react-native-gtkx-${example}`
const ARCH = execFileSync("dpkg", ["--print-architecture"], {
  encoding: "utf8",
}).trim()
// Debian versions use ~ for prereleases (sorts before the release).
const DEB_VERSION = version.replaceAll("-", "~")
const STAGE = mkdtempSync(join(tmpdir(), "build-deb-stage-"))

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

  /** Stages one built file under /opt/<PKG>, failing loudly if the declared
   * artifact kind did not actually produce it. 0644 explicitly: dpkg-deb
   * ships whatever mode the staged file carries, and copyFileSync inherits
   * the source's, which came from whichever bundler wrote it. */
  const stage = (name: string): void => {
    const source = join(DIST, name)
    if (!existsSync(source)) {
      console.error(
        `missing ${source} — --artifact ${artifact} needs it; build the example first`,
      )
      process.exit(1)
    }
    const target = join(STAGE, "opt", PKG, name)
    copyFileSync(source, target)
    chmodSync(target, 0o644)
  }

  if (artifact === "vite") {
    stage("bundle.mjs")
    stage("gtkx.node")
    // tasks-app (and any future GSettings-using app) also emits a compiled
    // schema; bundle.mjs's own banner points GSETTINGS_SCHEMA_DIR at its own
    // directory, so copying it alongside is the only thing needed.
    if (existsSync(join(DIST, "gschemas.compiled"))) {
      stage("gschemas.compiled")
    }

    writeFileSync(
      launcherPath,
      `#!/bin/sh\nexec node "/opt/${PKG}/bundle.mjs" "$@"\n`,
    )

    descriptionBody = ` An application written against the React Native API and rendered as native
 GTK4/Adwaita widgets by react-native-gtkx. Ships as a single Node bundle
 with the gtkx native addon.`
  } else {
    const script = standaloneName()
    stage(script)

    // No `cd` into /opt first, unlike the jsbundle launcher this replaced:
    // that one had to run from the app directory so the host could resolve
    // node_modules and read gtkx.config.ts at startup. A --standalone build
    // resolved the config at BUNDLE time and carries its whole closure, so
    // it has nothing to look up next to itself and inherits the user's
    // working directory like any other program.
    writeFileSync(
      launcherPath,
      `#!/bin/sh\nexec node "/opt/${PKG}/${script}" "$@"\n`,
    )

    descriptionBody = ` An application written against the React Native API on the standard Metro
 toolchain (\`react-native build-linux --standalone\`) and rendered as native
 GTK4/Adwaita widgets by react-native-gtkx. Ships as a single self-contained
 script with the gtkx native addon embedded.`
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
}
