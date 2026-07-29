// Pure-surface smoke: must stay importable on macOS (no generated bindings),
// so it checks bridge-free modules only. The full public index is exercised
// by tests-gtk/components (Linux container).
import { expect, test } from "vitest"
import { StyleSheet } from "../src/style/index.js"

test("StyleSheet surface is sane", () => {
  const styles = StyleSheet.create({ box: { flex: 1 } })
  expect(styles.box).toEqual({ flex: 1 })
  expect(StyleSheet.hairlineWidth).toBe(1)
  expect(StyleSheet.flatten([{ flex: 1 }, false, { padding: 2 }])).toEqual({
    flex: 1,
    padding: 2,
  })
})
