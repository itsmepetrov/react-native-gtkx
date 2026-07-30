# Spike: Metro bundle executed by the Node+GTK host — GO

A minimal RN app bundles with the STANDARD React Native toolchain
(`react-native bundle --platform linux`) and runs in our Node+GTK host: the
window opens, `Platform.OS === "linux"`, the `.linux.ts` platform extension
wins over the generic module, `Platform.select` takes the linux branch,
interaction works. Bundle size for the spike app: ~100 KB (externals stay
host-side).

## Versions validated

- react-native 0.86.2, react 19.2.3 (RN's peer), @react-native-community/cli ^20
- @react-native/babel-preset 0.86.2 + @babel/plugin-transform-export-namespace-from
- @react-native/metro-config 0.86.2
- Node 24 in the VM; the host needs `module.registerHooks` → **Node ≥ 22.15**

## The mechanism (what the platform must productize)

1. **react-native → react-native-gtkx**: `resolver.resolveRequest` rewrites
   the specifier when `platform === "linux"`. The `react-native.config.js`
   platform declaration (npmPackageName) alone does NOT do this for
   `bundle` — the Metro preset must.
2. **Externals** (Metro cannot bundle them; the host injects
   `global.__hostModules` before executing the bundle):
   - `@gtkx/*` — NAPI bindings and codegen-backed namespaces (11 specifiers
     used by the package today; the preset should scan or keep the list);
   - `react`, `react/jsx-runtime`, `react/jsx-dev-runtime` — the app and the
     reconciler inside @gtkx/react MUST share one React instance;
   - `yoga-layout` — WASM.
     Proxies are generated at Metro-config load time
     (`module.exports = global.__hostModules["<name>"]`).
3. **Node builtins are a platform feature**: any `isBuiltin()` specifier
   resolves to a lazy proxy `global.__hostRequire(name)` — apps on this
   platform may use the whole Node API, no pre-registration.
4. **InitializeCore must be skipped**:
   `serializer.getModulesRunBeforeMainModule = () => []`. RN's default
   prepends mobile-environment polyfills (Hermes Promise, nativeLoggingHook
   console) — our environment IS Node; nothing to initialize. No other
   polyfills/globals were needed — the release bundle ran as-is under
   `vm.runInThisContext`.
5. **Babel**: the RN preset chokes on `export * as Ns from` (used by our
   gtkx-bridge at spike time) — the spike added
   `@babel/plugin-transform-export-namespace-from`. OBSOLETE since: the
   bridge switched to import-then-export, consumer Babel configs stay
   completely stock.
6. **virtual:gtkx-config**: @gtkx/react imports it (JSX metadata re-export +
   applicationId); in the vite path the gtkx CLI plugin serves it. The host
   replicates it with `module.registerHooks` (resolve+load): source =
   `export * from "@gtkx/jsx/metadata"` + `applicationId` from
   `loadConfig(cwd)` (@gtkx/config). The fake module URL must be anchored
   inside the package dir so the bare re-export specifier resolves through
   node_modules. **Upstream ask**: export `renderConfigModule`/a Node
   register entry from @gtkx/config so hosts don't hand-roll this.
7. **React singleton invariant**: the host resolves `react` FROM
   `@gtkx/react`'s real location (two-level `createRequire` anchoring) and
   `@gtkx/*` from the react-native-gtkx package — never from the app dir,
   or npm's peer auto-install would split the React instance.
8. **Symlinked package**: `watchFolders` must include the monorepo root
   (file: deps are symlinks; Metro follows them but must watch the target).
9. **Entry starts the app**: index.js calls
   `AppRegistry.runApplication(...)` itself when `Platform.OS === "linux"`
   — the react-native-web index.web.js pattern. The GLib main loop keeps
   the process alive; no extra host lifecycle code needed.
10. **Per-app gtkx.config.ts** (applicationId, libraries) — same requirement
    as the vite path; `loadConfig` reads it from the app cwd.

## Repro

```
npm install
npx react-native run-linux   # codegen ensure -> Metro bundle -> GTK window
# in the VM: bash run-headless.sh (same product path under headless sway)
```

The spike's original hand-rolled host.mjs has been productized into the
package (dist/runner: host + the run-linux command) — this app now runs
through the real thing.

## Implications for the epic

- 002 (dist): Metro consumed the TS sources directly through the babel
  preset — shipping `src` with a `react-native` mainField is viable; dist
  (JS+d.ts) still wanted for types and non-Metro consumers. The exports map
  must keep `./package.json` accessible (CLI reads it).
- 003 (preset): everything in "the mechanism" above except the host side;
  the externals proxy dir belongs under the app's .gtkx/metro cache, not the
  repo. `getModulesRunBeforeMainModule` override ships in the preset.
- 004 (runner): host.mjs IS the runner skeleton (hooks → inject → execute);
  add codegen ensure, friendly errors, bundle-then-run orchestration for
  `run-linux`.
- Known deviation to document: deep imports
  (`react-native/Libraries/...`) are not supported — only the public
  `react-native` surface.
