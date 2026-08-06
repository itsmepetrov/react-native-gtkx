// The derivation algorithm over a small, self-contained fixture graph — no
// disk fixtures: SourceGraph takes a plain `path -> source text` reader, so
// the fixture below IS the graph, in one place, easy to see against what
// each assertion expects. Covers the three profiles the acceptance
// criteria name (hard Adw / probe-guarded / pure GTK) plus the one
// indirection this package's own architecture actually needs: a shared
// "host" object (all its methods defined in ONE file) injected into
// factory functions defined in OTHER files, exactly the shape
// apis/host.gtkx.ts + apis/alert.ts + apis/platform.ts use for real.
import { describe, expect, test } from "vitest"
import {
  classifyEntryModule,
  classifyExport,
  type DoorConfig,
} from "./classify.ts"
import { SourceGraph } from "./graph.ts"

const FILES: Record<string, string> = {
  // The door: a probe (adwAvailable) and a gated accessor (requireAdwGi)
  // that throws without Adw — the same shape gtkx/bridge/adw.ts has, pared
  // down to what the fixture below actually exercises.
  "/fixture/door/adw.ts": `
    export const adwAvailable = (): boolean => true
    export const requireAdwGi = (feature: string): { AdwWidget: string } =>
      ({ AdwWidget: feature })
  `,
  // An eager door: importing this AT ALL is the hard cost, no probe
  // involved (adw-namespace.ts's own shape).
  "/fixture/door/adw-namespace.ts": `
    import * as Adw from "some-native-adw-binding"
    export { Adw }
  `,

  // Pure GTK: never imports anything from the door.
  "/fixture/pure-gtk.ts": `
    export const gtkVersion = (): string => "4.20"
  `,

  // Hard Adw: calls the gated accessor with no probe anywhere in the file
  // — refuses (throws) on plain GTK, matching NavigationStack/react-native-
  // gtkx's adw subpath.
  "/fixture/hard-adw.ts": `
    import { requireAdwGi } from "./door/adw.ts"
    export const NavigationStack = (): string => {
      const { AdwWidget } = requireAdwGi("NavigationStack")
      return AdwWidget
    }
  `,

  // Hard Adw via an eager import: no probe exists to guard an import that
  // is itself unconditional at module scope.
  "/fixture/hard-adw-eager.ts": `
    import { Adw } from "./door/adw-namespace.ts"
    export const AdwOnlyWidget = (): unknown => Adw
  `,

  // Probe-guarded: a ternary gated on adwAvailable(), same shape as
  // apis/host.gtkx.ts's showAlert/setColorScheme.
  "/fixture/probe-guarded.ts": `
    import { adwAvailable, requireAdwGi } from "./door/adw.ts"
    const richAdwPath = (): string => {
      const { AdwWidget } = requireAdwGi("Alert")
      return AdwWidget
    }
    const plainFallback = (): string => "plain-dialog"
    export const showAlert = (): string =>
      adwAvailable() ? richAdwPath() : plainFallback()
  `,

  // Probe-guarded via a named boolean one hop away from the ternary — the
  // app-registry.tsx "chrome: content" shape (\`const useAdw = flag &&
  // adwAvailable()\`, decided on later by \`useAdw ? ... : ...\`).
  "/fixture/probe-guarded-named-bool.ts": `
    import { adwAvailable, requireAdwGi } from "./door/adw.ts"
    export const chrome = (wantsContent: boolean): string => {
      const useAdwChrome = wantsContent && adwAvailable()
      return useAdwChrome
        ? (() => {
            const { AdwWidget } = requireAdwGi("chrome")
            return AdwWidget
          })()
        : "plain-window"
    }
  `,

  // The host-object indirection: ONE shared object with both a GTK-only
  // method and an Adw-probe-guarded one, injected into two separate
  // factories defined in OTHER files — apis/host.gtkx.ts's actual shape.
  "/fixture/host.ts": `
    import { adwAvailable, requireAdwGi } from "./door/adw.ts"
    const gtkVersion = (): string => "4.20"
    const showAlertAdw = (): string => {
      const { AdwWidget } = requireAdwGi("Alert")
      return AdwWidget
    }
    const showAlertPlain = (): string => "plain-dialog"
    export const host = {
      gtkVersion,
      showAlert: (): string => (adwAvailable() ? showAlertAdw() : showAlertPlain()),
    }
  `,
  // A void, fire-and-forget statement, not a "return" — apis/alert.ts's
  // actual shape (\`void host.showAlert({...}).then(...).catch(...)\`),
  // exercising the "chain a Promise method the interpreter cannot resolve,
  // then keep digging into the object it was called on" fallback.
  "/fixture/create-alert.ts": `
    export const createAlert = (h: { showAlert: () => string }) => {
      const alert = (): void => {
        void h.showAlert().then(() => {})
      }
      return { alert }
    }
  `,
  "/fixture/create-platform.ts": `
    export const createPlatform = (h: { gtkVersion: () => string }) => ({
      get Version(): string {
        return h.gtkVersion()
      },
    })
  `,
  "/fixture/index.ts": `
    import { createAlert } from "./create-alert.ts"
    import { createPlatform } from "./create-platform.ts"
    import { host } from "./host.ts"
    export const Alert = createAlert(host)
    export const Platform = createPlatform(host)
  `,

  // A subpath "page" entry point with two value exports and one type-only
  // export — mirrors navigation/index.tsx's shape (createStackNavigator,
  // createSidebarNavigator, plus option types) closely enough to exercise
  // classifyEntryModule's export enumeration and worst-case combination.
  "/fixture/page-mixed/index.ts": `
    export type Options = { title?: string }
    export const plainPiece = (): string => "ok"
    export { adwPiece } from "./adw-piece.ts"
  `,
  "/fixture/page-mixed/adw-piece.ts": `
    import { requireAdwGi } from "../door/adw.ts"
    export const adwPiece = (): unknown => requireAdwGi("adwPiece")
  `,

  // A subpath page whose own exports never touch the door, even though it
  // imports a GTK-only name from a file that ALSO wires in Adw-touching
  // exports elsewhere (apis/index.ts's actual shape: Dimensions is pure
  // GTK, Alert lives in the same barrel and is not) — the false positive a
  // naive whole-file-reachability check produced before classifyEntryModule
  // was scoped to the entry's OWN exports.
  "/fixture/page-clean/index.ts": `
    export { onlyGtkThing } from "../shared-barrel.ts"
  `,
  "/fixture/shared-barrel.ts": `
    import { createAlert } from "./create-alert.ts"
    import { createPlatform } from "./create-platform.ts"
    import { host } from "./host.ts"
    export const onlyGtkThing = createPlatform(host)
    export const otherThingSharesThisFile = createAlert(host)
  `,
}

