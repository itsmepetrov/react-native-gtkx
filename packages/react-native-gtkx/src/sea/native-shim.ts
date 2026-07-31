// The gtkx native addon (@gtkx/native-<platform>-<libc>, a Rust/NAPI addon
// loaded through dlopen — see docs/getting-started.md's "Shipping an app"
// section for the full design reasoning) cannot be embedded as bundled JS:
// a Node SEA is a V8 code cache blob, and dlopen needs a real file on a
// real filesystem, not bytes inside the executable.
//
// Node's SEA "assets" mechanism embeds arbitrary bytes in the blob and
// hands them back through node:sea at runtime. This plugin swaps every
// static import of a given specifier (in practice, "@gtkx/native" — see
// ../sea/bundle.ts) for a shim that extracts the embedded asset to a
// per-user cache directory (content-hash-keyed, so repeat launches reuse
// the same file instead of re-extracting ~1.6MB every start) and requires
// it from there.
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

const shimSource = (assetKey: string): string => `
const { getAsset } = require("node:sea");
const { createHash } = require("node:crypto");
const { mkdirSync, existsSync, writeFileSync, renameSync } = require("node:fs");
const { join } = require("node:path");
const os = require("node:os");

const bytes = Buffer.from(getAsset(${JSON.stringify(assetKey)}));
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
// this shim work at all.
const nativeModule = { exports: {} };
process.dlopen(nativeModule, target);
// The vite path's own build (dist/bundle.js, gtkx's CLI plugin) calls
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
  specifier: string,
  appRoot: string,
  assetKey: string = NATIVE_ASSET_KEY,
): Plugin => {
  const shimId = join(appRoot, "__gtkx-sea-native-shim.cjs")
  return {
    name: "gtkx-native-addon-shim",
    resolveId: (source) => (source === specifier ? shimId : null),
    load: (id) => (id === shimId ? shimSource(assetKey) : null),
  }
}
