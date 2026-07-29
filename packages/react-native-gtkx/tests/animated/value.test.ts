import { describe, expect, it, vi } from "vitest"
import { createAnimated, Easing } from "../../src/animated/index"
import { createManualScheduler } from "./manual-scheduler"

const setup = () => {
  const manual = createManualScheduler()
  return { manual, api: createAnimated(manual.scheduler) }
}

describe("Animated.Value", () => {
  it("holds the initial value", () => {
    const { api } = setup()
    const value = new api.Value(42)
    expect(value.__getValue()).toBe(42)
  })

  it("setValue updates the value and notifies listeners with { value }", () => {
    const { api } = setup()
    const value = new api.Value(0)
    const listener = vi.fn()
    value.addListener(listener)
    value.setValue(7)
    expect(value.__getValue()).toBe(7)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ value: 7 })
  })

  it("removeListener detaches a single listener by id", () => {
    const { api } = setup()
    const value = new api.Value(0)
    const first = vi.fn()
    const second = vi.fn()
    const firstId = value.addListener(first)
    const secondId = value.addListener(second)
    expect(firstId).not.toBe(secondId)
    value.removeListener(firstId)
    value.setValue(1)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it("removeAllListeners detaches everything", () => {
    const { api } = setup()
    const value = new api.Value(0)
    const first = vi.fn()
    const second = vi.fn()
    value.addListener(first)
    value.addListener(second)
    value.removeAllListeners()
    value.setValue(1)
    expect(first).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()
  })

  it("stopAnimation without a running animation reports the current value", () => {
    const { api } = setup()
    const value = new api.Value(3)
    const callback = vi.fn()
    value.stopAnimation(callback)
    expect(callback).toHaveBeenCalledWith(3)
  })

  it("stopAnimation freezes a running animation mid-flight", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const end = vi.fn()
    api
      .timing(value, { toValue: 1, duration: 100, easing: Easing.linear })
      .start(end)
    manual.advance(0)
    manual.advance(50)
    const callback = vi.fn()
    value.stopAnimation(callback)
    expect(callback).toHaveBeenCalledWith(0.5)
    expect(end).toHaveBeenCalledWith({ finished: false })
    expect(value.__getValue()).toBe(0.5)
    expect(manual.activeCount()).toBe(0)
  })

  it("setValue preempts a running animation with finished: false", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const end = vi.fn()
    api
      .timing(value, { toValue: 1, duration: 100, easing: Easing.linear })
      .start(end)
    manual.advance(0)
    manual.advance(25)
    value.setValue(9)
    expect(end).toHaveBeenCalledWith({ finished: false })
    expect(value.__getValue()).toBe(9)
    expect(manual.activeCount()).toBe(0)
    manual.advance(100)
    expect(value.__getValue()).toBe(9)
  })

  it("resetAnimation snaps back to the construction-time value and notifies", () => {
    const { manual, api } = setup()
    const value = new api.Value(2)
    api
      .timing(value, { toValue: 10, duration: 100, easing: Easing.linear })
      .start()
    manual.advance(0)
    manual.advance(50)
    expect(value.__getValue()).toBe(6)
    const listener = vi.fn()
    value.addListener(listener)
    const callback = vi.fn()
    value.resetAnimation(callback)
    expect(callback).toHaveBeenCalledWith(6)
    expect(value.__getValue()).toBe(2)
    expect(listener).toHaveBeenCalledWith({ value: 2 })
    expect(manual.activeCount()).toBe(0)
  })
})