const readFile = (path: string): string | undefined => FILES[path]

const config: DoorConfig = {
  doorModules: ["/fixture/door/adw.ts"],
  probeExportName: "adwAvailable",
  gatedExportNames: ["requireAdwGi"],
  eagerModules: ["/fixture/door/adw-namespace.ts"],
}

const classify = (file: string, name: string) => {
  const graph = new SourceGraph(readFile)
  const parsed = graph.parse(file)
  if (!parsed) {
    throw new Error(`fixture file not found: ${file}`)
  }
  return classifyExport(graph, config, parsed, name)
}

describe("classifyExport: the three base profiles", () => {
  test("an export that never reaches the door is gtk", () => {
    expect(classify("/fixture/pure-gtk.ts", "gtkVersion").profile).toBe("gtk")
  })

  test("an unconditional requireAdwGi() call is hard-adw", () => {
    const result = classify("/fixture/hard-adw.ts", "NavigationStack")
    expect(result.profile).toBe("hard-adw")
    expect(result.evidence.join(" ")).toContain("unguarded")
  })

  test("an eager import of the door's namespace is hard-adw", () => {
    expect(
      classify("/fixture/hard-adw-eager.ts", "AdwOnlyWidget").profile,
    ).toBe("hard-adw")
  })

  test("a ternary gated on adwAvailable() is probe-guarded", () => {
    const result = classify("/fixture/probe-guarded.ts", "showAlert")
    expect(result.profile).toBe("probe-guarded")
  })

  test("a guard one hop away through a named boolean is still recognized", () => {
    expect(
      classify("/fixture/probe-guarded-named-bool.ts", "chrome").profile,
    ).toBe("probe-guarded")
  })
})

describe("classifyExport: the host-object indirection", () => {
  test("a factory wired to the Adw-touching host method is probe-guarded", () => {
    const result = classify("/fixture/index.ts", "Alert")
    expect(result.profile).toBe("probe-guarded")
  })

  test("a factory wired to the GTK-only host method stays gtk", () => {
    // The regression this case guards: without per-property resolution,
    // "reaches a file that also imports the door somewhere" marks EVERY
    // export sharing that host object as Adw, GTK-only methods included.
    const result = classify("/fixture/index.ts", "Platform")
    expect(result.profile).toBe("gtk")
  })
})

describe("classifyEntryModule: page-level combination", () => {
  test("combines to the worst profile across every value export, skipping types", () => {
    const graph = new SourceGraph(readFile)
    const result = classifyEntryModule(
      graph,
      config,
      "/fixture/page-mixed/index.ts",
    )
    expect(result.profile).toBe("hard-adw")
  })

  test("does not fire on a shared barrel file's OTHER, Adw-touching export", () => {
    const graph = new SourceGraph(readFile)
    const result = classifyEntryModule(
      graph,
      config,
      "/fixture/page-clean/index.ts",
    )
    expect(result.profile).toBe("gtk")
  })
})
