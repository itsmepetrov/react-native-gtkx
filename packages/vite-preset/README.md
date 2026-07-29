# @react-native-gtkx/vite-preset

A vite preset that makes a gtkx project "RN-compatible":

- **alias** `react-native` → `react-native-gtkx` (including subpaths: `react-native/foo` → `react-native-gtkx/foo`);
- **platform extensions** with Metro semantics for extensionless imports: `.linux.tsx` → `.linux.ts` → `.linux.jsx` → `.linux.js` → `.native.tsx` → … → the base file (resolved by the standard vite resolver); platform-specific directory index files are supported too (`./menu` → `menu/index.linux.tsx`);
- **gtkx dev mode**: `react-native-gtkx` is added to `ssr.noExternal` so its TypeScript sources go through the vite pipeline instead of a plain node import (`gtkx dev` sets `ssr.external: true`).

## Setup

gtkx CLI rc.1 (`gtkx dev` and `gtkx build`) launches vite itself but does not disable config discovery (`configFile: false` is not passed) — so a regular `vite.config.ts` in the project root is picked up automatically and merged with the CLI config (on conflict the CLI wins, plugin arrays are concatenated).

```ts
// vite.config.ts
import { reactNativeGtkx } from "@react-native-gtkx/vite-preset"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [reactNativeGtkx()],
})
```

Nothing else is needed: `gtkx dev` / `gtkx build` work as usual.

## Options

```ts
reactNativeGtkx({
  // platform priority, from specific to general
  platforms: ["linux", "native"],
  // extensions tried for each platform
  extensions: ["tsx", "ts", "jsx", "js"],
})
```

## Resolution semantics

- only **extensionless** imports participate — relative (`./Comp`, `../shared/Comp`) and absolute paths; `./Comp.tsx` is taken literally;
- bare package imports (`lodash`, `@scope/pkg`) do not go through platform resolution;
- if no platform file exists, the plugin hands the import to the standard vite resolver (the base `Comp.tsx`);
- vite `?query` suffixes are preserved.

The pure resolution functions (`rewriteReactNativeImport`, `platformCandidates`, `resolvePlatformSpecifier`, and others) are exported from the package and covered by unit tests without starting a vite server.

## Known limitation: tree-shaking `Platform.select`

The branches of `Platform.select({ ios, android, ... })` are an argument of a runtime call, and
the bundler (rolldown) does **not** eliminate them (verified with a dead-branch marker in the
production bundle). For a desktop Node bundle the size is not critical; if DCE is ever needed,
the fork in the road is: replace `Platform.OS` with the literal "linux" via a transform plugin
(define inlining) before minification.
