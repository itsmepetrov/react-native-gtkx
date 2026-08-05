// The subpath guard from .claude/epics/adw-optional/005.md: react-native-gtkx/adw
// and react-native-gtkx/navigation both statically reach @gtkx/gi/adw and/or
// @gtkx/jsx/adw at module scope (react-native-gtkx/adw's own `Adw` export
// needs a real, eager `import * as Adw` for TypeScript's type+value
// duality — see packages/react-native-gtkx/src/gtkx/bridge/adw-namespace.ts —
// and react-native-gtkx/navigation imports AdwHeaderBar/AdwToolbarView from
// react-native-gtkx/adw the same way). This project's own gtkx.config.ts
// declares no "Adw-1", so its own @gtkx/gi and @gtkx/jsx genuinely have no
// "./adw" export at all — the only store in the repo where that is true.
//
// Both subpaths throw react-native-gtkx's own named, actionable error —
// same wording as gtkx/bridge/adw.ts's requireAdw() throw, produced this
// time by the vite preset's own resolveId/load hooks (src/vite/index.ts's
// ADW_ONLY_SPECIFIERS interception) rather than that function, since
// neither eager importer above calls it directly. Before that interception
// existed, this was a raw Vite/Rollup resolver error naming the missing
// "./adw" export — loud, but not actionable (no mention of "Adw-1" or
// gtkx.config.ts) — see the interception's own doc for why it had to be a
// resolveId hook rather than a source change: resolving these two
// specifiers for real, on a store with no Adw, took the WHOLE package down
// under `gtkx dev` and vitest (not just these two subpaths), which is how
// this guard test found it.
import { expect, it } from "vitest"

const ADW_REQUIRED =
  'requires "Adw-1" in this app\'s gtkx.config.ts `libraries`'

it("react-native-gtkx/adw refuses to import without Adw-1", async () => {
  await expect(import("react-native-gtkx/adw")).rejects.toThrow(ADW_REQUIRED)
})

it("react-native-gtkx/navigation refuses to import without Adw-1", async () => {
  await expect(import("react-native-gtkx/navigation")).rejects.toThrow(
    ADW_REQUIRED,
  )
})
