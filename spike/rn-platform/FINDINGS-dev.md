# Spike: Fast Refresh in the GTK host (dev-mode phase) — GO

Edits to App.tsx apply to the LIVE GTK window with component state
preserved: the scripted probe changed a marker while a 1 Hz ticker kept
counting (3 → 12, never reset), and the error probe showed a readable
Metro TransformError followed by full recovery after the fix (ticks
survived the whole break/fix cycle, 1 → 18).

Repro (in the VM): `bash run-dev-headless.sh` (happy path),
`bash run-dev-error-probe.sh` (error + recovery). Host: `dev-host.mjs`.

## The division of labor (verified against sources, not guessed)

1. **metro-runtime's dev require does almost everything.** If the host
   provides `global.__ReactRefresh`, the require polyfill scopes
   `$RefreshReg$`/`$RefreshSig$` per module, registers exports after every
   factory, and `global.__accept` (module redefinition) computes refresh
   boundaries and calls `performReactRefresh` debounced. The host object
   is `{...require("react-refresh/runtime"), performFullRefresh}` — the
   runtime lacks only `performFullRefresh` (exit 65 in the spike; the 002
   supervisor turns that into a restart).
2. **metro-runtime's HMRClient is reusable verbatim**
   (`metro-runtime/src/modules/HMRClient`, CJS deep import): speaks the
   `/hot` websocket protocol (register-entrypoints → update-start /
   update / update-done / error, heartbeat every 20 s), evals update
   snippets via plain `eval`. Node ≥ 22 has the global WebSocket it
   expects — zero dependencies.
3. **The host's own additions** on top of the release host:
   - `RefreshRuntime.injectIntoGlobalHook(globalThis)` BEFORE loading
     @gtkx/react — the reconciler registers into the patched hook;
   - `NODE_ENV=development` — react and react-reconciler must run their
     DEV builds or refresh is a no-op;
   - fetch `index.bundle?platform=linux&dev=true&minify=false` over HTTP
     and run it (same vm.runInThisContext);
   - connect HMRClient, `register-entrypoints` with the bundle URL,
     `enable()`.
4. **gtkx's refresh-runtime/refresh-tracker are NOT needed on the Metro
   path** — that machinery re-implements per-module scoping for vite's
   module ids; metro-runtime already does it for Metro module ids. No
   upstream ask required for this epic.
5. **Metro errors arrive on the socket** as `{type: "error"}` with a
   readable `message` (TransformError + SyntaxError with file:line) —
   printing `body.type` + `body.message` is enough for a usable terminal
   experience. After a fix Metro pushes the next update on its own; no
   client-side resubscription needed.

## Implications for 002 (run-linux --dev)

- Dev host = release host + the four additions above; same single-build,
  bare-Node rules (react-refresh and metro-runtime resolve from the APP's
  node_modules — they ship with react-native).
- Supervisor: restart the host on exit code 65 (performFullRefresh) and
  on Metro `reload` messages; start Metro if `/status` is not
  `packager-status:running`, otherwise reuse.
- The state-file assertion pattern (app writes to /tmp via node:fs) makes
  the whole dev loop scriptable — reuse it for the 002 regression run.
