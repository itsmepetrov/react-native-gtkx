// react (and its jsx runtimes) must resolve to the exact same instance
// @gtkx/react's reconciler uses — the reconciler and the app share one
// React, and anchoring resolution at the app's own node_modules can pick
// up a second copy (npm's peer-dependency auto-install, or a differently
// hoisted layout). runner/host.ts hits the identical problem and solves it
// the same way: resolve "react"/"react/jsx-runtime"/"react/jsx-dev-runtime"
// from @gtkx/react's own location, not the app's.
//
// Confirmed necessary empirically, not just by analogy with host.ts:
// without this plugin the built SEA threw React's "Invalid hook call"
// (two React module instances in the bundle graph) — esbuild had resolved
// the entry's top-level `import("react")` from the app root and
// @gtkx/react's own internal `import "react"` from @gtkx/react's
// directory, landing on two different files were the two roots not
// deduplicated to the same node_modules/react.
import { createRequire } from "node:module"
import type { Plugin } from "esbuild"

const REACT_SPECIFIERS = new Set([
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
])

export const reactAnchorPlugin = (appRoot: string): Plugin => ({
  name: "gtkx-react-anchor",
  setup(build) {
    const appRequire = createRequire(`${appRoot}/package.json`)
    const fromGtkxReact = createRequire(appRequire.resolve("@gtkx/react"))
    build.onResolve({ filter: /^react(\/.*)?$/ }, (args) => {
      if (!REACT_SPECIFIERS.has(args.path)) {
        return undefined
      }
      return { path: fromGtkxReact.resolve(args.path) }
    })
  },
})
