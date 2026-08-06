# Globals

React Native installs a global environment at startup before any app code
runs. This platform's runtime is Node, so most of that environment already
exists natively; the rest is installed once, from the package's own entry
point, before the app tree renders — the one place both the Metro and vite
toolchains agree on, since both alias `"react-native"` onto this package.

## Already native, nothing to install

Node already provides `fetch`/`Headers`/`Request`/`Response`, `Blob`/`File`,
`WebSocket`, `URL`/`URLSearchParams`, `AbortController`/`AbortSignal`,
`structuredClone`, `TextEncoder`/`TextDecoder`, `atob`/`btoa`,
`queueMicrotask`, `setImmediate`/`clearImmediate`, a monotonic `performance`,
`crypto`, `DOMException`, and `console` (including `group`/`groupCollapsed`/
`groupEnd`, which RN's own console polyfill only ever adds on a native
runtime). `FormData` is native too, but not RN-compatible in one specific
way: it does not understand react-native's own file-entry shape
(`formData.append('photo', { uri, type, name })`) — an object there is
coerced to the literal string `"[object Object]"` instead of attaching a
file. `XMLHttpRequest` and `FileReader` are not Node-native at all and are
not installed by this platform, unlike RN, which installs both
unconditionally; reach for `fetch` and `Blob`'s own `.text()`/
`.arrayBuffer()`/`.stream()` instead.

## Installed for parity

Each of these is installed only if nothing already provides it, so an
existing global always wins:

- **`window = globalThis`, `self = globalThis`** — the same thing RN's own
  bootstrap does first. An isomorphic library's `typeof window !==
"undefined"` check — usually meaning "not a server context, safe to run
  browser-shaped init" — reads the same way here as on any other RN
  platform.
- **`navigator.product = "ReactNative"`** — the ecosystem's standard
  environment-detection value. Node already ships a minimal `navigator`
  (`.userAgent` only) from version 21 on; this adds `product` next to it
  rather than replacing the object, matching RN's own fallback behavior
  exactly.
- **`requestIdleCallback`/`cancelIdleCallback`** — the standard web-fallback
  shape every userland polyfill uses: fires on the next macrotask, reports a
  fixed 50&nbsp;ms budget through `timeRemaining()`, and `didTimeout` is
  always `false`. This is "run this off the current tick, eventually," not a
  real idle-scheduling primitive — code that depends on genuine idle
  detection should not rely on it.
- **`global.alert`** — forwards a single string to `Alert.alert('Alert',
text)`, against this platform's own `Alert` module (see
  [APIs](apis.md#alert)).
- **`ErrorUtils`** — `setGlobalHandler`/`reportError`/`reportFatalError`/
  `applyWithGuard`/`guard`, a faithful port of RN's own polyfill. The default
  handler rethrows, exactly RN's un-hooked behavior. Both toolchains provide
  it, so code that expects `global.ErrorUtils` to exist (which several
  RN-ecosystem libraries do) finds it either way.
- **`requestAnimationFrame`/`cancelAnimationFrame`** — installed as globals,
  not module exports, exactly as RN installs them from its own bootstrap
  rather than exporting them from `"react-native"`. Both ride the same frame
  clock `Animated` and the Reanimated-compatible surface already share, not a
  second timer. A call returns an id; the callback receives a monotonic,
  high-resolution timestamp; a callback requested while a batch is already
  running lands on the next frame, never the one currently flushing;
  cancelling is silent, including for an unknown or already-delivered handle;
  and one callback throwing is reported without stopping its siblings in the
  same batch. Differs from react-native only in mechanism, not in behavior —
  there is no native per-platform frame source on a Linux desktop, so this
  rides the same clock `Animated` runs on, the way the DOM's own
  `requestAnimationFrame` stands in for it on react-native-web.

## `__DEV__`

Provided by the bundler, not by this module. The vite preset defines it from
vite's own build mode; the Metro path gets it from the app's own stock
`@react-native/metro-config` preset, independent of this platform's own
Metro wrapper.

## Not installed, by architecture

React Native's Fabric-era DOM-compatibility globals — `Node`, `Element`,
`HTMLElement`, `Document`, `Event`, `EventTarget`, `CustomEvent`,
`DOMRect(ReadOnly/List)`, `HTMLCollection`, `NodeList` — exist to back
Fabric's DOM-traversal API over its C++ shadow tree. This platform has
neither Fabric nor a shadow tree of its own — its React reconciler drives
GTK widgets and the Yoga layout tree directly — so there is no shadow tree
for a DOM-shaped facade to expose, and none of these globals are installed.

## The runtime itself

Every module of npm and Node is available at runtime — `fs`, `sqlite`,
native addons — so a "native module" here is written as an ordinary Node
module rather than as platform-specific native code. An RN library whose
native side is genuinely iOS/Android code (rather than pure JavaScript) does
not run here. The package itself ships compiled — ESM plus `.d.ts` files,
sources embedded in the maps — and requires Node ≥ 24, the floor both the
gtkx runtime and the `run-linux` host rely on.
