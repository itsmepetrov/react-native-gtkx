// Turning a `useAnimatedStyle` updater's plain object into a style the view
// layer can drive without React.
//
// The mapper returns ordinary values every frame. On the first run each
// animatable leaf is replaced by a small animated NODE and the mapping is
// remembered; later runs only push new values into those nodes, so a running
// animation costs zero React renders. `src/components/animated.tsx`
// recognises those nodes structurally and writes them straight to GTK —
// `widget.setOpacity` for opacity, the rect store plus `queueAllocate` for
// transforms, and a CSS provider private to the widget for colours.
//
// WHERE THE BOUNDARY IS NOW. Opacity, transforms and colours are driven.
// What is left out is layout — `width`, `height`, `top`, `flex`, every
// `margin*`/`padding*` — and that is a refusal on measured grounds rather
// than a gap waiting to be filled. A layout write has to go through Yoga,
// and a Yoga pass costs what the TREE costs, not what the animated value
// costs: 63 µs for a five-child container, 135 µs at sixty, 519 µs at three
// hundred, per frame, before GTK re-measures the ancestors the resize
// invalidated. The same frame's transform write is 0.7 µs and does not grow
// at all. docs/research/animated-colors.md has the full table and the number
// that would change the decision.
//
// The rule for everything undriveable stays what it was: it must be VISIBLE.
// A property that changes between mapper runs but cannot be driven says so
// once, by name — and layout properties say it in their own words, because
// "use translateX instead of left" is advice and "cannot be written" is not.

import { DRIVEABLE_COLOR_PROPERTIES } from "../style/imperative-css"

export type StyleValue = number | string

export type StyleObject = Record<string, unknown>

/** The animated node a style leaf is replaced with. */
export type StyleNode = {
  addListener(callback: (state: { value: StyleValue }) => void): string
  removeListener(id: string): void
  __getValue(): StyleValue
  /** @internal Publishes a new value to the view layer. */
  __push(value: StyleValue): void
}

/**
 * @internal Shared with `props.ts`: `useAnimatedProps` publishes through the
 * exact same node the style path does, because the receivers duck-type it the
 * same way (`addListener` + `__getValue`).
 */
export const createStyleNode = (initial: StyleValue): StyleNode => {
  let current = initial
  const listeners = new Map<string, (state: { value: StyleValue }) => void>()
  let nextListenerId = 1
  return {
    addListener(callback) {
      const id = String(nextListenerId++)
      listeners.set(id, callback)
      return id
    },
    removeListener(id) {
      listeners.delete(id)
    },
    __getValue() {
      return current
    },
    __push(value) {
      if (Object.is(value, current)) {
        return
      }
      current = value
      for (const listener of [...listeners.values()]) {
        listener({ value: current })
      }
    },
  }
}

const isStyleValue = (value: unknown): value is StyleValue =>
  typeof value === "number" || typeof value === "string"

const OPACITY = "opacity"

const transformLeafKey = (index: number, part: string): string =>
  `transform.${index}.${part}`

// RN's layout properties, as `STYLE_PROPERTIES_CONFIG` enumerates them.
// Enumerated by hand rather than derived by subtracting the driveable set,
// because the point of the list is to produce a DIFFERENT message: these are
// refused for a measured reason and have a real alternative, which
// `borderStyle` does not.
const LAYOUT_PROPERTIES = new Set([
  "aspectRatio",
  "borderBottomWidth",
  "borderEndWidth",
  "borderLeftWidth",
  "borderRightWidth",
  "borderStartWidth",
  "borderTopWidth",
  "borderWidth",
  "bottom",
  "columnGap",
  "end",
  "flex",
  "flexBasis",
  "flexGrow",
  "flexShrink",
  "gap",
  "height",
  "left",
  "margin",
  "marginBottom",
  "marginEnd",
  "marginHorizontal",
  "marginLeft",
  "marginRight",
  "marginStart",
  "marginTop",
  "marginVertical",
  "maxHeight",
  "maxWidth",
  "minHeight",
  "minWidth",
  "padding",
  "paddingBottom",
  "paddingEnd",
  "paddingHorizontal",
  "paddingLeft",
  "paddingRight",
  "paddingStart",
  "paddingTop",
  "paddingVertical",
  "right",
  "rowGap",
  "start",
  "top",
  "width",
])

// Which transform to reach for instead. Only the properties with an exact
// visual equivalent are listed; suggesting `scaleX` for `flexGrow` would be
// worse than saying nothing.
const TRANSFORM_ALTERNATIVE: Record<string, string> = {
  bottom: "translateY",
  end: "translateX",
  height: "scaleY",
  left: "translateX",
  right: "translateX",
  start: "translateX",
  top: "translateY",
  width: "scaleX",
}

// One warning per property name per session, matching the platform's
// warnNativeDriverIgnored policy: a 60 Hz mapper must not produce 60 lines a
// second, and the name is the actionable part.
const warned = new Set<string>()

