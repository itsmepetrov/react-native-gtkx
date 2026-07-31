// The React "act environment" flag. React batches and warns about updates
// outside of `act()` unless this is set — required for @gtkx/testing's
// render/renderHook to behave like React Testing Library. Referenced by an
// absolute path computed with `import.meta.url` (see index.ts), not
// statically imported, so it is a plain vitest setupFiles entry like
// @gtkx/vitest's own worker-setup.js.
import { beforeAll } from "vitest"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const setActEnvironment = (value: boolean | undefined): void => {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    value,
    configurable: true,
    writable: true,
  })
}

beforeAll(() => {
  const previous = globalThis.IS_REACT_ACT_ENVIRONMENT
  setActEnvironment(true)

  return () => {
    setActEnvironment(previous)
  }
})
