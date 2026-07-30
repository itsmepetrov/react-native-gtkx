import { describe, expect, it, vi } from "vitest"
import { createDimensions } from "../../../src/apis/dimensions"
import { createDimensionsMockHost, size } from "./mock-host"

describe("Dimensions", () => {
  it("returns window and screen metrics from the host", () => {
    const { host } = createDimensionsMockHost(size(800, 600), size(1920, 1080))
    const dimensions = createDimensions(host)
    expect(dimensions.get("window")).toEqual(size(800, 600))
    expect(dimensions.get("screen")).toEqual(size(1920, 1080))
  })

  it("throws for unknown dimension keys", () => {
    const dimensions = createDimensions(createDimensionsMockHost().host)
    expect(() => dimensions.get("view" as never)).toThrow(/unknown dimension/)
  })

  it("reflects host changes on idle reads (no listeners)", () => {
    const mock = createDimensionsMockHost(size(800, 600))
    const dimensions = createDimensions(mock.host)
    expect(dimensions.get("window").width).toBe(800)
    mock.resize({ width: 640, height: 480 })
    expect(dimensions.get("window")).toEqual(size(640, 480))
  })

  it("keeps snapshot identity stable while values are unchanged", () => {
    const mock = createDimensionsMockHost()
    const dimensions = createDimensions(mock.host)
    const first = dimensions.get("window")
    expect(dimensions.get("window")).toBe(first)
    mock.resize({ width: 500 })
    const changed = dimensions.get("window")
    expect(changed).not.toBe(first)
    expect(dimensions.get("window")).toBe(changed)
  })

  it("emits a change payload on window resize", () => {
    const mock = createDimensionsMockHost(size(800, 600), size(1920, 1080))
    const dimensions = createDimensions(mock.host)
    const handler = vi.fn()
    dimensions.addEventListener("change", handler)
    mock.resize({ width: 1024, height: 768 })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({
      window: size(1024, 768),
      screen: size(1920, 1080),
    })
  })

  it("does not emit when the host notifies without an actual change", () => {
    const mock = createDimensionsMockHost()
    const dimensions = createDimensions(mock.host)
    const handler = vi.fn()
    dimensions.addEventListener("change", handler)
    mock.notifier.fire()
    expect(handler).not.toHaveBeenCalled()
  })

  it("stops calling a handler after remove(), idempotently", () => {
    const mock = createDimensionsMockHost()
    const dimensions = createDimensions(mock.host)
    const handler = vi.fn()
    const subscription = dimensions.addEventListener("change", handler)
    subscription.remove()
    subscription.remove()
    mock.resize({ width: 111 })
    expect(handler).not.toHaveBeenCalled()
  })

  it("attaches the host subscription on first listener, detaches on last", () => {
    const mock = createDimensionsMockHost()
    const dimensions = createDimensions(mock.host)
    expect(mock.notifier.count()).toBe(0)
    const first = dimensions.addEventListener("change", vi.fn())
    const second = dimensions.addEventListener("change", vi.fn())
    expect(mock.notifier.count()).toBe(1)
    first.remove()
    expect(mock.notifier.count()).toBe(1)
    second.remove()
    expect(mock.notifier.count()).toBe(0)
  })

  it("supports set() overrides that notify listeners", () => {
    const mock = createDimensionsMockHost(size(800, 600))
    const dimensions = createDimensions(mock.host)
    const handler = vi.fn()
    dimensions.addEventListener("change", handler)
    dimensions.set({ window: { width: 999 } })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(dimensions.get("window").width).toBe(999)
    // A real host event replaces the override again.
    mock.resize({ width: 800 })
    expect(dimensions.get("window").width).toBe(800)
  })

  it("rejects unsupported event types", () => {
    const dimensions = createDimensions(createDimensionsMockHost().host)
    expect(() =>
      dimensions.addEventListener("resize" as never, vi.fn()),
    ).toThrow(/unsupported event type/)
  })
})
