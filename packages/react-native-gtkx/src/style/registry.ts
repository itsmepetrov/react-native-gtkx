// Memoized CSS class registry. The actual `css` function is injected:
// production uses the bridge (registry.gtkx.ts), tests use a fake — this
// module stays pure and unit-testable on any OS.

import type { VisualStyle } from "../contracts"
import { visualStyleToCss } from "./visual-css"

export type CssFn = (cssText: string) => string

export type CssRegistry = {
  /**
   * Returns the GTK CSS class name for a visual style, or null when the
   * style produces no CSS (empty, or transform/textAlign-only). Equal
   * styles map to the same class: the cache key is the generated CSS text,
   * so property order and non-CSS props do not fragment the cache.
   */
  getClassName(visual: VisualStyle): string | null
}

export const createCssRegistry = (cssFn: CssFn): CssRegistry => {
  const classByCssText = new Map<string, string>()
  return {
    getClassName(visual) {
      const cssText = visualStyleToCss(visual)
      if (cssText === "") {
        return null
      }
      const cached = classByCssText.get(cssText)
      if (cached !== undefined) {
        return cached
      }
      const className = cssFn(cssText)
      classByCssText.set(cssText, className)
      return className
    },
  }
}
