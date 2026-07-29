// The hooks are thin useSyncExternalStore wrappers; their store logic
// (subscribe/getSnapshot/identity) is tested here directly, without rendering
// (no extra testing-library dependency in this repo).

import { describe, expect, it, vi } from "vitest"
import { createAppearance } from "../../src/apis/appearance.js"
import { createDimensions } from "../../src/apis/dimensions.js"
import {
  createColorSchemeStore,
  createUseColorScheme,
  createUseWindowDimensions,
  createWindowDimensionsStore,
} from "../../src/apis/hooks.js"
import {
  createAppearanceMockHost,
  createDimensionsMockHost,
  size,
} from "./mock-host.js"

describe("useWindowDimensions store", () => {
  it("snapshots the window dimensions with stable identity", () => {
    const mock = createDimensionsMockHost(size(800, 600))
    const store = createWindowDimensionsStore(createDimensions(mock.host))
    const first = store.getSnapshot()
    expect(first).toEqual(size(800, 600))
    expect(store.getSnapshot()).toBe(first)
  })

  it("notifies subscribers on resize and refreshes the snapshot", () => {
    const mock = createDimensionsMockHost(size(800, 600))
    const store = createWindowDimensionsStore(createDimensions(mock.host))
    const onStoreChange = vi.fn()
    const unsubscribe = store.subscribe(onStoreChange)
    const before = store.getSnapshot()
    mock.resize({ width: 1024 })
    expect(onStoreChange).toHaveBeenCalledTimes(1)
    const after = store.getSnapshot()
    expect(after).not.toBe(before)
    expect(after.width).toBe(1024)
    unsubscribe()
  })

  it("unsubscribe detaches the underlying host subscription", () => {
    const mock = createDimensionsMockHost()
    const store = createWindowDimensionsStore(createDimensions(mock.host))
    const onStoreChange = vi.fn()
    const unsubscribe = store.subscribe(onStoreChange)
    expect(mock.notifier.count()).toBe(1)
    unsubscribe()
    expect(mock.notifier.count()).toBe(0)
    mock.resize({ width: 320 })
    expect(onStoreChange).not.toHaveBeenCalled()
  })
})

describe("useColorScheme store", () => {
  it("snapshots the current scheme", () => {
    const mock = createAppearanceMockHost("dark")
    const store = createColorSchemeStore(createAppearance(mock.host))
    expect(store.getSnapshot()).toBe("dark")
  })

  it("notifies subscribers on theme changes", () => {
    const mock = createAppearanceMockHost("light")
    const store = createColorSchemeStore(createAppearance(mock.host))
    const onStoreChange = vi.fn()
    const unsubscribe = store.subscribe(onStoreChange)
    mock.setSystemScheme("dark")
    expect(onStoreChange).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot()).toBe("dark")
    unsubscribe()
    mock.setSystemScheme("light")
    expect(onStoreChange).toHaveBeenCalledTimes(1)
  })
})

describe("hook factories", () => {
  it("produce named hook functions", () => {
    const dimensions = createDimensions(createDimensionsMockHost().host)
    const appearance = createAppearance(createAppearanceMockHost().host)
    const useWindowDimensions = createUseWindowDimensions(dimensions)
    const useColorScheme = createUseColorScheme(appearance)
    expect(typeof useWindowDimensions).toBe("function")
    expect(useWindowDimensions.name).toBe("useWindowDimensions")
    expect(typeof useColorScheme).toBe("function")
    expect(useColorScheme.name).toBe("useColorScheme")
  })
})
