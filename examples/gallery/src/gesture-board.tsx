// Shared machinery for the two GestureDetector sections.
//
// Every import here is the REAL package name. `react-native-gesture-handler`
// and `react-native-reanimated` are not installed in this workspace; the vite
// preset aliases both onto react-native-gtkx, which is the whole claim: a
// ported app changes nothing in its source.
//
import { useLayoutEffect, useRef, useState } from "react"
import { StyleSheet } from "react-native"
import { useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { palette } from "./ui"

/**
 * The draggable card inside a gesture demo.
 *
 * A saturated fill from the gallery palette, so `palette.onColor` is the
 * right label colour on every one of them in both themes — the gallery's own
 * rule for text sitting ON a fill. The standalone example these came from
 * used pastels checked against one fixed dark surface, which only worked
 * because that surface never changed.
 */
export const board = StyleSheet.create({
  card: {
    height: 84,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardLabel: { color: palette.onColor, fontSize: 12, fontWeight: "700" },
  lane: {
    backgroundColor: palette.cardAlt,
    borderRadius: 10,
  },
})

/**
 * One draggable card: a shared value in, GTK geometry out, no re-render.
 *
 * THE PATTERN TO COPY, and the one bug everybody writes once. `translationX`
 * is measured from where THIS gesture activated, so it starts at zero on
 * every new grab. Writing `x.set(event.translationX)` therefore throws
 * away everything the card had already accumulated and snaps it back toward
 * its origin the moment you grab it a second time. The offset at the start of
 * the gesture has to be captured and added — which is exactly what upstream's
 * own documentation shows, for exactly this reason.
 *
 * Writes go through `set()` rather than `value =` because the React Compiler
 * is ON by default in every gtkx app, and mutating a value a hook returned is
 * the thing it warns about. Reanimated added `get()`/`set()` for exactly that;
 * reads stay on `.value`, which nothing objects to.
 */
export const useDragged = () => {
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const startX = useSharedValue(0)
  const startY = useSharedValue(0)
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }))
  const begin = () => {
    startX.set(x.value)
    startY.set(y.value)
  }
  const moveBy = (dx: number, dy: number) => {
    x.set(startX.value + dx)
    y.set(startY.value + dy)
  }
  return { x, y, style, begin, moveBy }
}

/**
 * The per-card status strings, plus the render count folded into them.
 *
 * Rendered once per STATE CHANGE, never per frame. The count is published by
 * the callbacks rather than read during render: if dragging cost a render,
 * this number would race while a card moved.
 */
export const useStatus = () => {
  const renders = useRef(0)
  useLayoutEffect(() => {
    renders.current += 1
  })

  const [status, setStatus] = useState<Record<string, string>>({})
  const say = (name: string, text: string) => {
    setStatus((previous) => ({
      ...previous,
      [name]: text,
      renders: String(renders.current),
    }))
  }
  return { status, say }
}
