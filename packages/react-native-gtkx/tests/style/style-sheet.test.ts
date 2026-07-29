import { describe, expect, it } from "vitest"
import {
  absoluteFill,
  absoluteFillObject,
  compose,
  create,
  flatten,
  hairlineWidth,
  StyleSheet,
} from "../../src/style/index"
import type { FlatStyle, StyleProp } from "../../src/contracts"

describe("StyleSheet.create", () => {
  it("returns the styles object as-is (identity)", () => {
    const styles = {
      box: { width: 100, backgroundColor: "red" },
      row: { flexDirection: "row" as const },
    }
    expect(create(styles)).toBe(styles)
    expect(create(styles).box).toBe(styles.box)
  })
})

describe("StyleSheet.flatten", () => {
  it("returns an empty object for null/undefined/false", () => {
    expect(flatten(null)).toEqual({})
    expect(flatten(undefined)).toEqual({})
    expect(flatten(false)).toEqual({})
  })

  it("copies a single style object", () => {
    const style: FlatStyle = { width: 10, backgroundColor: "red" }
    expect(flatten(style)).toEqual({ width: 10, backgroundColor: "red" })
    expect(flatten(style)).not.toBe(style)
  })

  it("merges arrays with falsy holes, later entries win", () => {
    const condition = false
    const style: StyleProp<FlatStyle> = [
      { width: 10, height: 20, backgroundColor: "red" },
      null,
      undefined,
      condition && { backgroundColor: "green" },
      { width: 30 },
    ]
    expect(flatten(style)).toEqual({
      width: 30,
      height: 20,
      backgroundColor: "red",
    })
  })

  it("flattens nested arrays recursively", () => {
    const style: StyleProp<FlatStyle> = [
      { flex: 1 },
      [{ margin: 4 }, [{ margin: 8, padding: 2 }, false]],
    ]
    expect(flatten(style)).toEqual({ flex: 1, margin: 8, padding: 2 })
  })
})

describe("StyleSheet.compose", () => {
  it("returns an array when both styles are present", () => {
    const a: FlatStyle = { width: 1 }
    const b: FlatStyle = { width: 2 }
    expect(compose(a, b)).toEqual([a, b])
    expect(flatten(compose(a, b))).toEqual({ width: 2 })
  })

  it("returns the non-null style when the other is missing", () => {
    const a: FlatStyle = { width: 1 }
    expect(compose(a, null)).toBe(a)
    expect(compose(null, a)).toBe(a)
    expect(compose(undefined, a)).toBe(a)
    expect(compose(null, null)).toBeNull()
  })
})

describe("StyleSheet constants", () => {
  it("hairlineWidth is 1", () => {
    expect(hairlineWidth).toBe(1)
  })

  it("absoluteFill(Object) pin all four edges", () => {
    const expected = {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    }
    expect(absoluteFillObject).toEqual(expected)
    expect(absoluteFill).toEqual(expected)
    expect(Object.isFrozen(absoluteFill)).toBe(true)
  })

  it("StyleSheet namespace exposes the full API", () => {
    expect(StyleSheet.create).toBe(create)
    expect(StyleSheet.flatten).toBe(flatten)
    expect(StyleSheet.compose).toBe(compose)
    expect(StyleSheet.absoluteFill).toBe(absoluteFill)
    expect(StyleSheet.absoluteFillObject).toBe(absoluteFillObject)
    expect(StyleSheet.hairlineWidth).toBe(hairlineWidth)
  })
})
