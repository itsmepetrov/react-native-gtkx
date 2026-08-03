// Animated.event's arg-mapping traversal, exercised against the two shapes
// every real caller uses it for: a ScrollView's single-argument `onScroll`
// and PanResponder's `(event, gestureState)` pair — RN supports mapping
// either argument, and the vendored PanResponder always maps the second one.
import { afterEach, describe, expect, it, vi } from "vitest"
import { createAnimated } from "../../../src/animated/index"
import { createManualScheduler } from "./manual-scheduler"

const setup = () => {
  const manual = createManualScheduler()
  return { manual, api: createAnimated(manual.scheduler) }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Animated.event", () => {
  it("writes a ScrollView-shaped nativeEvent onto a mapped Value", () => {
    const { api } = setup()
    const scrollY = new api.Value(0)
    const handler = api.event([
      { nativeEvent: { contentOffset: { y: scrollY } } },
    ])

    handler({ nativeEvent: { contentOffset: { x: 0, y: 42 } } })
    expect(scrollY.__getValue()).toBe(42)

    handler({ nativeEvent: { contentOffset: { x: 0, y: 108 } } })
    expect(scrollY.__getValue()).toBe(108)
  })

  it("maps the SECOND argument, leaving the first alone (PanResponder shape)", () => {
    const { api } = setup()
    const pan = new api.ValueXY()
    // What the vendored PanResponder actually calls: (event, gestureState).
    const handler = api.event([null, { dx: pan.x, dy: pan.y }])

    handler(
      { nativeEvent: {} },
      { dx: 10, dy: -4, moveX: 0, moveY: 0, x0: 0, y0: 0, vx: 0, vy: 0 },
    )
    expect(pan.x.__getValue()).toBe(10)
    expect(pan.y.__getValue()).toBe(-4)
  })

  it("maps the FIRST argument too — RN supports either", () => {
    const { api } = setup()
    const value = new api.Value(0)
    const handler = api.event([{ x: value }, null])

    handler({ x: 7 }, { irrelevant: true })
    expect(value.__getValue()).toBe(7)
  })

  it("tolerates a path the real event does not carry, at any depth", () => {
    const { api } = setup()
    const height = new api.Value(0)
    const handler = api.event([{ nativeEvent: { contentSize: { height } } }])

    // No `contentSize` at all on this call — upstream's own traversal would
    // throw here (`recEvt[mappingKey]` on an object one level up from the
    // leaf); this platform tolerates it and leaves the value untouched.
    expect(() => handler({ nativeEvent: {} })).not.toThrow()
    expect(height.__getValue()).toBe(0)

    // A leaf that IS reachable but not a number (RN's own guard: only a
    // `typeof === "number"` value is written) is likewise skipped.
    handler({ nativeEvent: { contentSize: { height: "108" } } })
    expect(height.__getValue()).toBe(0)

    handler({ nativeEvent: { contentSize: { height: 108 } } })
    expect(height.__getValue()).toBe(108)
  })

  it("tolerates a ValueXY leaf whose event slot is missing or non-object", () => {
    const { api } = setup()
    const pan = new api.ValueXY({ x: 5, y: 9 })
    const handler = api.event([{ translation: pan }])

    expect(() => handler({})).not.toThrow()
    expect(pan.__getValue()).toEqual({ x: 5, y: 9 })

    handler({ translation: "not an object" })
    expect(pan.__getValue()).toEqual({ x: 5, y: 9 })

    handler({ translation: { x: 1, y: 2 } })
    expect(pan.__getValue()).toEqual({ x: 1, y: 2 })
  })

  it("calls the listener with the raw arguments, after the mapping runs", () => {
    const { api } = setup()
    const value = new api.Value(0)
    const seenAtListenTime: number[] = []
    const listener = vi.fn((event: { nativeEvent: { y: number } }) => {
      seenAtListenTime.push(value.__getValue())
      expect(event).toEqual({ nativeEvent: { y: 5 } })
    })
    const handler = api.event([{ nativeEvent: { y: value } }], { listener })

    handler({ nativeEvent: { y: 5 } })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ nativeEvent: { y: 5 } })
    // The value was already written by the time the listener saw it.
    expect(seenAtListenTime).toEqual([5])
  })

  it("passes every argument to the listener, not just the first", () => {
    const { api } = setup()
    const pan = new api.ValueXY()
    const listener = vi.fn()
    const handler = api.event([null, { dx: pan.x, dy: pan.y }], { listener })

    const event = { nativeEvent: {} }
    const gestureState = { dx: 1, dy: 2 }
    handler(event, gestureState)
    expect(listener).toHaveBeenCalledWith(event, gestureState)
  })

  it("accepts useNativeDriver and warns once per session, still writing JS-side", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { api } = setup()
    const value = new api.Value(0)
    const first = api.event([{ nativeEvent: { y: value } }], {
      useNativeDriver: true,
    })
    const second = api.event([{ nativeEvent: { y: value } }], {
      useNativeDriver: true,
    })

    first({ nativeEvent: { y: 1 } })
    second({ nativeEvent: { y: 2 } })

    expect(warn).toHaveBeenCalledTimes(1)
    // Unlike RN's native driver, there is nowhere else for the value to be
    // written — the JS path always runs, regardless of the flag.
    expect(value.__getValue()).toBe(2)
  })

  it("runs with no config at all", () => {
    const { api } = setup()
    const value = new api.Value(0)
    const handler = api.event([{ nativeEvent: { y: value } }])
    expect(() => handler({ nativeEvent: { y: 3 } })).not.toThrow()
    expect(value.__getValue()).toBe(3)
  })
})
