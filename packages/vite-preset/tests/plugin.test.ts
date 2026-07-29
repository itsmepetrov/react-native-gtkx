import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createServer, type Plugin, type ViteDevServer } from "vite"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { reactNativeGtkx } from "../src/index"

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures")
const importer = join(fixtures, "importer.ts")

type ResolveFn = (
  source: string,
  importer?: string,
  options?: { skipSelf?: boolean },
) => Promise<{ id: string } | null>

type ResolveIdHook = (
  this: { resolve: ResolveFn },
  source: string,
  importer?: string,
) => Promise<string | { id: string } | null>

const resolveIdHook = (plugin: Plugin): ResolveIdHook => {
  const hook = plugin.resolveId
  if (typeof hook !== "function") {
    throw new Error("expected resolveId to be a plain function hook")
  }
  return hook as unknown as ResolveIdHook
}

describe("plugin shape", () => {
  const plugin = reactNativeGtkx()

  test("runs in the pre phase so it beats vite core and the gtkx plugins", () => {
    expect(plugin.name).toBe("react-native-gtkx:preset")
    expect(plugin.enforce).toBe("pre")
  })

  test("keeps react-native-gtkx out of ssr externals (gtkx dev sets external: true)", () => {
    const config = plugin.config as () => {
      ssr?: { noExternal?: string[] }
    }
    expect(config().ssr?.noExternal).toContain("react-native-gtkx")
  })
})

describe("resolveId hook (fake context)", () => {
  const hook = resolveIdHook(reactNativeGtkx())

  test("delegates aliased react-native imports to the next resolver", async () => {
    const seen: string[] = []
    const resolve: ResolveFn = (source) => {
      seen.push(source)
      return Promise.resolve({ id: "/resolved/react-native-gtkx/src/index.ts" })
    }
    const result = await hook.call({ resolve }, "react-native", importer)
    expect(seen).toEqual(["react-native-gtkx"])
    expect(result).toEqual({ id: "/resolved/react-native-gtkx/src/index.ts" })
  })

  test("falls back to the bare aliased id when nothing resolves it", async () => {
    const resolve: ResolveFn = () => Promise.resolve(null)
    const result = await hook.call({ resolve }, "react-native/foo", importer)
    expect(result).toBe("react-native-gtkx/foo")
  })

  test("resolves platform files from the real filesystem", async () => {
    const resolve: ResolveFn = () => Promise.resolve(null)
    const context = { resolve }
    await expect(hook.call(context, "./Comp", importer)).resolves.toBe(
      join(fixtures, "Comp.linux.tsx"),
    )
    await expect(hook.call(context, "./Widget", importer)).resolves.toBe(
      join(fixtures, "Widget.native.ts"),
    )
    await expect(hook.call(context, "./menu", importer)).resolves.toBe(
      join(fixtures, "menu", "index.linux.tsx"),
    )
    await expect(hook.call(context, "./Base", importer)).resolves.toBeNull()
  })
})

// Smoke test against the real vite plugin container: a dev server in
// middleware mode (no listen, no gtkx, works on any OS) resolving through the
// same pipeline `gtkx dev` uses.
describe("vite plugin container integration", () => {
  let server: ViteDevServer

  beforeAll(async () => {
    server = await createServer({
      root: fixtures,
      configFile: false,
      logLevel: "silent",
      cacheDir: mkdtempSync(join(tmpdir(), "rngtkx-vite-preset-")),
      appType: "custom",
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [reactNativeGtkx()],
    })
  }, 30000)

  afterAll(async () => {
    await server.close()
  })

  const resolveId = (source: string) =>
    server.environments.ssr.pluginContainer.resolveId(source, importer)

  test("platform file wins over the base file", async () => {
    const resolved = await resolveId("./Comp")
    expect(resolved?.id).toBe(join(fixtures, "Comp.linux.tsx"))
  })

  test("native file is picked when no linux file exists", async () => {
    const resolved = await resolveId("./Widget")
    expect(resolved?.id).toBe(join(fixtures, "Widget.native.ts"))
  })

  test("base file resolves through the default resolver", async () => {
    const resolved = await resolveId("./Base")
    expect(resolved?.id).toBe(join(fixtures, "Base.tsx"))
  })

  test("directory import resolves to the platform index file", async () => {
    const resolved = await resolveId("./menu")
    expect(resolved?.id).toBe(join(fixtures, "menu", "index.linux.tsx"))
  })

  test("react-native resolves to the react-native-gtkx package", async () => {
    const resolved = await resolveId("react-native")
    expect(resolved?.id).toContain("react-native-gtkx")
    expect(resolved?.id).not.toBe("react-native")
  })
})
