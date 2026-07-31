// Turns a Metro-built app into ONE executable file: bundle everything into
// a CJS entry (./bundle.ts), generate a SEA blob from it, then inject that
// blob into a copy of the `node` binary. This is the whole of what "SEA"
// means — Node's Single Executable Application format is literally a copy
// of the node binary with a V8 code-cache blob appended, which is why the
// result necessarily carries Node's own weight (~117 MB on linux-arm64,
// against <7 MB for the app code and its native addon).
//
// Follows gtkx's own tutorial (gtkx-org/gtkx examples/tutorial/scripts/
// build-sea.sh) for these mechanics; ./bundle.ts's header documents where
// the bundling half deliberately diverges.
//
// Kept out of ../runner/index.ts and reached through a dynamic import: it
// pulls in esbuild, which is an OPTIONAL peer here — an app that never
// builds a SEA must not need it installed to run `build-linux`.
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { bundleMetroSea } from "./bundle.js"

/** The fuse postject looks for inside the node binary to place the blob. */
const SENTINEL_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"

/** Pinned: postject has no stable release, and the SEA docs name this one. */
const POSTJECT = "postject@1.0.0-alpha.6"

export type AssembleSeaOptions = {
  /** The app root — where gtkx.config.ts and package.json live. */
  appRoot: string
  /** The release jsbundle `build-linux` just wrote. */
  jsbundlePath: string
  /** Where the finished executable is written. */
  outFile: string
  /** Scratch directory for the intermediate CJS bundle, the SEA config and
   * the prep blob (default: alongside the jsbundle). */
  workDir?: string
}

const run = (command: string, args: string[]): void => {
  const result = spawnSync(command, args, { stdio: "inherit" })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`)
  }
}

/**
 * Produces a single executable at {@link AssembleSeaOptions.outFile} and
 * returns its size in bytes. Requires network access on first run unless
 * postject is already in the npx cache.
 */
export const assembleSea = async (
  options: AssembleSeaOptions,
): Promise<number> => {
  const { appRoot, jsbundlePath, outFile } = options
  const workDir = options.workDir ?? dirname(jsbundlePath)
  mkdirSync(workDir, { recursive: true })
  mkdirSync(dirname(outFile), { recursive: true })

  console.warn("[react-native-gtkx] bundling for a single executable…")
  const bundlePath = join(workDir, "sea-bundle.cjs")
  const nativeAddon = await bundleMetroSea({
    appRoot,
    jsbundlePath,
    outFile: bundlePath,
  })
  console.warn(`[react-native-gtkx]   native addon: ${nativeAddon.path}`)

  const configPath = join(workDir, "sea-config.json")
  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        main: bundlePath,
        output: join(workDir, "sea-prep.blob"),
        disableExperimentalSEAWarning: true,
        assets: { [nativeAddon.key]: nativeAddon.path },
      },
      null,
      2,
    )}\n`,
  )

  console.warn("[react-native-gtkx] generating the SEA blob…")
  run(process.execPath, ["--experimental-sea-config", configPath])

  console.warn("[react-native-gtkx] copying the node binary…")
  copyFileSync(process.execPath, outFile)
  if (process.platform === "darwin") {
    // The copy inherits a signature that no longer matches once the blob
    // is injected; macOS refuses to exec it until the signature is gone.
    run("codesign", ["--remove-signature", outFile])
  }

  console.warn("[react-native-gtkx] injecting the SEA blob…")
  run("npx", [
    "--yes",
    "--ignore-scripts",
    POSTJECT,
    outFile,
    "NODE_SEA_BLOB",
    join(workDir, "sea-prep.blob"),
    "--sentinel-fuse",
    SENTINEL_FUSE,
  ])

  chmodSync(outFile, 0o755)
  return statSync(outFile).size
}
