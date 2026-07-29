// Metro config for the linux platform spike. Two jobs on top of RN defaults:
//
// 1. Redirect `react-native` -> `react-native-gtkx` when bundling for linux
//    (what the out-of-tree npmPackageName promises; done explicitly here so
//    the spike controls and documents the whole mechanism).
// 2. EXTERNALIZE host-side singletons. Unlike RNW/macOS, whose native side
//    lives outside the JS bundle by construction, our "native" is Node
//    modules with NAPI bindings (@gtkx/*) plus yoga-layout's WASM — Metro
//    cannot bundle those. react/jsx-runtime must also stay host-side: the
//    reconciler inside @gtkx/react and the app MUST share one React
//    instance. Each external resolves to a generated proxy module that
//    reads the real thing from global.__hostModules (injected by host.mjs
//    before the bundle runs).
const { getDefaultConfig } = require("@react-native/metro-config")
const fs = require("node:fs")
const { isBuiltin } = require("node:module")
const path = require("node:path")

const EXTERNALS = [
  "@gtkx/css",
  "@gtkx/gi/adw",
  "@gtkx/gi/gdk",
  "@gtkx/gi/gio",
  "@gtkx/gi/glib",
  "@gtkx/gi/graphene",
  "@gtkx/gi/gsk",
  "@gtkx/gi/gtk",
  "@gtkx/gi/pango",
  "@gtkx/jsx/gtk",
  "@gtkx/react",
  "@gtkx/runtime",
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "yoga-layout",
]

const proxyDir = path.join(__dirname, "externals")
const proxyFile = (name) => path.join(proxyDir, name.replace(/[@/]/g, "_") + ".js")

fs.mkdirSync(proxyDir, { recursive: true })
for (const name of EXTERNALS) {
  fs.writeFileSync(
    proxyFile(name),
    // The host guarantees __hostModules before executing the bundle.
    `module.exports = global.__hostModules[${JSON.stringify(name)}];\n`,
  )
}

const config = getDefaultConfig(__dirname)

// The package is a symlink into the monorepo — Metro must watch the repo.
config.watchFolders = [path.resolve(__dirname, "../..")]

// RN's default config prepends react-native/Libraries/Core/InitializeCore
// (mobile environment polyfills: Hermes Promise, nativeLoggingHook console…).
// Our runtime IS Node — the host provides the environment, nothing to
// initialize inside the bundle.
config.serializer.getModulesRunBeforeMainModule = () => []

config.resolver.platforms = [
  ...new Set([...(config.resolver.platforms ?? []), "linux"]),
]

// Node builtins (node:fs and friends) are a platform FEATURE — apps on this
// platform may use the whole Node API. Their proxies go through the host's
// require, so the set stays open-ended (no pre-registration needed).
const builtinProxy = (name) => {
  const file = proxyFile(name.replace(/:/g, "_"))
  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      `module.exports = global.__hostRequire(${JSON.stringify(name)});\n`,
    )
  }
  return { type: "sourceFile", filePath: file }
}

const externalSet = new Set(EXTERNALS)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "linux") {
    if (externalSet.has(moduleName)) {
      return { type: "sourceFile", filePath: proxyFile(moduleName) }
    }
    if (isBuiltin(moduleName)) {
      return builtinProxy(moduleName)
    }
    if (moduleName === "react-native" || moduleName.startsWith("react-native/")) {
      return context.resolveRequest(
        context,
        moduleName.replace(/^react-native/, "react-native-gtkx"),
        platform,
      )
    }
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
