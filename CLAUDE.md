# CLAUDE.md

react-native-gtkx: React Native for the Linux desktop — the `react-native`
API rendered as native GTK4/Adwaita widgets via gtkx (React reconciler +
FFI) and Yoga (WASM) for layout. Linux is an RN out-of-tree platform here:
`npx react-native run-linux` next to `run-ios`/`run-android`.

## Ground rules

- **RN semantics are the contract.** Match react-native behavior exactly;
  every deviation is documented in docs/api.md (Differences column). When
  in doubt, check what RN/react-native-windows/react-native-web do.
- **All `@gtkx/*` imports live ONLY in
  `packages/react-native-gtkx/src/gtkx/bridge/`** (eslint-enforced).
  gtkx is an RC dependency — API drift is absorbed in the bridge; each
  workaround carries an `RC3-WORKAROUND(<name>)` tag and a row in
  docs/gtkx-rc3-notes.md.
- **Imports are extensionless** (`moduleResolution: "Bundler"`, never
  NodeNext). Files that bare Node executes (`src/runner/*`, `src/metro`,
  `src/vite`) must be self-contained: node builtins, bare specifiers and
  the package self-reference only — no relative imports in them.
- **Packages ship compiled**: one tsc emit of the whole `src` → `dist/`
  (d.ts next to JS, sources embedded in maps); no sources in the tarball.
  Subpaths (`/metro`, `/vite`, `/runner`, `/types`) are folders of the
  same emit.
- TypeScript everywhere, including configs. Prettier: no semicolons.
  Comments and docs in English (Russian only in fixtures that
  deliberately exercise non-Latin text).

## Workflows

- Linux-only work (typecheck, GTK tests, build:dist, running apps) happens
  in the UTM VM — use the `vm` skill. Two recurring traps: `npm install`
  prunes the codegen store (re-run `npm run codegen`), and dist is never
  synced (re-run `npm run build:dist` in the VM).
- Before committing, walk the `verify` skill checklist.
- `npm test` runs everything everywhere (the GTK vitest project
  auto-skips off Linux); `test:unit` / `test:gtk` filter.

## Repository rules

- Commits: meaningful English, why over what, no internal task numbers,
  no Co-Authored-By trailers, no private infrastructure (hosts, users) —
  machine config goes to `scripts/local/` (gitignored).
- `.claude/` is local except `.claude/skills/` (the only committed part).

## Map

- `packages/react-native-gtkx` — the platform: `src/components` (RN
  surface), `src/apis`, `src/style` (layout/visual split → Yoga + GTK
  CSS), `src/layout` (Yoga engine), `src/gtkx/bridge` (the only @gtkx
  door), `src/metro|vite|runner` (toolchain subpaths), `tests/unit` +
  `tests/gtk`.
- `examples/` — gallery (whole surface), rn-app (cli-init, three
  platforms), playground, profile(+web). `template/` — Linux-first
  starter.
- `docs/` — api.md (surface + differences, gated by docs:check),
  getting-started, research/ (measured findings behind design decisions).
- `spike/rn-platform` — the platform's living probe app (dev-mode
  regression scripts run against it).
