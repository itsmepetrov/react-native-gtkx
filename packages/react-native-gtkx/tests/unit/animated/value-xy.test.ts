// Animated.ValueXY and the offset split it rests on. Pure logic, so it runs
// anywhere; the drag it exists for is covered on a real screen by the
// gallery and by the responder tests.
import { describe, expect, it, vi } from "vitest"
import { AnimatedValue } from "../../../src/animated/value"
import { AnimatedValueXY } from "../../../src/animated/value-xy"

describe("AnimatedValue offsets", () => {
  it("reports the sum of the animated part and the offset", () => {
    const value = new AnimatedValue(10)
    expect(value.__getValue()).toBe(10)

    value.setOffset(5)
    expect(value.__getValue()).toBe(15)

    value.setValue(2)
    expect(value.__getValue()).toBe(7)
  })

  it("flattenOffset folds the offset in without moving the sum", () => {
    const value = new AnimatedValue(3)
    value.setOffset(9)
    value.flattenOffset()

    expect(value.__getValue()).toBe(12)
    // The offset is spent: a further setValue is absolute again, which is
    // what makes a second drag start from where the first ended.
    value.setValue(1)
    expect(value.__getValue()).toBe(1)
  })

  it("extractOffset is flattenOffset's mirror", () => {
    const value = new AnimatedValue(7)
    value.extractOffset()

    expect(value.__getValue()).toBe(7)
    value.setValue(4)
    expect(value.__getValue()).toBe(11)
  })

  it("notifies listeners with the sum, not the animated part", () => {
    const value = new AnimatedValue(0)
    const seen: number[] = []
    value.addListener(({ value: next }) => {
      seen.push(next)
    })

    value.setOffset(100)
    value.setValue(5)

    expect(seen).toEqual([100, 105])
  })

  it("leaves untouched values byte-identical to before offsets existed", () => {
    const value = new AnimatedValue(4)
    const seen: number[] = []
    value.addListener(({ value: next }) => {
      seen.push(next)
    })
    value.setValue(9)

    expect(value.__getValue()).toBe(9)
    expect(seen).toEqual([9])
  })
})

describe("AnimatedValueXY", () => {
  it("moves both axes together", () => {
    const pan = new AnimatedValueXY()
    pan.setValue({ x: 12, y: -4 })

    expect(pan.x.__getValue()).toBe(12)
    expect(pan.y.__getValue()).toBe(-4)
    expect(pan.__getValue()).toEqual({ x: 12, y: -4 })
  })

  it("supports the continuing-drag idiom", () => {
    const pan = new AnimatedValueXY()

    // First drag.
    pan.setValue({ x: 30, y: 10 })
    // Released: keep where it ended, so the next gesture's dx starts at 0.
    pan.extractOffset()
    pan.setValue({ x: 0, y: 0 })
    expect(pan.__getValue()).toEqual({ x: 30, y: 10 })

    // Second drag, reported as a fresh dx/dy by PanResponder.
    pan.setValue({ x: 5, y: 2 })
    expect(pan.__getValue()).toEqual({ x: 35, y: 12 })
  })

  it("fires one listener for movement on either axis", () => {
    const pan = new AnimatedValueXY()
    const listener = vi.fn()
    pan.addListener(listener)

    pan.x.setValue(3)
    expect(listener).toHaveBeenLastCalledWith({ x: 3, y: 0 })

    pan.y.setValue(8)
    expect(listener).toHaveBeenLastCalledWith({ x: 3, y: 8 })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("removeListener unsubscribes both axes", () => {
    const pan = new AnimatedValueXY()
    const listener = vi.fn()
    const id = pan.addListener(listener)
    pan.removeListener(id)

    pan.setValue({ x: 1, y: 1 })
    expect(listener).not.toHaveBeenCalled()
  })

  it("hands out the transform a dragged view spreads into its style", () => {
    const pan = new AnimatedValueXY({ x: 2, y: 3 })
    const transform = pan.getTranslateTransform()

    expect(transform[0].translateX).toBe(pan.x)
    expect(transform[1].translateY).toBe(pan.y)
    expect(pan.getLayout().left).toBe(pan.x)
    expect(pan.getLayout().top).toBe(pan.y)
  })
})
