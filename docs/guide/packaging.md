# Packaging and distribution

Two separate questions: what a **build** produces (a bundle, one for each
toolchain — this page's first half), and how that bundle becomes something
a user installs (a **package** — the second half, one command for both
toolchains: `deploy-linux`). A third option skips packaging entirely:
`--sea`, a single dependency-free file with nothing to install at all.

## The vite path: one bundle

```bash
gtkx build
```

produces `dist/bundle.mjs` — everything except the native GTK addon
inlined into one file — plus `dist/gtkx.node` (and
`dist/gschemas.compiled` alongside it, if the app declares a GSettings
schema; the bundle's own banner points `GSETTINGS_SCHEMA_DIR` at its own
directory). That pair is the whole runtime: copy it anywhere with Node
≥ 24, GTK4 ≥ 4.20 and libadwaita ≥ 1.8 (or just GTK4, on the [plain-GTK
profile](plain-gtk.md)) and `node bundle.mjs` runs it — no `node_modules`
involved.

## The Metro path: `build-linux`

```bash
npx react-native build-linux
```

writes `dist/main.jsbundle` and stops — the release counterpart to
`run-linux` that iOS, Android and react-native-windows already have.
Unlike the vite bundle, this is **not** self-contained: Metro
deliberately keeps `@gtkx/*`, `react` and `yoga-layout` out of the
bundle, since they have to be the exact instances the Node+GTK host
loads, not a second copy Metro inlines. Running `dist/main.jsbundle`
later needs, on top of Node/GTK/libadwaita, a real `node_modules` with
`react-native-gtkx` installed and the app's `gtkx.config.ts` at the
working directory:

```bash
node node_modules/react-native-gtkx/dist/runner/host.js dist/main.jsbundle
```

That's a fine way to run a release bundle from a checkout — any ordinary
`npm install` of the app already has that `node_modules` — but a bad
thing to ship: the closure is not the handful of runtime modules it
sounds like. Packaging it that way once measured **10,515 files, 206
MiB installed** to run a 369 KB bundle, because `react-native-gtkx`'s
install drags its whole build toolchain along. `--standalone` and
`--sea` exist to remove that closure entirely.

### Choosing an artifact

`build-linux` produces three shapes from the same Metro step; the choice
between them is a distribution question, not a different build:

| Flag           | Artifact                   | Needs installed                    | Size (`hn-app`, linux-arm64) |
| -------------- | -------------------------- | ---------------------------------- | ---------------------------- |
| _(none)_       | `dist/main.jsbundle`       | a `node_modules` tree **and** Node | 0.4 MB + the tree            |
| `--standalone` | `dist/<name>.cjs`          | Node only                          | 6.9 MB                       |
| `--sea`        | `dist/<name>` (executable) | nothing at all                     | 104 MB (30 MB compressed)    |

```bash
npx react-native build-linux --standalone     # in the app root
node ./dist/<your-package-name>.cjs           # one script, system node

npx react-native build-linux --sea
./dist/<your-package-name>                    # one executable, nothing else
```

Both flags produce the jsbundle exactly as before, then one additional
file next to it. `--sea-output <path>` overrides where that file goes;
the default is `dist/<package name>` with any npm scope stripped (plus
`.cjs` for `--standalone`).

`--standalone` is what `deploy-linux` (below) builds a `.deb`/`.rpm`/
`.AppImage` from — it is not really a competing choice, it is that
packaging step's own input. Reach for it directly only when you want the
bundle without any packaging around it (a container image, a CI artifact
passed to another step). `--sea` stays the odd one out: "download this
one file and run it," where nothing — not even a package manager — can
be assumed. It's `--standalone` with a copy of Node wrapped around it,
and that copy is the entire ~97 MB difference between the two.

### What `--sea`/`--standalone` need that a plain build doesn't

Both flags inline `virtual:gtkx-config` (which re-exports codegen
output), so — unlike a plain `build-linux`, which needs neither — they
need the gtkx codegen store already generated, and therefore GTK
development headers on the build machine. The `--sea` build also fetches
`postject` through `npx` the first time it runs, so that first build
needs network access.

The native addon (a real `dlopen`ed library) can't be plain bundled JS,
so both artifacts carry it as bytes instead — a SEA asset in the
executable, a base64 literal in the `.cjs` — and extract it to
`$XDG_CACHE_HOME/react-native-gtkx-sea` on first run, keyed by content
hash (falling back to a temp directory if `$HOME` is read-only). Repeat
launches reuse the extracted file.

The `--sea` executable is large mostly because it carries a full copy of
Node: on linux-arm64, `hn-app` measures 104 MB (30 MB zstd-compressed),
of which roughly 98 MB is Node itself — the app code and native addon
together are under 7 MB. The build strips Node's own debug symbols as
part of assembling the executable (best-effort: a build machine without
`binutils` gets a larger executable and a warning, not a failed build),
which is most of what keeps that number from being worse — an
unstripped `node` binary carries about 19 MB of debug information
nothing in a shipped app can use.

## Packaging: `npx react-native deploy-linux`

One command builds real `.deb`/`.rpm`/`.AppImage`/`.flatpak` packages —
validated desktop entry and AppStream metadata, correct per-format
dependencies, an icon installed into the system theme — from either
toolchain. It works from any react-native-gtkx app's own project
directory; which half of it runs is decided for you:

- a project with a `vite.config.*` at its root (the vite path — gallery,
  monitor and every app built with `gtkx dev`/`gtkx build`) proxies
  straight to `npx gtkx deploy`, since that project already looks
  exactly like what `gtkx deploy` expects;
- everything else (the Metro path — an app with `ios`/`android` and
  `run-linux`/`build-linux`) runs a real `--standalone` build first (the
  same step described above), reshapes that output into the same shape a
  vite build would have produced, then hands off to `gtkx deploy --skip-build`
  over it. hn-app is this repo's own example of that path.

```bash
npx react-native deploy-linux --target deb,rpm,appimage
npx react-native deploy-linux --target deb --print-manifests   # metadata only, no packages built
npx react-native deploy-linux --skip-build --target rpm        # package what was already built
```

| Flag                  | Meaning                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `--entry-file <path>` | Metro path only — same meaning as `build-linux`'s (default `index.js`) |
| `--target <formats>`  | Comma-separated: `deb`, `rpm`, `appimage`, `flatpak`                   |
| `--out <path>`        | Output directory, relative to the project root (default `build`)       |
| `--print-manifests`   | Write the desktop-entry/AppStream files, then stop — no packages built |
| `--skip-build`        | Package the already-staged `dist/` instead of rebuilding (see below)   |

`--skip-build` means the same thing on both paths — package what's
already in `dist/`, don't rebuild — but on the Metro path it also skips
this command's own build/staging step, not just `gtkx build`'s; running
it before anything has ever been staged is a clear error, not a
confusing one three layers down.

### The `deploy` config

Both toolchains read the same block from the project's `gtkx.config.ts`:

```ts
export default defineConfig({
  applicationId: "com.example.myapp",
  libraries: ["Gtk-4.0", "Adw-1"],
  deploy: {
    name: "My App",
    summary: "One line describing the app",
    description: "A longer paragraph or two.",
    categories: ["Utility"],
    developer: { name: "Your Name", email: "you@example.com" },
    license: "MIT",
    icons: "icon.svg",
  },
})
```

There is no default: deploying without a `deploy` block is a thrown
error naming exactly which fields to add (derived from `package.json`
where it can guess). `name`/`summary`/`categories` feed a real
`.desktop` entry and AppStream `.metainfo.xml`, validated by
`desktop-file-validate`/`appstreamcli` before anything is packaged — a
category that isn't a real freedesktop one, or two main categories where
only one is allowed, fails the build rather than shipping quietly wrong
metadata. The full schema (screenshots, MIME types, per-target
dependencies, signing, `targets`/`binaryName`/`applicationId` overrides)
is [gtkx's own reference](https://gtkx.dev/guide/deploying); this page
covers what's specific to running it through `deploy-linux`.

### What ships

Every target bundles its own private copy of Node by default
(`deploy.node.source: "download"`, verified against `SHASUMS256.txt`,
cached under `~/.cache/gtkx/node/`) — no `Depends: nodejs` line, at the
cost of roughly 97 MB per package. Measured on linux-arm64, both
toolchains land in the same range because both are dominated by that
bundled runtime: `monitor` (vite) is a 40.3 MB `.deb`; `hn-app` (Metro)
is a 40.7 MB `.deb`, a 40.5 MB `.rpm` and a 36.5 MB `.AppImage`. A `.deb`
declares:

```
Depends: libgtk-4-1, libadwaita-1-0, hicolor-icon-theme, adwaita-icon-theme, gsettings-desktop-schemas, libc6 (>= 2.28)
```

— the glibc floor read directly off the bundled Node's own ELF notes.
Package a [plain-GTK](plain-gtk.md) app the same way and `libadwaita-1-0`
drops out on its own (it comes from the app's declared `libraries`, not
a fixed list). Prefer the old thin-package shape, where the system's own
`nodejs` is a dependency instead of a bundled copy? `deploy.node.source:
"host"` (embed the machine's own Node) or `"path"` (embed a specific
one) are the escape hatch — see the reference linked above.

`deb`/`rpm`/`appimage` need nothing preinstalled beyond a handful of
small system tools (`desktop-file-validate`, `appstreamcli`, `tar`,
`file`, `binutils` optionally for a smaller bundled Node) — the actual
packagers, [nfpm](https://github.com/goreleaser/nfpm) for deb/rpm and
[appimagetool](https://github.com/AppImage/appimagetool), download and
cache themselves under `~/.cache/gtkx` on first use. A missing tool
fails with the exact `apt`/`dnf`/`pacman`/`zypper` command to install it,
detected from `/etc/os-release`. `flatpak` is the heavier target: it
needs `flatpak`/`flatpak-builder` installed and the GNOME `Platform`/
`Sdk` runtime pulled from Flathub before it can build anything (a
one-time, network-bound, multi-hundred-MB fetch) — every example this
project ships deliberately leaves `flatpak` out of its own
`deploy.targets`, proven separately as a build-only artifact instead of
being part of the regular `deb,rpm,appimage` set.

## The vite path's own `--sea`

There isn't one, and `deploy-linux` is why that's no longer the gap it
used to be: the vite bundle loads the native addon through a dynamically
obtained `require` a bundler can't intercept the way it intercepts a
static import, and the bundle needs top-level await, which the
single-file SEA format can't run — both investigated, neither a drop-in
fix. Ship a vite-path app as its `bundle.mjs`/`gtkx.node` pair for
running from a checkout, or package it with `deploy-linux` for
everything else; the gap this used to be (no way to turn a vite app into
something a package manager installs) is what `deploy-linux` closes.
