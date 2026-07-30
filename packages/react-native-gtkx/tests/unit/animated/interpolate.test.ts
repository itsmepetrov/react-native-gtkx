import { describe, expect, it, vi } from "vitest"
import { createAnimated, Easing } from "../../../src/animated/index"
import { createManualScheduler } from "./manual-scheduler"

const setup = () => {
  const manual = createManualScheduler()
  return { manual, api: createAnimated(manual.scheduler) }
}

describe("Animated interpolation", () => {
  it("maps a numeric range linearly", () => {
    const { api } = setup()
    const value = new api.Value(0.5)
    const node = value.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 100],
    })
    expect(node.__getValue()).toBeCloseTo(50, 12)
    value.setValue(0.1)
    expect(node.__getValue()).toBeCloseTo(10, 12)
  })

  it("supports multi-segment ranges", () => {
    const { api } = setup()
    const value = new api.Value(0)
    const node = value.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 10, 40],
    })
    value.setValue(0.25)
    expect(node.__getValue()).toBeCloseTo(5, 12)
    value.setValue(0.5)
    expect(node.__getValue()).toBeCloseTo(10, 12)
    value.setValue(0.75)
    expect(node.__getValue()).toBeCloseTo(25, 12)
  })

  it("extends beyond the range by default", () => {
    const { api } = setup()
    const value = new api.Value(-1)
    const node = value.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 100],
    })
    expect(node.__getValue()).toBeCloseTo(-100, 12)
    value.setValue(2)
    expect(node.__getValue()).toBeCloseTo(200, 12)
  })

  it("clamps when extrapolate is 'clamp'", () => {
    const { api } = setup()
    const value = new api.Value(-1)
    const node = value.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 100],
      extrapolate: "clamp",
    })
    expect(node.__getValue()).toBe(0)
    value.setValue(2)
    expect(node.__getValue()).toBe(100)
    value.setValue(0.5)
    expect(node.__getValue()).toBeCloseTo(50, 12)
  })

  it("passes the input through when extrapolate is 'identity'", () => {
    const { api } = setup()
    const value = new api.Value(-3)
    const node = value.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 100],
      extrapolate: "identity",
    })
    expect(node.__getValue()).toBe(-3)
    value.setValue(0.5)
    expect(node.__getValue()).toBeCloseTo(50, 12)
    value.setValue(4)
    expect(node.__getValue()).toBe(4)
  })

  it("interpolates deg strings, preserving the suffix", () => {
    const { api } = setup()
    const value = new api.Value(0.5)
    const node = value.interpolate({
      inputRange: [0, 1],
      outputRange: ["0deg", "90deg"],
    })
    expect(node.__getValue()).toBe("45deg")
  })

  it("interpolates rad strings and negative values", () => {
    const { api } = setup()
    const value = new api.Value(0.5)
    const rad = value.interpolate({
      inputRange: [0, 1],
      outputRange: ["0rad", "3.14rad"],
    })
    expect(rad.__getValue()).toBe("1.57rad")
    const deg = value.interpolate({
      inputRange: [0, 1],
      outputRange: ["-90deg", "90deg"],
    })
    expect(deg.__getValue()).toBe("0deg")
  })

  it("clamps string outputs too", () => {
    const { api } = setup()
    const value = new api.Value(5)
    const node = value.interpolate({
      inputRange: [0, 1],
      outputRange: ["0deg", "90deg"],
      extrapolate: "clamp",
    })
    expect(node.__getValue()).toBe("90deg")
  })

  it("cascades: an interpolation can be interpolated again", () => {
    const { api } = setup()
    const value = new api.Value(0.5)
    const degrees = value.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 90],
    })
    const normalized = degrees.interpolate({
      inputRange: [0, 90],
      outputRange: [0, 1],
    })
    expect(normalized.__getValue()).toBeCloseTo(0.5, 12)
    value.setValue(1)
    expect(normalized.__getValue()).toBeCloseTo(1, 12)
  })

  it("cascades from a string-producing parent via its numeric part", () => {
    const { api } = setup()
    const value = new api.Value(0.5)
    const degrees = value.interpolate({
      inputRange: [0, 1],
      outputRange: ["0deg", "90deg"],
    })
    const normalized = degrees.interpolate({
      inputRange: [0, 90],
      outputRange: [0, 1],
    })
    expect(normalized.__getValue()).toBeCloseTo(0.5, 12)
  })

  it("notifies listeners with interpolated values when the parent changes", () => {
    const { api } = setup()
    const value = new api.Value(0)
    const node = value.interpolate({
      inputRange: [0, 1],
      outputRange: ["0deg", "180deg"],
    })
    const listener = vi.fn()
    node.addListener(listener)
    value.setValue(0.5)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ value: "90deg" })
  })

  it("streams interpolated frames during a timing animation", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const node = value.interpolate({ inputRange: [0, 1], outputRange: [0, 10] })
    const seen: (number | string)[] = []
    node.addListener(({ value: v }) => {
      seen.push(v)
    })
    api
      .timing(value, { toValue: 1, duration: 40, easing: Easing.linear })
      .start()
    manual.advance(0)
    manual.advance(20)
    manual.advance(20)
    expect(seen).toEqual([0, 5, 10])
  })

  it("removing listeners detaches the node from its parent", () => {
    const { api } = setup()
    const value = new api.Value(0)
    const node = value.interpolate({ inputRange: [0, 1], outputRange: [0, 10] })
    const listener = vi.fn()
    const id = node.addListener(listener)
    node.removeListener(id)
    value.setValue(1)
    expect(listener).not.toHaveBeenCalled()
    // Re-attach still works after a full detach.
    node.addListener(listener)
    value.setValue(0.5)
    expect(listener).toHaveBeenCalledWith({ value: 5 })
    node.removeAllListeners()
    value.setValue(1)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("is read-only: interpolation nodes expose no setValue", () => {
    const { api } = setup()
    const value = new api.Value(0)
    const node = value.interpolate({ inputRange: [0, 1], outputRange: [0, 10] })
    expect(
      (node as unknown as Record<string, unknown>).setValue,
    ).toBeUndefined()
  })

  it("rejects invalid configurations", () => {
    const { api } = setup()
    const value = new api.Value(0)
    expect(() =>
      value.interpolate({ inputRange: [0], outputRange: [0] }),
    ).toThrow(/at least 2/)
    expect(() =>
      value.interpolate({ inputRange: [0, 1], outputRange: [0] }),
    ).toThrow(/same length/)
    expect(() =>
      value.interpolate({ inputRange: [1, 0], outputRange: [0, 1] }),
    ).toThrow(/monotonically/)
    expect(() =>
      value.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "1rad"] }),
    ).toThrow(/units/)
    expect(() =>
      value.interpolate({ inputRange: [0, 1], outputRange: ["deg", "90deg"] }),
    ).toThrow(/cannot parse/)
  })
})
