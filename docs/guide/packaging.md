# Packaging and distribution

The two toolchains take different positions on what stays out of the
bundle, so they hand you different artifacts to ship — and the Metro
path alone offers a choice of three. This page covers what each produces
and how this project's own releases turn those artifacts into `.deb`s
and a single downloadable executable.

## The vite path: one bundle

```bash
gtkx build
```

produces `dist/bundle.js` — everything except the native GTK addon
inlined into one file — plus `dist/gtkx.node` (and
`dist/gschemas.compiled` alongside it, if the app declares a GSettings
schema; the bundle's own banner points `GSETTINGS_SCHEMA_DIR` at its own
directory). That pair is the whole runtime: copy it anywhere with Node
≥ 24, GTK4 ≥ 4.20 and libadwaita ≥ 1.8 (or just GTK4, on the [plain-GTK
profile](plain-gtk.md)) and `node bundle.js` runs it — no `node_modules`
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

Pick **`--standalone`** for anything installed through a package
manager — it's the same shape this project's own `.deb`s ship (a bundle
plus a `nodejs` dependency), and the lightest of the three by any
measure that counts: the plain jsbundle only looks smaller because its
`node_modules` tree isn't weighed. Pick **`--sea`** for "download this
one file and run it," where nothing can be assumed to be installed —
it's `--standalone` with a copy of Node wrapped around it, and that copy
is the entire ~97 MB difference between the two.

The vite path has no `--sea` equivalent: its bundle loads the native
addon through a dynamically obtained `require` a bundler can't intercept
the way it intercepts a static import, and the bundle currently needs
top-level await, which the single-file SEA format can't run. Ship a
vite-path app as its `bundle.js`/`gtkx.node` pair, or as a `.deb`.

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

## What a release actually ships

A tagged release builds `.deb` packages for each example app (both
toolchain shapes, per the [Choosing an artifact](#choosing-an-artifact)
note above) plus one `--sea` executable, zstd-compressed, uploaded
alongside them. The `.deb`s remain how these apps are installed; the
loose executable is there for a machine with no Node to depend on at
all — download it, `zstd -d` it, and run it.

A `.deb` built this way stages either the vite pair (`bundle.js` +
`gtkx.node`, launched with `exec node "/opt/<pkg>/bundle.js"`) or the
`--standalone` script (`exec node "/opt/<pkg>/<name>.cjs"`) under `/opt`,
alongside a `.desktop` entry and an icon, and declares:

```
Depends: nodejs (>= 24), libgtk-4-1 (>= 4.20), libadwaita-1-0 (>= 1.8), gir1.2-gtk-4.0, gir1.2-adw-1
```

Package a [plain-GTK](plain-gtk.md) app the same way and drop
`libadwaita-1-0`/`gir1.2-adw-1` from that line — every example this
project ships today uses the Adw profile, so its own release
pipeline always declares both.
