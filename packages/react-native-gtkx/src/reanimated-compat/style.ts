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
// WHERE THE BOUNDARY IS NOW. Opacity, transforms and colours are driven
// unconditionally. `flex`, every `margin*`/`padding*`, `gap`, `flexBasis` and
// the `min*`/`max*` family are refused, and that is a refusal on measured
// grounds rather than a gap waiting to be filled: a layout write has to go
// through Yoga, and a pass plus its commit walk costs what the CONTAINER
// costs, not what the animated value costs — 52 µs for a five-child
// container, 133 µs at sixty, 496 µs at three hundred, per frame. The same
// frame's transform write is 1.5 µs and does not grow at all.
//
// It is a cost argument and ONLY a cost argument, which is narrower than this
// comment used to claim. docs/research/animated-size.md re-measured the two
// other things that were said here: GTK re-measuring the ancestors after the
// resize adds nothing at any tree size, and a size write cannot move the
// window — the RN root reports a zero size request, so the toplevel never
// re-negotiates. (An `IntrinsicRoot` mounted directly in GTK chrome is the one
// exception, and it does change the window's request.)
//
// TWO CARVE-OUTS, and neither is a softening of that.
//
//  - `top`/`left`/`right`/`bottom` on a node whose OWN `position` is
//    `"absolute"`, because an out-of-flow node's inset has an exact transform
//    equivalent: moving it changes nothing but where it is drawn, which is
//    what the transform path already does, so no Yoga pass is needed at all —
//    src/style/absolute-insets.ts, docs/research/absolute-insets.md.
//  - `width`/`height` where the change is CONFINED to the node that owns it.
//    There is no transform that reproduces a size change (a scale grows about
//    the centre and stretches the content instead of re-laying it out —
//    measured), so this one really does run Yoga; it just runs it rooted at
//    the animated node rather than at the tree's root, which is 6.6 µs for a
//    leaf and 23 µs with wrapped text, IDENTICAL at 5, 60 and 300 siblings —
//    src/style/animated-size.ts, docs/research/animated-size.md.
//
// Both rules are measured, neither is universal, and the configurations where
// they fail are refused as loudly as `flex` is.
//
// The rule for everything undriveable stays what it was: it must be VISIBLE.
// A property that changes between mapper runs but cannot be driven says so
// once, by name — and layout properties say it in their own words, because
// "use translateX instead of left" is advice and "cannot be written" is not.

import {
  INSET_PROPERTIES,
  insetRefusalReason,
  insetTranslation,
} from "../style/absolute-insets"
import { SIZE_PROPERTIES } from "../style/animated-size"
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
const Z_INDEX = "zIndex"

const transformLeafKey = (index: number, part: string): string =>
  `transform.${index}.${part}`

type InsetProperty = (typeof INSET_PROPERTIES)[number]

const isInsetProperty = (property: string): property is InsetProperty =>
  (INSET_PROPERTIES as readonly string[]).includes(property)

const isSizeProperty = (property: string): boolean =>
  (SIZE_PROPERTIES as readonly string[]).includes(property)

/**
 * Whether this style's `property` is one of the insets that becomes a
 * transform. A number is required rather than merely a `DimensionValue`: a
 * percentage has no fixed offset from a point base, and switching to one
 * mid-animation changes the leaf signature, which rebuilds the style and puts
 * the property back on the refusal path where it belongs.
 *
 * The updater's object is not the whole style. `style={[styles.row, animated]}`
 * is how most people write this, so `position` and the opposite edge are very
 * often in a SIBLING entry that this module never sees. When the updater says
 * nothing about `position`, the question is simply not answerable here and the
 * leaf is made optimistically — the view layer re-asks it against the
 * FLATTENED style, which is the only place the true answer exists, and warns
 * there if the answer is no (components/animated.tsx). Nothing becomes silent
 * either way; only which channel says it moves.
 */
const isDriveableInset = (source: StyleObject, property: string): boolean => {
  if (!isInsetProperty(property) || typeof source[property] !== "number") {
    return false
  }
  return source.position === undefined
    ? true
    : insetTranslation(source, property) !== null
}

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

// Which transform to reach for instead, in the two kinds it comes in. The
// distinction is not pedantry — `scaleX` was named as the replacement for
// `width` here and it is not one, which docs/research/animated-size.md §6
// measured on a 100×60 box widened to 260:
//
//   - a scale grows about the view's CENTRE, so the box MOVES: x went 500 →
//     420, where the width change kept it at 500;
//   - a scale scales the CONTENT with the box instead of re-laying it out: the
//     label inside kept its three-line, 45 px-tall layout and was drawn 2.6×
//     wide — stretched glyphs — where the width change re-wrapped it to one
//     line, 15 px tall.
//
// So an inset really does have a transform that reproduces it, and a size does
// not. Offering `scaleX` as if it did sends people to a different behaviour
// with the same name on it — which is also why a numeric `width`/`height` is
// driven for real now and only reaches this table as a PERCENTAGE, where
// there is no point base to lay out at.
const EXACT_ALTERNATIVE: Record<string, string> = {
  bottom: "translateY",
  end: "translateX",
  left: "translateX",
  right: "translateX",
  start: "translateX",
  top: "translateY",
}

