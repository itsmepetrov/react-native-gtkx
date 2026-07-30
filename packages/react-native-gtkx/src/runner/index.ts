// The `run-linux` CLI command (registered through the package's
// react-native.config.js, the react-native-windows model): ensure the gtkx
// codegen store, build the jsbundle with Metro for --platform linux, then
// execute it in the Node+GTK host (./host.ts, spawned as a fresh process so
// the GTK app never shares the CLI's process state).
//
// Like host.ts, this module must stay runnable under bare Node: builtins
// and bare specifiers only.
import { spawnSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const fromPackage = createRequire(import.meta.url)

type CliConfig = { root: string }
type RunLinuxArgs = {
  entryFile: string
  bundleOutput?: string
  skipBundling?: boolean
}

const run = (command: string, args: string[], cwd: string): number => {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" })
  return result.status ?? 1
}

/** Resolve an executable script shipped by a dependency's bin field. */
const binOf = (
  requireFrom: NodeJS.Require,
  packageName: string,
  binName: string,
): string => {
  const packageJsonPath = requireFrom.resolve(`${packageName}/package.json`)
  const manifest = requireFrom(`${packageName}/package.json`) as {
    bin?: string | Record<string, string>
  }
  const bin =
    typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[binName]
  if (!bin) {
    throw new Error(`${packageName} does not expose a "${binName}" binary`)
  }
  return join(dirname(packageJsonPath), bin)
}

// The codegen store lives in the node_modules that hosts the @gtkx
// packages — run the gtkx CLI from that tree's root so the store lands
// next to the bindings that read it.
const ensureCodegenStore = (): void => {
  const gtkxRoot = dirname(
    dirname(dirname(fromPackage.resolve("@gtkx/react/package.json"))),
  )
  console.warn("[react-native-gtkx] ensuring gtkx codegen store…")
  const status = run(
    process.execPath,
    [binOf(fromPackage, "@gtkx/cli", "gtkx"), "codegen"],
    gtkxRoot,
  )
  if (status !== 0) {
    console.error(
      "[react-native-gtkx] gtkx codegen failed — are GTK4/libadwaita " +
        "development files installed?",
    )
    process.exit(status)
  }
}

const bundle = (root: string, entryFile: string, output: string): void => {
  const appRequire = createRequire(join(root, "package.json"))
  const status = run(
    process.execPath,
    [
      binOf(appRequire, "react-native", "react-native"),
      "bundle",
      "--platform",
      "linux",
      "--dev",
      "false",
      "--entry-file",
      entryFile,
      "--bundle-output",
      output,
    ],
    root,
  )
  if (status !== 0) {
    process.exit(status)
  }
}

const runLinux = (
  _argv: string[],
  config: CliConfig,
  args: RunLinuxArgs,
): void => {
  const output =
    args.bundleOutput ??
    join(config.root, "node_modules", ".react-native-gtkx", "main.jsbundle")
  ensureCodegenStore()
  if (!args.skipBundling) {
    mkdirSync(dirname(output), { recursive: true })
    bundle(config.root, args.entryFile, output)
  }
  const hostPath = fileURLToPath(new URL("./host.js", import.meta.url))
  const status = run(process.execPath, [hostPath, output], config.root)
  process.exit(status)
}

/** Commands contributed to the RN CLI by the package's react-native.config.js. */
export const commands = [
  {
    name: "run-linux",
    description:
      "Bundle the app with Metro for the linux platform and run it in the Node+GTK host",
    options: [
      {
        name: "--entry-file <path>",
        description: "Path to the app entry file",
        default: "index.js",
      },
      {
        name: "--bundle-output <path>",
        description:
          "Where to write the jsbundle (default: node_modules/.react-native-gtkx/main.jsbundle)",
      },
      {
        name: "--skip-bundling",
        description: "Reuse the existing bundle at --bundle-output",
      },
    ],
    func: runLinux,
  },
]
