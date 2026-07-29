// Production adapter — the ONLY style module that touches the bridge.
// Components (task 006) import the default registry from here; everything
// else in src/style is pure and must not depend on this file. It is also
// deliberately not re-exported from src/style/index.ts so that unit tests
// (and any pure consumer) never pull in @gtkx bindings transitively.

import { css } from "../gtkx-bridge/index.js"
import { createCssRegistry, type CssRegistry } from "./registry.js"

export const defaultCssRegistry: CssRegistry = createCssRegistry((cssText) =>
  css(cssText),
)
