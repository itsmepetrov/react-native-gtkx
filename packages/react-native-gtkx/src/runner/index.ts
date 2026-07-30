// The `run-linux` CLI command (registered through the package's
// react-native.config.js, the react-native-windows model): ensure the gtkx
// codegen store, then either build a release jsbundle with Metro and run
// it in the Node+GTK host (./host.ts), or — with --dev — start/reuse a
// Metro dev server and supervise the DEV host (./host-dev.ts): Fast
// Refresh applies edits to the live window, and a full-refresh request
// (exit code 65) restarts the host process.
//
// Like the hosts, this module must stay runnable under bare Node:
// builtins and bare specifiers only.
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { basename, dirname, extname, join } from "node:path"
import { fileURLToPath } from "node:url"

const fromPackage = createRequire(import.meta.url)

type CliConfig = { root: string }
type RunLinuxArgs = {
  entryFile: string
  bundleOutput?: string
  skipBundling?: boolean
  dev?: boolean
  port?: string
}

/** Exit code host-dev.ts uses to request a supervisor restart. */
const FULL_REFRESH_EXIT_CODE = 65

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
// packages — run the gtkx CLI from the project that OWNS that node_modules:
// with cwd inside node_modules itself the CLI reports "up to date" without
// ever creating the store.
const ensureCodegenStore = (): void => {
  const hostingNodeModules = dirname(
    dirname(dirname(fromPackage.resolve("@gtkx/react/package.json"))),
  )
  const gtkxRoot = dirname(hostingNodeModules)
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

const isMetroRunning = async (server: string): Promise<boolean> => {
  try {
    const response = await fetch(`${server}/status`)
    return (await response.text()).includes("packager-status:running")
  } catch {
    return false
  }
}

const waitForMetro = async (server: string): Promise<void> => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await isMetroRunning(server)) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  console.error(
    `[react-native-gtkx] Metro dev server never came up (${server}).`,
  )
  process.exit(1)
}

let activeHost: ChildProcess | null = null

const spawnHost = (
  script: string,
  argument: string,
  cwd: string,
): Promise<number> =>
  new Promise((resolve) => {
    // join over `new URL(script, import.meta.url)`: the global URL and the
    // node:url URL come from different type copies when the dependency tree
    // splits @types/node, and the two structurally diverge.
    const hostPath = join(dirname(fileURLToPath(import.meta.url)), script)
    const child = spawn(process.execPath, [hostPath, argument], {
      cwd,
      stdio: "inherit",
    })
    activeHost = child
    child.on("exit", (code) => {
      activeHost = null
      resolve(code ?? 1)
    })
  })

const runLinuxDev = async (
  config: CliConfig,
  args: RunLinuxArgs,
): Promise<never> => {
  const port = args.port ?? "8081"
  const server = `http://localhost:${port}`
  let metro: ChildProcess | null = null
  if (await isMetroRunning(server)) {
    console.warn(
      `[react-native-gtkx] reusing the Metro dev server at ${server}`,
    )
  } else {
    console.warn(
      `[react-native-gtkx] starting the Metro dev server at ${server}…`,
    )
    const appRequire = createRequire(join(config.root, "package.json"))
    metro = spawn(
      process.execPath,
      [
        binOf(appRequire, "react-native", "react-native"),
        "start",
        "--port",
        port,
      ],
      { cwd: config.root, stdio: "inherit" },
    )
    await waitForMetro(server)
  }
  const entry = basename(args.entryFile, extname(args.entryFile))
  const bundleUrl = `${server}/${entry}.bundle?platform=linux&dev=true&minify=false`
  const shutdown = (code: number): never => {
    activeHost?.kill()
    metro?.kill()
    process.exit(code)
  }
  process.on("SIGINT", () => shutdown(0))
  process.on("SIGTERM", () => shutdown(0))
  // Supervisor: a full-refresh request restarts the host with the window
  // reopening on the fresh bundle; any other exit ends the session.
  for (;;) {
    const code = await spawnHost("./host-dev.js", bundleUrl, config.root)
    if (code !== FULL_REFRESH_EXIT_CODE) {
      shutdown(code)
    }
    console.warn("[react-native-gtkx] restarting the app after a full refresh…")
  }
}

const runLinux = async (
  _argv: string[],
  config: CliConfig,
  args: RunLinuxArgs,
): Promise<void> => {
  ensureCodegenStore()
  if (args.dev) {
    await runLinuxDev(config, args)
    return
  }
  const output =
    args.bundleOutput ??
    join(config.root, "node_modules", ".react-native-gtkx", "main.jsbundle")
  if (!args.skipBundling) {
    mkdirSync(dirname(output), { recursive: true })
    bundle(config.root, args.entryFile, output)
  }
  const status = await spawnHost("./host.js", output, config.root)
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
      {
        name: "--dev",
        description:
          "Development mode: Metro dev server + Fast Refresh (edits apply to the live window)",
      },
      {
        name: "--port <number>",
        description: "Metro dev server port for --dev (default: 8081)",
      },
    ],
    func: runLinux,
  },
]