const warnUndriveable = (property: string): void => {
  if (warned.has(property)) {
    return
  }
  warned.add(property)
  const isProduction =
    typeof process !== "undefined" && process.env.NODE_ENV === "production"
  if (isProduction) {
    return
  }
  if (LAYOUT_PROPERTIES.has(property)) {
    const alternative = TRANSFORM_ALTERNATIVE[property]
    console.warn(
      `react-native-reanimated: useAnimatedStyle changed \`${property}\`, a LAYOUT property. ` +
        "react-native-gtkx does not drive layout at frame rate on purpose: a layout write costs a Yoga " +
        "pass over the container plus a GTK resize of every ancestor, and that cost grows with the tree " +
        "rather than with the number of animated values. " +
        (alternative
          ? `Animate \`transform: [{ ${alternative}: … }]\` instead — it is paint-only, costs the same at ` +
            "any tree size, and is what RN's own native driver restricts you to. "
          : "Transforms are paint-only and cost the same at any tree size. ") +
        "The new value is applied on the next React render. See docs/api.md.",
    )
    return
  }
  console.warn(
    `react-native-reanimated: useAnimatedStyle changed \`${property}\`, which react-native-gtkx cannot ` +
      "write to a mounted widget without a React render. `opacity`, `transform` and colours animate at " +
      "frame rate here; the new value is applied on the next render instead. See docs/api.md.",
  )
}

/** @internal Test seam: the warning is once per session by design. */
export const resetUndriveableWarnings = (): void => {
  warned.clear()
}

/**
 * Collects the animatable leaves of a style, in the order the view layer
 * composes them (the transform array's order IS the composition order in RN).
 */
const leavesOf = (
  source: StyleObject,
): { key: string; value: StyleValue }[] => {
  const leaves: { key: string; value: StyleValue }[] = []
  if (typeof source[OPACITY] === "number") {
    leaves.push({ key: OPACITY, value: source[OPACITY] })
  }
  for (const property of DRIVEABLE_COLOR_PROPERTIES) {
    const value = source[property]
    // Strings only. A colour is a string on this platform (RN's packed
    // integers never reach a GTK stylesheet), so a number here is not a
    // colour we can drive and belongs on the warn path with everything else.
    if (typeof value === "string") {
      leaves.push({ key: property, value })
    }
  }
  if (Array.isArray(source.transform)) {
    source.transform.forEach((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        return
      }
      const part = Object.keys(entry)[0]
      if (part === undefined) {
        return
      }
      const value = (entry as StyleObject)[part]
      if (isStyleValue(value)) {
        leaves.push({ key: transformLeafKey(index, part), value })
      }
    })
  }
  return leaves
}

const signatureOf = (leaves: { key: string }[]): string =>
  leaves.map((leaf) => leaf.key).join("|")

export type AnimatedStyle = {
  /** Stable object handed to `Animated.View`; never replaced in place. */
  readonly style: StyleObject
  /** The nodes behind it, reusable when the style has to be rebuilt. */
  readonly nodes: ReadonlyMap<string, StyleNode>
  /**
   * Publishes a fresh updater result. Returns false when the SHAPE changed
   * (a transform entry appeared, vanished or swapped kind) and the caller
   * must rebuild — the node set no longer matches, and the bindings in the
   * view layer were made against the old one.
   */
  apply(next: StyleObject): boolean
}

/**
 * Builds the node-backed style. `reuse` carries nodes over from a previous
 * build so a shape change keeps the identity of the leaves that survived it,
 * which is what stops the view layer re-binding the parts that did not move.
 */
export const createAnimatedStyle = (
  source: StyleObject,
  reuse?: ReadonlyMap<string, StyleNode>,
): AnimatedStyle => {
  const leaves = leavesOf(source)
  const signature = signatureOf(leaves)
  const nodes = new Map<string, StyleNode>()
  for (const leaf of leaves) {
    const existing = reuse?.get(leaf.key)
    if (existing) {
      existing.__push(leaf.value)
      nodes.set(leaf.key, existing)
    } else {
      nodes.set(leaf.key, createStyleNode(leaf.value))
    }
  }

  const style: StyleObject = { ...source }
  const opacityNode = nodes.get(OPACITY)
  if (opacityNode) {
    style[OPACITY] = opacityNode
  }
  for (const property of DRIVEABLE_COLOR_PROPERTIES) {
    const colorNode = nodes.get(property)
    if (colorNode) {
      style[property] = colorNode
    }
  }
  if (Array.isArray(source.transform)) {
    style.transform = source.transform.map((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        return entry as unknown
      }
      const part = Object.keys(entry)[0]
      if (part === undefined) {
        return entry as unknown
      }
      const node = nodes.get(transformLeafKey(index, part))
      return node ? { [part]: node } : (entry as unknown)
    })
  }

  // The last values seen for everything that is NOT node-backed, so a change
  // can be reported rather than silently dropped.
  let staticSnapshot = source

  return {
    style,
    nodes,
    apply(next) {
      const nextLeaves = leavesOf(next)
      if (signatureOf(nextLeaves) !== signature) {
        return false
      }
      for (const leaf of nextLeaves) {
        nodes.get(leaf.key)?.__push(leaf.value)
      }
      for (const key of Object.keys(next)) {
        if (key === OPACITY || key === "transform" || nodes.has(key)) {
          continue
        }
        if (!Object.is(next[key], staticSnapshot[key])) {
          warnUndriveable(key)
          // Kept up to date anyway: the next React render — whenever it
          // happens, for whatever reason — then applies the current value
          // rather than the one from mount.
          style[key] = next[key]
        }
      }
      staticSnapshot = next
      return true
    },
  }
}
