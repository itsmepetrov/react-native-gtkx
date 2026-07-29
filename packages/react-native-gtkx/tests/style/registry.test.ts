import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createCssRegistry,
  resetDevWarnings,
  visualStyleToCss,
} from "../../src/style/index.js"
import type { VisualStyle } from "../../src/contracts.js"

beforeEach(() => {
  resetDevWarnings()
})

const createFakeCss = () => {
  let counter = 0
  return vi.fn((cssText: string) => `fake-${counter++}-${cssText.length}`)
}

describe("createCssRegistry", () => {
  it("registers a class through the injected css function", () => {
    const cssFn = createFakeCss()
    const registry = createCssRegistry(cssFn)
    const visual: VisualStyle = { backgroundColor: "red", borderRadius: 4 }

    const className = registry.getClassName(visual)
    expect(className).toMatch(/^fake-0-/)
    expect(cssFn).toHaveBeenCalledTimes(1)
    expect(cssFn).toHaveBeenCalledWith(visualStyleToCss(visual))
  })

  it("memoizes: the same style object yields one class and one css call", () => {
    const cssFn = createFakeCss()
    const registry = createCssRegistry(cssFn)
    const visual: VisualStyle = { backgroundColor: "red" }

    const first = registry.getClassName(visual)
    const second = registry.getClassName(visual)
    expect(second).toBe(first)
    expect(cssFn).toHaveBeenCalledTimes(1)
  })

  it("memoizes structurally equal styles regardless of key order", () => {
    const cssFn = createFakeCss()
    const registry = createCssRegistry(cssFn)

    const first = registry.getClassName({
      backgroundColor: "red",
      borderRadius: 4,
    })
    const second = registry.getClassName({
      borderRadius: 4,
      backgroundColor: "red",
    })
    expect(second).toBe(first)
    expect(cssFn).toHaveBeenCalledTimes(1)
  })

  it("returns distinct classes for different styles", () => {
    const cssFn = createFakeCss()
    const registry = createCssRegistry(cssFn)

    const red = registry.getClassName({ backgroundColor: "red" })
    const blue = registry.getClassName({ backgroundColor: "blue" })
    expect(red).not.toBe(blue)
    expect(cssFn).toHaveBeenCalledTimes(2)
  })

  it("returns null without touching css for styles that produce no CSS", () => {
    const cssFn = createFakeCss()
    const registry = createCssRegistry(cssFn)

    expect(registry.getClassName({})).toBeNull()
    expect(
      registry.getClassName({ transform: [{ translateX: 10 }] }),
    ).toBeNull()
    expect(registry.getClassName({ textAlign: "center" })).toBeNull()
    expect(cssFn).not.toHaveBeenCalled()
  })

  it("keeps caches independent between registries", () => {
    const cssFnA = createFakeCss()
    const cssFnB = createFakeCss()
    const registryA = createCssRegistry(cssFnA)
    const registryB = createCssRegistry(cssFnB)

    registryA.getClassName({ backgroundColor: "red" })
    registryB.getClassName({ backgroundColor: "red" })
    expect(cssFnA).toHaveBeenCalledTimes(1)
    expect(cssFnB).toHaveBeenCalledTimes(1)
  })
})
