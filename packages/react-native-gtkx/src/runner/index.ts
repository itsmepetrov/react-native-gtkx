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
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { basename, dirname, extname, join } from "node:path"
import { fileURLToPath } from "node:url"

type CliConfig = { root: string }
type RunLinuxArgs = {
  entryFile: string
  bundleOutput?: string
  skipBundling?: boolean
  dev?: boolean
  port?: string
}
type BuildLinuxArgs = {
  entryFile: string
  bundleOutput?: string
  standalone?: boolean
  sea?: boolean
  seaOutput?: string
}
type DeployLinuxArgs = {
  entryFile: string
  target?: string
  out?: string
  printManifests?: boolean
  skipBuild?: boolean
}

/** Exit code host-dev.ts uses to request a supervisor restart. */
const FULL_REFRESH_EXIT_CODE = 65

const fail = (message: string): never => {
  console.error(`[react-native-gtkx] ${message}`)
  process.exit(1)
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

type PackageManifest = { version: string; exports?: Record<string, unknown> }

/** The `@gtkx/react` subpath exports (its own `exports` map, minus `.` and `./package.json`). */
const reactSubexportsOf = (manifest: PackageManifest): string[] =>
  Object.keys(manifest.exports ?? {})
    .filter((key) => key.startsWith("./") && key !== "./package.json")
    .map((key) => key.slice(2))

// @gtkx/cli is meant for apps: its `codegen` command resolves gtkx.config.ts
// from a cwd and trusts a freshness stamp, which is what the retired rc.2-era
// workaround this replaced was dodging (running from a reconstructed "project that owns
// the hosting node_modules" purely to keep that cwd resolution honest — see
// gtkx-org/gtkx#468, #470). A library generating bindings on a consumer's
// behalf should use the programmatic @gtkx/codegen API instead: it takes the
// GIR libraries and store paths directly, so there is no cwd to get wrong and
// no stamp to misread — and it runs its own fingerprint-based freshness
// check in-process, so a missing/pruned store is regenerated rather than
// misreported as "up to date".
//
// `root` (the app's real project root, resolved by the react-native CLI, not
// us) is the right place to resolve gtkx.config.ts from, but NOT necessarily
// where @gtkx/* actually lives on disk: in a workspace, npm hoists them to an
// ancestor's node_modules, so `root/node_modules` can be a directory with no
// @gtkx/* in it at all (confirmed against this repo's own examples/, which
// are workspace members with nothing hoisted locally). The store — and the
// @gtkx/gi and @gtkx/jsx links every other @gtkx/* package resolves through
// its OWN up-the-tree lookup — must live in whichever node_modules actually
// hosts @gtkx/runtime, so that's resolved rather than assumed.
const ensureCodegenStore = async (root: string): Promise<void> => {
  console.warn("[react-native-gtkx] ensuring gtkx codegen store…")
  try {
    const [{ runCodegen, resolveGirPath, resolveLibraries }, { loadConfig }] =
      await Promise.all([import("@gtkx/codegen"), import("@gtkx/config")])
    const { config } = await loadConfig(root)
    if (config.codegen === false) {
      console.warn(
        "[react-native-gtkx] codegen: disabled for this project (gtkx.config.ts)",
      )
      return
    }
    const girPath = resolveGirPath(config.girPath)
    const libraries = resolveLibraries(config.libraries, girPath)
    const appRequire = createRequire(join(root, "package.json"))
    const runtimePackageJsonPath = appRequire.resolve(
      "@gtkx/runtime/package.json",
    )
    const nodeModules = dirname(dirname(dirname(runtimePackageJsonPath)))
    const runtime = appRequire(runtimePackageJsonPath) as PackageManifest
    const react = appRequire("@gtkx/react/package.json") as PackageManifest
    const result = await runCodegen({
      libraries,
      girPath,
      gi: {
        storeDir: join(nodeModules, ".gtkx", "gi"),
        linkDir: join(nodeModules, "@gtkx", "gi"),
        version: runtime.version,
      },
      jsx: {
        storeDir: join(nodeModules, ".gtkx", "jsx"),
        linkDir: join(nodeModules, "@gtkx", "jsx"),
        version: react.version,
      },
      reactSubexports: reactSubexportsOf(react),
    })
    console.warn(
      result.isRegenerated
        ? "[react-native-gtkx] codegen: regenerated stale bindings"
        : "[react-native-gtkx] codegen: bindings up to date",
    )
  } catch (error) {
    console.error(
      "[react-native-gtkx] gtkx codegen failed — are GTK4/libadwaita " +
        "development files installed?",
    )
    console.error(error)
    process.exit(1)
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
  await ensureCodegenStore(config.root)
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

/**
 * The executable name a `--sea` build defaults to: the app's package name
 * without its scope, so the artifact is `dist/hn-app`, not `dist/app`.
 */
const appBinaryName = (root: string): string => {
  try {
    const manifest = createRequire(join(root, "package.json"))(
      "./package.json",
    ) as { name?: string }
    const name = manifest.name?.split("/").pop()
    return name && /^[\w.-]+$/.test(name) ? name : "app"
  } catch {
    return "app"
  }
}

// The android/ios counterpart to run-linux's dev-only bundling: bundle for
// distribution and stop, the way a release APK/IPA build does not launch
// the app it produces. Deliberately skips ensureCodegenStore() — codegen
// generates the @gtkx/gi bindings host.js imports to talk to GTK at RUN
// time; bundling never touches them (Metro only reads/transforms JS, and
// the GTK/react/yoga modules are proxied rather than imported — see
// ../metro's HOST_MODULE_EXTERNALS). A machine that only builds never needs
// GTK dev headers installed.
//
// --standalone and --sea are the exception: both inline
// "virtual:gtkx-config", which re-exports @gtkx/jsx/metadata — a codegen
// product — so they DO need the store, and therefore GTK dev headers.
// Only those paths ensure it.
//
// The three artifacts, cheapest to heaviest, are deliberately one command
// with flags rather than three commands: they share the Metro bundle step,
// and the choice between them is a distribution question, not a different
// build.
//   (default)     main.jsbundle  + a runtime node_modules + a system node
//   --standalone  one .cjs file, no node_modules, + a system node
//   --sea         one executable, nothing preinstalled at all
const buildLinux = async (
  _argv: string[],
  config: CliConfig,
  args: BuildLinuxArgs,
): Promise<void> => {
  if (args.sea || args.standalone) {
    await ensureCodegenStore(config.root)
  }
  const output = args.bundleOutput ?? join(config.root, "dist", "main.jsbundle")
  mkdirSync(dirname(output), { recursive: true })
  bundle(config.root, args.entryFile, output)
  console.warn(`[react-native-gtkx] wrote the release bundle to ${output}`)
  if (!args.sea && !args.standalone) {
    return
  }
  const name = appBinaryName(config.root)
  const seaOutput =
    args.seaOutput ?? join(config.root, "dist", args.sea ? name : `${name}.cjs`)
  // Dynamically imported so the bundler is never loaded on the ordinary
  // jsbundle path.
  const { assembleSea, bundleStandalone } = await import("../sea/assemble.js")
  const bytes = args.sea
    ? await assembleSea({
        appRoot: config.root,
        jsbundlePath: output,
        outFile: seaOutput,
      })
    : await bundleStandalone({
        appRoot: config.root,
        jsbundlePath: output,
        outFile: seaOutput,
      })
  const megabytes = (bytes / 1024 / 1024).toFixed(0)
  console.warn(
    args.sea
      ? `[react-native-gtkx] wrote the single executable to ${seaOutput} ` +
          `(${megabytes} MB — Node itself is most of it)`
      : `[react-native-gtkx] wrote the standalone script to ${seaOutput} ` +
          `(${megabytes} MB — run it with \`node ${seaOutput}\`)`,
  )
}

// `deploy-linux`: `npx gtkx deploy` packages a project's `dist/` into
// .deb/.rpm/.AppImage/.flatpak, but it is vite-shaped by construction — its
// payload stager (@gtkx/cli's stagePayload) unconditionally requires
// `dist/bundle.mjs` and copies the rest of `dist/` verbatim, `--skip-build`
// included. A Metro app never produces that file (Metro externalizes
// @gtkx/*/react/yoga-layout instead of inlining them — see ../metro's
// HOST_MODULE_EXTERNALS), so `gtkx deploy` cannot package one on its own.
// This command is the bridge: on the vite path it is a thin proxy (the app
// already looks exactly like what `gtkx deploy` expects); on the Metro path
// it builds a real Metro release, reshapes that build into the same
// dist/bundle.mjs shape a vite build would have produced, and only then
// calls into `gtkx deploy --skip-build`.
//
// Registered the same way as run-linux/build-linux (react-native.config.js),
// so the RN CLI exposes it to every app that depends on react-native-gtkx —
// regardless of which toolchain that particular app actually builds with:
// `npx react-native config` from a vite-path example already lists
// run-linux/build-linux today (confirmed against examples/monitor, which has
// no `react-native` dependency of its own — the command surface comes along
// because react-native-gtkx is a dependency, and this workspace happens to
// hoist `react-native` where every example's own `npx` lookup can still find
// it). So this command has to tell the two toolchains apart itself; neither
// run-linux nor build-linux do that today (they are Metro-only by
// construction), so there is no existing helper to reuse — see
// isViteProject below for the detection this command invents.

/** Every extension `gtkx.config.ts` is allowed to use (c12's own candidate
 * list, mirrored rather than imported since @gtkx/config does not export
 * it) — used only for the friendlier "you're missing one" error below;
 * @gtkx/config's own loader remains the actual authority. */
const GTKX_CONFIG_CANDIDATES = ["ts", "js", "mjs", "cjs", "mts", "cts"].map(
  (extension) => `gtkx.config.${extension}`,
)

const hasGtkxConfig = (root: string): boolean =>
  GTKX_CONFIG_CANDIDATES.some((name) => existsSync(join(root, name)))

/** Vite's own convention for "this directory is a vite project" — every
 * vite-path example in this repo (gallery, monitor, tasks-app, tasks-nav)
 * has exactly one of these at its root, and no Metro app does (hn-app and
 * rn-app have `metro.config.js` and a root `index.js` instead). Exported so
 * the detection itself is unit-testable without spawning anything. */
export const VITE_CONFIG_CANDIDATES = [
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.mts",
]

export const isViteProject = (root: string): boolean =>
  VITE_CONFIG_CANDIDATES.some((name) => existsSync(join(root, name)))

/** `--target`/`--out`/`--print-manifests` — passed through unchanged to
 * `gtkx deploy` on both paths. `--skip-build` is handled separately by each
 * path below: it means something different on each (see deployLinuxMetro). */
const commonDeployArgs = (args: DeployLinuxArgs): string[] => {
  const passthrough: string[] = []
  if (args.target !== undefined) {
    passthrough.push("--target", args.target)
  }
  if (args.out !== undefined) {
    passthrough.push("--out", args.out)
  }
  if (args.printManifests) {
    passthrough.push("--print-manifests")
  }
  return passthrough
}

const runGtkxDeploy = (root: string, args: string[]): number => {
  const appRequire = createRequire(join(root, "package.json"))
  return run(
    process.execPath,
    [binOf(appRequire, "@gtkx/cli", "gtkx"), "deploy", ...args],
    root,
  )
}

// The vite path IS what `gtkx deploy` already expects — no build of ours to
// run, no staging to do. A missing gtkx.config.ts or `deploy` block surfaces
// through gtkx's own error (stdio is inherited below), which already names
// exactly what to add and where (a ready-to-paste `deploy` block derived
// from package.json for the latter).
const deployLinuxVite = (config: CliConfig, args: DeployLinuxArgs): void => {
  const gtkxArgs = [
    ...commonDeployArgs(args),
    ...(args.skipBuild ? ["--skip-build"] : []),
  ]
  process.exit(runGtkxDeploy(config.root, gtkxArgs))
}

const DEPLOY_SCRATCH_BUNDLE = "deploy.jsbundle"

/**
 * Reshapes a Metro build into the one file `gtkx deploy --skip-build`
 * actually checks for (`dist/bundle.mjs`) plus whatever it needs beside it,
 * by reusing --standalone's own bundler rather than inventing a second one:
 * bundleStandalone already produces a single self-contained CJS file with
 * the whole HOST_MODULE_EXTERNALS closure AND the native addon (as a
 * base64 literal, extracted to a per-user cache on first run) inlined — see
 * ../sea/native-shim.ts. That statically satisfies everything a vite build's
 * dist/bundle.mjs would otherwise need a separate dist/gtkx.node for.
 *
 * The one thing it is NOT is an ES module — rolldown emits it as CJS (see
 * ../sea/bundle.ts's header for why: a Node SEA's main script is forced to
 * CJS, and --standalone shares that bundler). `dist/bundle.mjs` cannot just
 * be that file under a different name: Node parses a `.mjs` file as ESM
 * unconditionally, and `module.exports = …`/bare `require(…)` are
 * ReferenceErrors there. So this writes the real artifact under its own
 * name and a two-line ESM shim at dist/bundle.mjs that hands off to it via
 * `createRequire` — synchronous, so no top-level await, and it resolves
 * "./<name>.cjs" from its OWN location (import.meta.url), which is exactly
 * where stagePayload copies it (both files land in the same directory,
 * `lib/<binaryName>/`), regardless of the installed package's cwd.
 */
const stageMetroDeployDist = async (
  root: string,
  entryFile: string,
): Promise<string> => {
  const scratchDir = join(root, "node_modules", ".react-native-gtkx")
  mkdirSync(scratchDir, { recursive: true })
  const jsbundlePath = join(scratchDir, DEPLOY_SCRATCH_BUNDLE)
  bundle(root, entryFile, jsbundlePath)

  const distDir = join(root, "dist")
  // Cleared, not merged into: gtkx deploy stages every file it finds under
  // dist/ (barring an icons/ dir and its own build metadata), so a stale
  // main.jsbundle or a previous run's artifacts left over from a plain
  // `build-linux` would otherwise ship inside the package too.
  rmSync(distDir, { recursive: true, force: true })
  mkdirSync(distDir, { recursive: true })

  const name = appBinaryName(root)
  const standaloneOutput = join(distDir, `${name}.cjs`)
  const { bundleStandalone } = await import("../sea/assemble.js")
  await bundleStandalone({
    appRoot: root,
    jsbundlePath,
    outFile: standaloneOutput,
    // gtkx deploy's third-party-notices step reads dist/gtkx-packages.json
    // unconditionally (--skip-build included) — see bundleStandalone's own
    // comment for why this is the one flag deploy-linux passes that
    // build-linux --standalone never does.
    shouldWritePackageManifest: true,
  })

  writeFileSync(
    join(distDir, "bundle.mjs"),
    [
      "// Generated by `react-native deploy-linux` — do not edit by hand.",
      "// gtkx deploy's payload stager only recognizes a vite-shaped",
      `// dist/bundle.mjs; this hands off to the real Metro-built artifact`,
      `// next to it (${name}.cjs, which inlines the whole runtime closure`,
      "// and the native addon — see stageMetroDeployDist in",
      "// react-native-gtkx/runner for the full explanation).",
      'import { createRequire } from "node:module"',
      "",
      `createRequire(import.meta.url)(${JSON.stringify(`./${name}.cjs`)})`,
      "",
    ].join("\n"),
  )
  console.warn(`[react-native-gtkx] staged a vite-shaped dist/ at ${distDir}`)
  return distDir
}

const deployLinuxMetro = async (
  config: CliConfig,
  args: DeployLinuxArgs,
): Promise<void> => {
  const root = config.root
  if (!hasGtkxConfig(root)) {
    fail(
      `no gtkx.config.ts found at ${root} — deploy-linux needs one on the ` +
        "Metro path too (the same file the codegen store already " +
        "requires), exporting a `deploy` block from defineConfig(). See " +
        "docs/guide/packaging.md.",
    )
  }

  const distBundle = join(root, "dist", "bundle.mjs")
  if (args.skipBuild) {
    if (!existsSync(distBundle)) {
      fail(
        `--skip-build was given but ${distBundle} does not exist yet — ` +
          "run deploy-linux without --skip-build at least once first.",
      )
    }
    console.warn(
      "[react-native-gtkx] --skip-build: reusing the already-staged dist/",
    )
  } else {
    await ensureCodegenStore(root)
    await stageMetroDeployDist(root, args.entryFile)
  }

  // gtkx deploy's own entry resolution runs unconditionally (even with
  // --skip-build), and its default (src/index.{tsx,jsx,ts,js}) is the vite
  // convention, not Metro's — pass the Metro entry file through explicitly
  // so it resolves, even though the value itself goes unused once staging
  // is skipped.
  const gtkxArgs = ["--skip-build", ...commonDeployArgs(args), args.entryFile]
  process.exit(runGtkxDeploy(root, gtkxArgs))
}

const deployLinux = async (
  _argv: string[],
  config: CliConfig,
  args: DeployLinuxArgs,
): Promise<void> => {
  if (isViteProject(config.root)) {
    deployLinuxVite(config, args)
    return
  }
  await deployLinuxMetro(config, args)
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
  {
    name: "build-linux",
    description:
      "Bundle the app with Metro for the linux platform for distribution, without running it",
    options: [
      {
        name: "--entry-file <path>",
        description: "Path to the app entry file",
        default: "index.js",
      },
      {
        name: "--bundle-output <path>",
        description:
          "Where to write the release jsbundle (default: dist/main.jsbundle)",
      },
      {
        name: "--standalone",
        description:
          "Also produce one self-contained .cjs — no node_modules, run it " +
          "with a system node (dist/<package name>.cjs)",
      },
      {
        name: "--sea",
        description:
          "Also produce a single executable (Node SEA): one file that runs " +
          "with no node_modules and no system Node — at the cost of " +
          "carrying a whole Node binary (~120 MB)",
      },
      {
        name: "--sea-output <path>",
        description:
          "Where to write the --sea / --standalone artifact " +
          "(default: dist/<package name>[.cjs])",
      },
    ],
    func: buildLinux,
  },
  {
    name: "deploy-linux",
    description:
      "Package the app for distribution (.deb/.rpm/.AppImage/.flatpak) — vite path proxies `gtkx deploy`, Metro path builds and stages first",
    options: [
      {
        name: "--entry-file <path>",
        description: "Path to the app entry file (Metro path only)",
        default: "index.js",
      },
      {
        name: "--target <formats>",
        description:
          "Comma-separated package formats to build (deb, rpm, appimage, flatpak)",
      },
      {
        name: "--out <path>",
        description:
          "Output directory relative to the project root (default: build)",
      },
      {
        name: "--print-manifests",
        description:
          "Write the generated desktop-entry/AppStream metadata, then stop without packaging",
      },
      {
        name: "--skip-build",
        description:
          "Package the already-staged dist/ instead of rebuilding (vite: passed through to `gtkx deploy`; Metro: also skips this command's own staging)",
      },
    ],
    func: deployLinux,
  },
]
