// The gtkx native addon (@gtkx/native-<platform>-<libc>, a Rust/NAPI addon
// loaded through dlopen — see docs/guide/packaging.md for the shipped
// behavior, and this file's own comments below for the full design
// reasoning) cannot be embedded as bundled JS:
// a Node SEA is a V8 code cache blob, and dlopen needs a real file on a
// real filesystem, not bytes inside the executable.
//
// So it has to be carried as bytes and written back to disk before use.
// This plugin swaps every import of a given specifier (in practice,
// "@gtkx/native" — see ../sea/bundle.ts) for a shim that does exactly
// that: extract to a per-user cache directory (content-hash-keyed, so
// repeat launches reuse the file instead of re-extracting ~1.6 MB every
// start) and dlopen it from there. Where the bytes come from is the one
// difference between the two single-file artifacts — Node's SEA "assets"
// mechanism for the executable, a base64 literal for the standalone .cjs;
// see {@link NativeAddonSource}.
//
// Cache location: XDG_CACHE_HOME (or ~/.cache) first, os.tmpdir() as a
// fallback for a read-only $HOME. Deliberately NOT the SEA executable's
// own directory — that may be read-only (a mounted image, a root-owned
// install under /opt) or simply a different place than where the addon
// was extracted the first time, if the binary moved. This is the same
// question gtkx's own tutorial answers by placing the addon BESIDE the
// executable (dist/gtkx.node next to dist/app) — a real divergence, not an
// oversight: that keeps two files, which is exactly what this epic set
// out to stop doing.
import { join } from "node:path"
import type { Plugin } from "rolldown"

export const NATIVE_ASSET_KEY = "gtkx-native.node"

/**
 * Where the shim gets the addon's bytes from — the only difference between
 * the two single-file artifacts:
 *
 * - `"sea-asset"`: from the SEA blob, via node:sea. Only works inside a
 *   real single executable.
 * - `"inline"`: from a base64 literal in the bundle itself, so the CJS
 *   file is self-contained under a plain `node app.cjs` — the same
 *   artifact minus the embedded Node runtime. Costs ~4/3 of the addon's
 *   size in source text (the addon is ~1.6 MB) and is parsed once at
 *   startup; the extraction and dlopen below are shared.
 */
export type NativeAddonSource = "sea-asset" | "inline"

const bytesExpression = (
  source: NativeAddonSource,
  assetKey: string,
): string =>
  source === "sea-asset"
    ? `Buffer.from(require("node:sea").getAsset(${JSON.stringify(assetKey)}))`
    : `Buffer.from(__gtkxNativeBase64, "base64")`

const shimSource = (
  source: NativeAddonSource,
  assetKey: string,
  base64: string,
): string => `
const { createHash } = require("node:crypto");
const { mkdirSync, existsSync, writeFileSync, renameSync } = require("node:fs");
const { join } = require("node:path");
const os = require("node:os");
${source === "inline" ? `const __gtkxNativeBase64 = ${JSON.stringify(base64)};` : ""}

const bytes = ${bytesExpression(source, assetKey)};
const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
const fileName = "native-" + hash + ".node";

const candidateDirs = [
  join(process.env.XDG_CACHE_HOME || join(os.homedir(), ".cache"), "react-native-gtkx-sea"),
  join(os.tmpdir(), "react-native-gtkx-sea"),
];

let target;
let lastError;
for (const dir of candidateDirs) {
  try {
    mkdirSync(dir, { recursive: true });
    const candidate = join(dir, fileName);
    if (!existsSync(candidate)) {
      const tmp = candidate + "." + process.pid + ".tmp";
      writeFileSync(tmp, bytes, { mode: 0o755 });
      renameSync(tmp, candidate);
    }
    target = candidate;
    break;
  } catch (error) {
    lastError = error;
  }
}
if (!target) {
  throw new Error(
    "react-native-gtkx: could not extract the native addon to a writable " +
      "cache directory (tried " + candidateDirs.join(", ") + "): " + String(lastError),
  );
}

// Not require(target): the require() available to a SEA's main script is
// restricted to built-ins and embedded assets (verified — requiring an
// arbitrary absolute path from here throws ERR_UNKNOWN_BUILTIN_MODULE, the
// same error Node throws for an unrecognized built-in specifier). That
// restriction doesn't apply to process.dlopen(), the lower-level
// primitive require() itself uses for ".node" files (Module._extensions
// [".node"]) — it works on any real path, which is exactly what makes
// this shim work at all. The "inline" build could use a plain require()
// here, but shares dlopen() rather than branching: one code path that is
// proven by both artifacts beats two, one of which is rarely exercised.
const nativeModule = { exports: {} };
process.dlopen(nativeModule, target);
// The vite path's own build (dist/bundle.mjs, gtkx's CLI plugin) calls
// this immediately after loading the addon, before anything else touches
// it; @gtkx/runtime's compiled JS never calls it itself (confirmed by
// inspecting its dist — it only re-exports a handful of low-level
// functions), so ordinary require() of the addon through Node's own
// napi module registration must be relying on something dlopen() alone
// does not trigger. Without this call the addon has no thread registered
// as "the Node environment's owner" and the first GTK-driven callback
// into JS panics: "the Node environment was accessed from a thread it is
// not installed on" (reproduced and fixed by adding this line).
nativeModule.exports.init();
module.exports = nativeModule.exports;
`

export type NativeAddonShimOptions = {
  /** The bare specifier to replace, in practice "@gtkx/native". */
  specifier: string
  /** The app root — the shim's id lives here, see above. */
  appRoot: string
  /** Where the addon's bytes come from at runtime. */
  source: NativeAddonSource
  /** SEA asset key; unused when `source` is "inline". */
  assetKey?: string
  /** The addon's bytes; required when `source` is "inline". */
  addonBytes?: Buffer
}

/**
 * Intercepts every import/require of `specifier` (an exact bare module
 * specifier, e.g. "@gtkx/native") and replaces it with the extraction shim
 * above. The real module never reaches the bundle graph — only its
 * re-exported surface, loaded from the extracted file at runtime.
 *
 * The shim is given an id inside `appRoot` with a `.cjs` extension rather
 * than a `\0`-prefixed virtual one: the shim IS CommonJS (it assigns
 * `module.exports` so consumers' NAMED imports of the addon still resolve
 * through the bundler's interop), and a real directory is what lets any
 * specifier inside it resolve normally.
 */
export const nativeAddonShimPlugin = (
  options: NativeAddonShimOptions,
): Plugin => {
  const { specifier, appRoot, source } = options
  if (source === "inline" && !options.addonBytes) {
    throw new Error('the "inline" native addon source needs addonBytes')
  }
  const shimId = join(appRoot, "__gtkx-sea-native-shim.cjs")
  const contents = shimSource(
    source,
    options.assetKey ?? NATIVE_ASSET_KEY,
    options.addonBytes?.toString("base64") ?? "",
  )
  return {
    name: "gtkx-native-addon-shim",
    resolveId: (id) => (id === specifier ? shimId : null),
    load: (id) => (id === shimId ? contents : null),
  }
}
