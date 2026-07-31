// CLI entry for scripts/build-sea.sh: bundles a Metro-built app into a
// single CJS file ready for `node --experimental-sea-config`. Not exposed
// as a react-native-gtkx/CLI command (unlike run-linux/build-linux) — it
// mirrors gtkx's own tutorial, which ships its SEA tooling as plain
// scripts too, not a CLI surface; see ./bundle.ts's header for the design.
//
// Usage: node dist/sea/cli.js metro --app-root <dir> --jsbundle <path> --out <path>
//
// Prints one JSON line on success: { nativeAddonPath, nativeAddonKey } —
// what scripts/build-sea.sh needs to write sea-config.json's "assets".
import { resolve } from "node:path"
import { bundleMetroSea } from "./bundle.js"

const args = process.argv.slice(2)
const mode = args[0]

// Args may be relative to the caller's cwd (scripts/build-sea.sh passes
// paths relative to the repo root); resolve everything to absolute paths
// up front since createRequire and esbuild's stdin.resolveDir require them.
const flag = (name: string): string => {
  const index = args.indexOf(`--${name}`)
  const value = index === -1 ? undefined : args[index + 1]
  if (!value) {
    throw new Error(`missing --${name}`)
  }
  return resolve(process.cwd(), value)
}

const usage =
  "usage: cli.js metro --app-root <dir> --jsbundle <path> --out <path>"

const main = async (): Promise<void> => {
  if (mode !== "metro") {
    throw new Error(usage)
  }
  const appRoot = flag("app-root")
  const jsbundlePath = flag("jsbundle")
  const outFile = flag("out")
  const nativeAddon = await bundleMetroSea({ appRoot, jsbundlePath, outFile })
  process.stdout.write(
    `${JSON.stringify({
      nativeAddonPath: nativeAddon.path,
      nativeAddonKey: nativeAddon.key,
    })}\n`,
  )
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error)
  console.error(`[build-sea] ${message}`)
  process.exit(1)
})