const APPROXIMATE_ALTERNATIVE: Record<string, string> = {
  height: "scaleY",
  width: "scaleX",
}

// One warning per property name per session, matching the platform's
// warnNativeDriverIgnored policy: a 60 Hz mapper must not produce 60 lines a
// second, and the name is the actionable part.
const warned = new Set<string>()

const warnUndriveable = (property: string, source: StyleObject): void => {
  if (warned.has(property)) {
    return
  }
  warned.add(property)
  const isProduction =
    typeof process !== "undefined" && process.env.NODE_ENV === "production"
  if (isProduction) {
    return
  }
  const insetReason = isInsetProperty(property)
    ? insetRefusalReason(source, property)
    : null
  if (insetReason) {
    console.warn(
      `react-native-reanimated: useAnimatedStyle changed \`${property}\`. This node IS absolutely ` +
        `positioned — which is normally driven at frame rate here — but ${insetReason}, so no ` +
        "translation reproduces it and it would need a Yoga pass. Give the axis a single edge (or a " +
        `definite size) and \`${property}\` animates; otherwise animate ` +
        `\`transform: [{ ${EXACT_ALTERNATIVE[property]}: … }]\`. The new value is applied on the next ` +
        "React render. See docs/api.md.",
    )
    return
  }
  if (LAYOUT_PROPERTIES.has(property)) {
    const exact = EXACT_ALTERNATIVE[property]
    const approximate = APPROXIMATE_ALTERNATIVE[property]
    console.warn(
      `react-native-reanimated: useAnimatedStyle changed \`${property}\`, a LAYOUT property. ` +
        "react-native-gtkx does not drive layout at frame rate on purpose: a layout write costs a Yoga " +
        "pass over the container plus the commit walk that follows it, and that cost grows with the " +
        "CONTAINER rather than with the number of animated values — measured at 52 µs for a five-child " +
        "container and 496 µs at three hundred, against a transform's 1.5 µs. " +
        (exact
          ? `Animate \`transform: [{ ${exact}: … }]\` instead — it reproduces the move exactly, it is ` +
            "paint-only, it costs the same at any tree size, and it is what RN's own native driver " +
            "restricts you to. "
          : approximate
            ? `The closest transform is \`transform: [{ ${approximate}: … }]\`, but it is NOT the same ` +
              "thing and it is worth knowing how: a scale grows about the view's CENTRE, so the box " +
              "moves as it grows, and it scales the CONTENT with the box instead of re-laying it out — " +
              "text stretches rather than re-wrapping. Reach for it when the content can take being " +
              "stretched (a plain box, an image), not as a replacement. "
            : "Transforms are paint-only and cost the same at any tree size. ") +
        (isInsetProperty(property)
          ? `(\`${property}\` IS driven at frame rate on a node whose own \`position\` is "absolute", ` +
            "where moving it is exactly a translation and touches no sibling.) "
          : isSizeProperty(property)
            ? `(A NUMERIC \`${property}\` IS driven at frame rate where the change is confined to the node ` +
              "that owns it. This one is a percentage, which has no point base to re-lay the subtree out " +
              "at.) "
            : "") +
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
  // Driven for real, and by the same kind of write opacity uses: the paint
  // and pick order of the container (gtkx/bridge/view-box.ts). It has to be
  // driveable rather than merely accepted — `useSortable` puts it in the
  // style object on every frame, so a refusal here is a refusal of the whole
  // sortable-list shape.
  if (typeof source[Z_INDEX] === "number") {
    leaves.push({ key: Z_INDEX, value: source[Z_INDEX] })
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
  for (const property of INSET_PROPERTIES) {
    if (isDriveableInset(source, property)) {
      leaves.push({ key: property, value: source[property] as number })
    }
  }
  // Sizes: a number is the whole of what can be decided HERE. Whether the
  // change is confined to the node depends on the container's
  // `flexDirection`, its `alignItems` and where its own size comes from —
  // none of which is in the updater's object, and none of which is even in
  // the animated component's props. So the leaf is made optimistically and
  // the view layer, which has the layout tree, answers and warns
  // (src/style/animated-size.ts, components/animated.tsx). A percentage stays
  // on the refusal path: it has no point base to lay out at, and switching to
  // one mid-animation changes the leaf signature, which rebuilds the style.
  for (const property of SIZE_PROPERTIES) {
    if (typeof source[property] === "number") {
      leaves.push({ key: property, value: source[property] })
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
  const zIndexNode = nodes.get(Z_INDEX)
  if (zIndexNode) {
    style[Z_INDEX] = zIndexNode
  }
  for (const property of DRIVEABLE_COLOR_PROPERTIES) {
    const colorNode = nodes.get(property)
    if (colorNode) {
      style[property] = colorNode
    }
  }
  // The view layer duck-types these exactly as it does opacity and colours,
  // and turns each into a translate measured from the position Yoga committed
  // (components/animated.tsx, splitAnimated).
  for (const property of INSET_PROPERTIES) {
    const insetNode = nodes.get(property)
    if (insetNode) {
      style[property] = insetNode
    }
  }
  for (const property of SIZE_PROPERTIES) {
    const sizeNode = nodes.get(property)
    if (sizeNode) {
      style[property] = sizeNode
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
          warnUndriveable(key, next)
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
