import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type ElementType,
  type ReactNode,
  type Ref,
} from "react"
import type { DrivenSize } from "../layout/driven-size"
import {
  INSET_PROPERTIES,
  insetRefusalReason,
  insetTranslation,
  type InsetProperty,
} from "../style/absolute-insets"
import {
  drivenSizeRefusal,
  SIZE_PROPERTIES,
  type SizeProperty,
} from "../style/animated-size"
import {
  DRIVEABLE_COLOR_PROPERTIES,
  driveableColorsToCss,
  type DriveableColorProperty,
} from "../style/imperative-css"
import { StyleSheet } from "../style/index"
import { createAnimated } from "../animated/index"
import type {
  DimensionValue,
  FlatStyle,
  PointerEventsValue,
  StyleProp,
  TransformPart,
} from "../contracts"
import {
  createWidgetCss,
  GtkBox,
  queueAllocate,
  setBoxPassthrough,
  setPointerTarget,
  setZIndex,
  type Gtk,
  type WidgetCss,
} from "../gtkx/bridge/index"
import type { ResponderProps } from "../responder/types"
import { useResponder } from "../responder/use-responder"
import { applyDrivenSize, releaseDrivenSize } from "./driven-size"
import { glibScheduler } from "./frame-scheduler"
import { HostNodeContext, useHostNode, type HostNode } from "./host-node"
import { Image } from "./image"
import {
  createMeasureHandle,
  widgetForHandle,
  type MeasureHandle,
} from "./measure"
import { setStoredTransform } from "./rect-store"
import { ScrollView } from "./scroll-view"
import { Text } from "./text"
import {
  nodeForWidget,
  useLayoutChild,
  useRnContainer,
  type LayoutEvent,
} from "./use-layout-child"

const api = createAnimated(glibScheduler)

// Interpolations produce suffixed strings ("45deg"), so a driven value is
// not necessarily a number — `rotate` is normally an interpolate() with a
// deg outputRange.
type AnimatedValue = number | string

type AnimatedNode = {
  addListener(callback: (state: { value: AnimatedValue }) => void): string
  removeListener(id: string): void
  __getValue(): AnimatedValue
}

const isAnimatedNode = (value: unknown): value is AnimatedNode =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as AnimatedNode).addListener === "function" &&
  typeof (value as AnimatedNode).__getValue === "function"

type AnimatedTransformPart = { [key: string]: number | string | AnimatedNode }

// One entry of the style's transform array, kept in source order. The array
// order IS the composition order in RN, so an animated entry updates its own
// slot in place instead of being lifted out of the list — that is what makes
// [{rotate}, {translateX}] compose differently from the reverse, as in RN.
type TransformSlot = {
  key: string
  node: AnimatedNode | null
  value: AnimatedValue
  // Set only on a slot DERIVED from an animated inset (`top`/`left`/`right`/
  // `bottom` on a node whose own position is absolute). The slot then carries
  // `sign * (inset - base)`, where `base` is the inset value Yoga was given at
  // the last React commit — see splitAnimated.
  inset?: { base: number; sign: 1 | -1 }
}

const toNumber = (value: AnimatedValue): number =>
  typeof value === "number" ? value : Number.parseFloat(value)

// What a slot actually writes into the transform array. An ordinary slot
// writes its value; a derived inset slot writes its offset from the committed
// base, which is what makes an absolute `top` a translation.
const slotValue = (
  slot: TransformSlot,
  value: AnimatedValue,
): AnimatedValue => {
  if (!slot.inset) {
    return value
  }
  const numeric = toNumber(value)
  // A non-numeric inset (a percentage produced mid-animation) has no offset
  // from a point base. Holding the last position beats jumping to NaN, and
  // the leaf never becomes driveable in the first place unless it starts
  // numeric — see style/absolute-insets.ts and reanimated-compat/style.ts.
  return Number.isFinite(numeric)
    ? slot.inset.sign * (numeric - slot.inset.base)
    : 0
}

// Stable per-node identity for the effect's dependency key: Animated nodes
// are objects, and the bindings must be rebuilt when the node behind a slot
// changes — not on every render that rebuilds an equal-looking array.
let nextNodeId = 1
const nodeIds = new WeakMap<object, number>()
const nodeId = (value: object): number => {
  let id = nodeIds.get(value)
  if (id === undefined) {
    id = nextNodeId++
    nodeIds.set(value, id)
  }
  return id
}

// Omit, not plain intersection: intersecting would AND the animated transform
// with FlatStyle's numeric one, rejecting Animated.Value entries.
export type AnimatedViewStyle = Omit<
  FlatStyle,
  | "opacity"
  | "zIndex"
  | "transform"
  | DriveableColorProperty
  | InsetProperty
  | SizeProperty
> & {
  opacity?: number | AnimatedNode
  zIndex?: number | AnimatedNode
  transform?: (TransformPart | AnimatedTransformPart)[]
} & Partial<Record<DriveableColorProperty, string | AnimatedNode>> &
  Partial<Record<InsetProperty, DimensionValue | AnimatedNode>> &
  Partial<Record<SizeProperty, DimensionValue | AnimatedNode>>

/** What every animated component accepts as `style`, arrays and falsy included. */
export type AnimatedStyleProp =
  AnimatedViewStyle | readonly (AnimatedViewStyle | false | null | undefined)[]

// Animated.View is where a PanResponder drag lands in idiomatic RN — the
// dragged box is animated by definition — so it takes the responder props
// exactly as View does.
export type AnimatedViewProps = ResponderProps & {
  style?: AnimatedStyleProp
  children?: ReactNode
  onLayout?: (event: LayoutEvent) => void
  testID?: string
  // Reanimated's `Animated.View` IS `createAnimatedComponent(View)` upstream,
  // so it takes every View prop — `pointerEvents` included. Dropping it made
  // an invisible full-screen overlay swallow every press underneath it, which
  // is exactly how `react-native-drawer-layout`'s `Overlay` is built
  // (opacity 0 plus `pointerEvents: "none"`): the drawer's own edge swipe
  // worked and NOTHING inside the app did.
  pointerEvents?: PointerEventsValue
  // The other half of the same parity gap. `useAnimatedProps` returns an
  // object of current values, and `createAnimatedComponent` already spreads
  // it — but `Animated.View` is written by hand here rather than produced by
  // that factory, so it has to spread it too. Upstream's `Overlay` sets
  // `pointerEvents` through THIS channel, not as a static prop.
  animatedProps?: Record<string, unknown>
  // Same handle a plain View exposes. RN gives every host component the
  // imperative geometry methods, and Reanimated's `useAnimatedRef` +
  // `measure()` is written against an Animated.View having them — without
  // this, measuring an animated view means wrapping it in a plain one.
  ref?: Ref<MeasureHandle>
}

// One driven colour property. Unlike transforms these do not compose, so each
// is simply the latest value of its own declaration.
type ColorSlot = {
  property: DriveableColorProperty
  node: AnimatedNode
}

// One driven size. `base` is the value Yoga was given at the last React
// commit, which is what the rebase moves and what the committed rect the
// override sits on top of was laid out at.
type SizeSlot = {
  property: SizeProperty
  node: AnimatedNode
  base: number
}

// One warning per inset property per session, like every other channel here.
const warnedInsets = new Set<string>()

const insetTranslationOf = (property: InsetProperty): string =>
  property === "top" || property === "bottom" ? "translateY" : "translateX"

const warnInsetNotTranslatable = (
  property: InsetProperty,
  reason: string | null,
): void => {
  if (warnedInsets.has(property)) {
    return
  }
  warnedInsets.add(property)
  const isProduction =
    typeof process !== "undefined" && process.env.NODE_ENV === "production"
  if (isProduction) {
    return
  }
  const spec = insetTranslationOf(property)
  console.warn(
    `react-native-gtkx: an animated \`${property}\` cannot be driven here. ` +
      (reason
        ? `The node IS absolutely positioned, but ${reason}, so there is no translation that reproduces it. `
        : "`top`/`left`/`right`/`bottom` are driven at frame rate only on a node whose own `position` is " +
          '"absolute", where moving it is exactly a translation and touches no sibling. Anything else needs a ' +
          "Yoga pass over the container plus its commit walk, which costs what the CONTAINER costs (71 µs at " +
          "five children, 509 µs at three hundred) against a transform's 0.12 µs. ") +
      `Animate \`transform: [{ ${spec}: … }]\` instead. ` +
      "The value is still applied on the next React render. See docs/api.md.",
  )
}

/** @internal Test seam: the warning is once per property per session by design. */
export const resetAnimatedInsetWarnings = (): void => {
  warnedInsets.clear()
}

// Same policy for sizes: once per property per session, and the reason is the
// actionable part — the rule refuses for one of eight named reasons and each
// of them has a different fix.
const warnedSizes = new Set<string>()

const warnSizeNotDriveable = (property: SizeProperty, reason: string): void => {
  if (warnedSizes.has(property)) {
    return
  }
  warnedSizes.add(property)
  const isProduction =
    typeof process !== "undefined" && process.env.NODE_ENV === "production"
  if (isProduction) {
    return
  }
  const scale = property === "width" ? "scaleX" : "scaleY"
  console.warn(
    `react-native-gtkx: an animated \`${property}\` cannot be driven here, because ${reason}. ` +
      `\`width\`/\`height\` run at frame rate only where the change stops at the node that owns it — the ` +
      "node's own subtree is then re-laid-out pinned to the driven value (7.1 µs for a leaf, 21.7 µs with " +
      "wrapped text, the same at five children and at three hundred) and one allocation puts it on screen. " +
      "Anything else needs a Yoga pass over the container plus its commit walk, which costs what the " +
      "CONTAINER costs: 71 µs at five children, 509 µs at three hundred, against a transform's 0.6 µs. " +
      `The closest transform is \`transform: [{ ${scale}: … }]\`, but it is NOT the same thing — a scale ` +
      "grows about the view's centre, so the box moves as it grows, and it scales the content with the box " +
      "instead of re-laying it out, so text stretches rather than re-wrapping. " +
      "The new value is applied on the next React render either way. See docs/api.md.",
  )
}

/** @internal Test seam: the warning is once per property per session by design. */
export const resetAnimatedSizeWarnings = (): void => {
  warnedSizes.clear()
}

const splitAnimated = (
  style: AnimatedStyleProp | false | null | undefined,
): {
  staticStyle: StyleProp
  opacity: AnimatedNode | null
  zIndex: AnimatedNode | null
  slots: TransformSlot[]
  colors: ColorSlot[]
  sizes: SizeSlot[]
} => {
  const flat: Record<string, unknown> = {}
  const collect = (
    entry: AnimatedStyleProp | false | null | undefined,
  ): void => {
    if (!entry) {
      return
    }
    if (Array.isArray(entry)) {
      entry.forEach(collect)
      return
    }
    Object.assign(flat, entry)
  }
  collect(style)

  let opacity: AnimatedNode | null = null
  let zIndex: AnimatedNode | null = null
  const slots: TransformSlot[] = []
  const colors: ColorSlot[] = []
  const sizes: SizeSlot[] = []

  if (isAnimatedNode(flat.opacity)) {
    opacity = flat.opacity
    delete flat.opacity
  }
  // `zIndex` is in `useSortable`'s style object on every frame and changes
  // value about twice per drag. It takes the same door opacity does — one
  // widget-level write, no Yoga, no CSS — so there is nothing to refuse.
  if (isAnimatedNode(flat.zIndex)) {
    zIndex = flat.zIndex
    delete flat.zIndex
  }
  for (const property of DRIVEABLE_COLOR_PROPERTIES) {
    const value = flat[property]
    if (isAnimatedNode(value)) {
      colors.push({ property, node: value })
      // Removed from the static style so the shared class registry never sees
      // a per-frame value: its memoisation stays keyed on styles that change
      // when React renders, which is the only thing it is good at.
      delete flat[property]
    }
  }
  if (Array.isArray(flat.transform)) {
    for (const part of flat.transform as AnimatedTransformPart[]) {
      const key = Object.keys(part)[0]
      if (key === undefined) {
        continue
      }
      const value = part[key]
      slots.push(
        isAnimatedNode(value)
          ? { key, node: value, value: value.__getValue() }
          : { key, node: null, value: value as AnimatedValue },
      )
    }
    // The whole array is owned here from now on, static entries included:
    // leaving them in the style would make useLayoutChild write the same
    // rect-store slot from the other side, and the two would overwrite
    // each other every render.
    delete flat.transform
  }

  // Slice 2b: an animated inset on an absolutely positioned node becomes a
  // derived translate. It is the one layout property with an exact transform
  // equivalent, because an out-of-flow node's position affects nothing but
  // where it is drawn — see src/style/absolute-insets.ts for the measured
  // rule and for the configurations where the equivalence does NOT hold.
  //
  // Three things happen here at once, and all three are load-bearing:
  //
  //  - THE BASE. The inset's current value is written back into the static
  //    style as a plain number, so Yoga is given a real position and the
  //    committed rect the parent's allocate reads is the base the offset is
  //    measured from. Nothing about the shadow tree changes.
  //  - THE REBASE. This runs on every render, so when React commits a layout
  //    with a different inset, the base moves and the offset is recomputed
  //    against it in the SAME commit — the Yoga write and the offset write
  //    are both layout effects, and the engine's flush is a microtask, so GTK
  //    never gets a frame in between and there is no jump.
  //  - THE ORDER. Derived slots go FIRST. The array's leftmost entry is the
  //    outermost matrix (style/transform.ts), so a derived translate is
  //    applied to the point LAST — it moves the already-rotated, already-
  //    scaled box in the parent's coordinates, exactly as a layout position
  //    does. Appending instead would put the user's scale on the OUTSIDE and
  //    multiply the offset by it.
  const insetSlots: TransformSlot[] = []
  for (const property of INSET_PROPERTIES) {
    const value = flat[property]
    if (!isAnimatedNode(value)) {
      continue
    }
    const base = toNumber(value.__getValue())
    const translation = Number.isFinite(base)
      ? insetTranslation(flat, property)
      : null
    if (!translation) {
      // Not an equivalence. Resolve to the current value so the static style
      // is at least correct on this render, and keep slice 2's refusal loud.
      flat[property] = Number.isFinite(base) ? base : undefined
      warnInsetNotTranslatable(property, insetRefusalReason(flat, property))
      continue
    }
    flat[property] = base
    insetSlots.push({
      key: translation.transform,
      node: value,
      value: 0,
      inset: { base, sign: translation.sign },
    })
  }

  // Slice 3: an animated `width`/`height` where the change is confined to the
  // node that owns it. Unlike an inset this is NOT re-expressed as a
  // transform — there is no transform that reproduces a size change, which
  // docs/research/animated-size.md §6 measured rather than assumed — so the
  // slot carries the property itself and the view layer drives it through a
  // pinned pass over the node's own subtree.
  //
  // THE REBASE, exactly as above and for the same reason: the driven value is
  // written back into the static style as a plain number, so Yoga is given the
  // size the animation is currently showing and the committed rect the
  // override sits on catches up in the SAME commit. Both writes are layout
  // effects and the engine's flush is a microtask, so GTK never gets a frame
  // in between.
  //
  // WHETHER it can be driven is not decided here. The answer depends on the
  // CONTAINER's `flexDirection`, its `alignItems` and where its own size comes
  // from, none of which are in this style object or in this component's props
  // — it is asked of the layout tree in useAnimatedBinding, which is the only
  // place the tree exists.
  for (const property of SIZE_PROPERTIES) {
    const value = flat[property]
    if (!isAnimatedNode(value)) {
      continue
    }
    const base = toNumber(value.__getValue())
    if (!Number.isFinite(base)) {
      // A percentage produced mid-animation has no point base to lay out at.
      // Dropped rather than driven, and the leaf never becomes driveable in
      // the first place unless it starts numeric — reanimated-compat/style.ts.
      flat[property] = undefined
      continue
    }
    flat[property] = base
    sizes.push({ property, node: value, base })
  }

  return {
    staticStyle: flat as StyleProp,
    opacity,
    zIndex,
    slots: insetSlots.length > 0 ? [...insetSlots, ...slots] : slots,
    colors,
    sizes,
  }
}

/**
 * The imperative write path, and the whole of it.
 *
 * Animated values bypass React entirely: listeners write straight to the
 * widget (opacity), to the rect store (the transform applied by the parent's
 * allocate) on top of the engine-committed base rect, and to a CSS provider
 * private to the widget (colours). Animation frames never touch Yoga, and
 * never touch the shared stylesheet.
 *
 * Nothing here is View-specific, which is why it is a hook rather than a
 * paragraph inside `AnimatedView`: it needs the CHILD's widget (for
 * `setOpacity` and the rect store) and its PARENT's (for `queueAllocate`),
 * and any component that can produce those two can be animated. The child is
 * reached through a getter rather than a ref because a wrapper does not own
 * the widget — it reads it back out of whatever handle the wrapped component
 * exposed, which may only exist after that component's own layout effects.
 */
const useAnimatedBinding = (
  getWidget: () => Gtk.Widget | null,
  host: HostNode,
  opacity: AnimatedNode | null,
  zIndex: AnimatedNode | null,
  slots: TransformSlot[],
  colors: ColorSlot[],
  sizes: SizeSlot[],
  // Anything else that must force a rebind. `AnimatedView` passes its layout
  // node; the generic wrapper has nothing to add.
  rebindKey?: unknown,
): void => {
  // The effect reads the slots of the render that (re)armed it; the values
  // inside are then owned by the listeners.
  const slotsRef = useRef<TransformSlot[]>(slots)
  slotsRef.current = slots
  const colorsRef = useRef<ColorSlot[]>(colors)
  colorsRef.current = colors
  const sizesRef = useRef<SizeSlot[]>(sizes)
  sizesRef.current = sizes
  const getWidgetRef = useRef(getWidget)
  getWidgetRef.current = getWidget
  const hostRef = useRef(host)
  hostRef.current = host
  const parentWidgetRef = host.widgetRef

  // Rebind on a change of shape (which transforms, in which order), of the
  // node behind an animated entry, or of a static entry's value — not on
  // every render that rebuilds an equal-looking array.
  //
  // A derived inset slot adds its BASE to the key, and that is what makes the
  // rebase happen: React committing a new `top` moves the base, which re-arms
  // this effect in the same commit that gives Yoga the new position.
  const bindingKey =
    (opacity ? `opacity#${nodeId(opacity)}` : "") +
    (zIndex ? `zIndex#${nodeId(zIndex)}` : "") +
    slots
      .map((slot) => {
        const inset = slot.inset ? `~${slot.inset.sign}:${slot.inset.base}` : ""
        return slot.node
          ? `|${slot.key}#${nodeId(slot.node)}${inset}`
          : `|${slot.key}=${String(slot.value)}`
      })
      .join("") +
    colors.map((slot) => `|${slot.property}#${nodeId(slot.node)}`).join("") +
    // The base is in the key for the same reason a derived inset's is: React
    // committing a new size moves it, and re-arming here is what hands the
    // override back to the engine in the same commit that gives Yoga the new
    // value.
    sizes
      .map((slot) => `|${slot.property}#${nodeId(slot.node)}~${slot.base}`)
      .join("")

  useLayoutEffect(() => {
    const widget = getWidgetRef.current()
    if (!widget) {
      return
    }
    // Captured for the CLEANUP only: by then the ref may already have been
    // detached, and the container to re-allocate is the one this binding was
    // made against. Every live write below re-reads the ref instead.
    const boundParentWidget = parentWidgetRef.current

    // The live transform array, mutated in place: an Animated write must
    // stay one numeric store plus one queued allocation — no React render,
    // no Yoga pass, no allocation per frame beyond the composed matrix.
    //
    // RN transform semantics: this is paint-only. The result goes to the
    // rect store unclamped — the parent's measure ignores children, so a
    // transformed child draws past the boundary over its neighbors without
    // moving a single ancestor.
    const parts = slotsRef.current.map(
      (slot) =>
        ({
          [slot.key]: slot.node
            ? slotValue(slot, slot.node.__getValue())
            : slot.value,
        }) as Record<string, AnimatedValue>,
    )

    const flush = (): void => {
      const widget = getWidgetRef.current()
      if (!widget) {
        return
      }
      setStoredTransform(widget, parts as unknown as TransformPart[])
      const parentWidget = parentWidgetRef.current
      if (parentWidget) {
        queueAllocate(parentWidget)
      }
    }

    const subscriptions: { node: AnimatedNode; id: string }[] = []
    slotsRef.current.forEach((slot, index) => {
      if (!slot.node) {
        return
      }
      const part = parts[index]!
      subscriptions.push({
        node: slot.node,
        id: slot.node.addListener(({ value }) => {
          part[slot.key] = slotValue(slot, value)
          flush()
        }),
      })
    })

    if (opacity) {
      const applyOpacity = (value: AnimatedValue): void => {
        const numeric = typeof value === "number" ? value : parseFloat(value)
        getWidgetRef.current()?.setOpacity(Math.min(1, Math.max(0, numeric)))
      }
      subscriptions.push({
        node: opacity,
        id: opacity.addListener(({ value }) => {
          applyOpacity(value)
        }),
      })
      applyOpacity(opacity.__getValue())
    }

    // The container's paint and pick order (gtkx/bridge/view-box.ts). The
    // write drops the container's cached order and queues a redraw; nothing
    // is re-measured and nothing is re-allocated, because zIndex changes
    // neither.
    if (zIndex) {
      const applyZIndex = (value: AnimatedValue): void => {
        const widget = getWidgetRef.current()
        if (!widget) {
          return
        }
        const numeric = typeof value === "number" ? value : parseFloat(value)
        setZIndex(widget, Number.isFinite(numeric) ? Math.round(numeric) : 0)
      }
      subscriptions.push({
        node: zIndex,
        id: zIndex.addListener(({ value }) => {
          applyZIndex(value)
        }),
      })
      applyZIndex(zIndex.__getValue())
    }

    // Colours take the other imperative door: a CSS provider private to this
    // widget, replaced in place. Deliberately NOT the shared class registry —
    // that one memoises by CSS text, so a driven colour would mint a class per
    // frame into a document GTK re-parses whole and that is never pruned
    // (docs/research/animated-colors.md). All driven colours share one
    // provider and one declaration block: two properties animating together
    // are one write, not two.
    const colorSlots = colorsRef.current
    let widgetCss: WidgetCss | null = null
    if (colorSlots.length > 0) {
      const css = createWidgetCss(widget)
      widgetCss = css
      const values: Record<string, unknown> = {}
      const writeColors = (): void => {
        css.set(driveableColorsToCss(values))
      }
      for (const slot of colorSlots) {
        values[slot.property] = slot.node.__getValue()
        subscriptions.push({
          node: slot.node,
          id: slot.node.addListener(({ value }) => {
            values[slot.property] = value
            writeColors()
          }),
        })
      }
      writeColors()
    }

    // Sizes take the third door, and it is the only one that runs Yoga.
    //
    // Nothing is written at BIND time on purpose: the render that armed this
    // effect put the current value into the static style, so the engine is
    // already committing exactly this size and an override would be a copy of
    // it. The first write happens when a frame asks for something else.
    const sizeSlots = sizesRef.current
    const drivenWidgets: Gtk.Widget[] = []
    if (sizeSlots.length > 0) {
      const layoutNode = nodeForWidget(widget)
      const driven: DrivenSize = {}
      const driveable = new Set<SizeProperty>()
      let decided = false
      // Deferred to the first frame that actually asks for a new size, and
      // that is not laziness: the rule is asked of the CONTAINER's Yoga node,
      // and on a first mount a container's own layout effects run AFTER its
      // children's — so at bind time the container may still be carrying the
      // defaults rather than its style. By the first frame the tree has been
      // laid out at least once and the answer is the real one.
      const decide = (): void => {
        decided = true
        if (!layoutNode) {
          return
        }
        const context = {
          node: layoutNode,
          rootIsContentSized: hostRef.current.engine.contentSized,
        }
        for (const slot of sizeSlots) {
          const reason = drivenSizeRefusal(context, slot.property)
          if (reason === null) {
            driveable.add(slot.property)
          } else {
            warnSizeNotDriveable(slot.property, reason)
          }
        }
      }
      for (const slot of sizeSlots) {
        subscriptions.push({
          node: slot.node,
          id: slot.node.addListener(({ value }) => {
            const numeric = toNumber(value)
            if (!Number.isFinite(numeric)) {
              return
            }
            if (!decided) {
              decide()
            }
            if (!driveable.has(slot.property) || !layoutNode) {
              return
            }
            driven[slot.property] = numeric
            const target = getWidgetRef.current()
            if (target) {
              applyDrivenSize(
                layoutNode,
                target,
                parentWidgetRef.current,
                driven,
                drivenWidgets,
              )
            }
          }),
        })
      }
    }

    flush()

    return () => {
      for (const { node: animated, id } of subscriptions) {
        animated.removeListener(id)
      }
      widgetCss?.dispose()
      // Every widget this binding was driving goes back to the rect the
      // engine committed. On a REBASE that is the whole point: the render
      // that re-armed this effect handed Yoga the size the animation is
      // showing, so the committed rect is about to become the driven one and
      // holding an override on top of it would be holding a stale copy.
      if (drivenWidgets.length > 0) {
        releaseDrivenSize(drivenWidgets)
        if (boundParentWidget) {
          queueAllocate(boundParentWidget)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindingKey, rebindKey])
}

const AnimatedView = ({
  style,
  children,
  onLayout,
  testID,
  ref,
  pointerEvents,
  animatedProps,
  ...responderProps
}: AnimatedViewProps) => {
  const widgetRef = useRef<Gtk.Box | null>(null)
  const { staticStyle, opacity, zIndex, slots, colors, sizes } =
    splitAnimated(style)

  const { host, node, cssClass } = useLayoutChild(widgetRef, {
    style: staticStyle,
    onLayout,
  })
  useRnContainer(widgetRef, node)
  useResponder(widgetRef, responderProps)

  // `animatedProps` LAST, matching `createAnimatedComponent`'s
  // `{ ...rest, ...animatedProps }` — a value produced by the updater is the
  // live one and wins over the static prop. Only the picking mode is read
  // here: a numeric animated prop has no meaning on a View, and the SVG
  // shapes that do take them go through `createAnimatedComponent` already.
  const mode: PointerEventsValue =
    (animatedProps?.pointerEvents as PointerEventsValue | undefined) ??
    pointerEvents ??
    StyleSheet.flatten(staticStyle)?.pointerEvents ??
    "auto"

  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    setPointerTarget(widget, mode !== "none")
    setBoxPassthrough(widget, mode === "box-none")
  }, [mode])

  useImperativeHandle(ref, () => createMeasureHandle(widgetRef, node), [node])

  useAnimatedBinding(
    () => widgetRef.current,
    host,
    opacity,
    zIndex,
    slots,
    colors,
    sizes,
    node,
  )

  return (
    <GtkBox
      ref={widgetRef}
      name={testID}
      cssClasses={cssClass ? [cssClass] : []}
    >
      <HostNodeContext.Provider
        value={{ engine: host.engine, node, widgetRef }}
      >
        {children}
      </HostNodeContext.Provider>
    </GtkBox>
  )
}

// --- createAnimatedComponent ---------------------------------------------

/** Node-backed props from `useAnimatedProps`, spread onto the wrapped component. */
export type AnimatedPropsProp = Record<string, unknown>

/** The props an animated wrapper adds on top of the component's own. */
export type AnimatedComponentExtraProps = {
  style?: AnimatedStyleProp
  animatedProps?: AnimatedPropsProp
}

// `Partial`, as upstream's own `AnimatedProps<Props>` effectively is: a prop
// supplied through `animatedProps` is invisible to the type system here, so
// insisting on the wrapped component's required props would reject exactly
// the call the feature exists for (`<AnimatedCircle animatedProps={{ r }} />`).
export type AnimatedComponent<C extends ElementType> = (
  props: Partial<Omit<ComponentProps<C>, "style">> &
    AnimatedComponentExtraProps,
) => ReactNode

const displayNameOf = (component: unknown): string => {
  if (typeof component === "string") {
    return component
  }
  const named = component as { displayName?: string; name?: string }
  return named?.displayName ?? named?.name ?? "Component"
}

// One warning per wrapped component per session — a mapper runs at frame
// rate, and the name is the actionable part.
const warnedWithoutWidget = new Set<string>()

const warnNoWidget = (name: string): void => {
  if (warnedWithoutWidget.has(name)) {
    return
  }
  warnedWithoutWidget.add(name)
  const isProduction =
    typeof process !== "undefined" && process.env.NODE_ENV === "production"
  if (!isProduction) {
    console.warn(
      `react-native-gtkx: createAnimatedComponent(${name}) was given an animated \`opacity\`, ` +
        "`transform`, colour or size, but the component exposed no ref carrying a widget, so there is nothing to write " +
        "to. Give it a `ref?: Ref<MeasureHandle>` built with the platform's own measure handle, or wrap " +
        "it in an `Animated.View`. See docs/api.md.",
    )
  }
}

/** @internal Test seam: the warning is once per component per session by design. */
export const resetAnimatedComponentWarnings = (): void => {
  warnedWithoutWidget.clear()
}

/**
 * Wraps a component so its `style`'s `opacity`/`transform` and its
 * `animatedProps` can be driven imperatively — RN's own
 * `Animated.createAnimatedComponent`.
 *
 * IT ADDS NO WIDGET. Wrapping in an `Animated.View` would have been three
 * lines and would have been wrong: an extra box changes flex layout, changes
 * what `measureLayout` is relative to, and changes which widget a parent's
 * allocate walks. That is not a shim, it is a different tree. Instead the
 * wrapper renders the component itself and reaches the widget through the
 * handle the component already exposes (see measure.ts's `widgetOf`), so the
 * rendered output is byte-for-byte what the unwrapped component produces.
 *
 * `animatedProps` are passed straight through as animated NODES rather than
 * resolved to numbers, because the components that take them already accept
 * one: the SVG shapes duck-type an animated node on every numeric geometry
 * and paint prop and subscribe to it themselves (svg/animated-support.ts),
 * redrawing through `queueDraw`. Nothing is resolved here that the receiver
 * can resolve better.
 */
export const createAnimatedComponent = <C extends ElementType>(
  component: C,
): AnimatedComponent<C> => {
  const name = displayNameOf(component)

  const AnimatedWrapper = ({
    style,
    animatedProps,
    ref,
    ...rest
  }: AnimatedComponentExtraProps & {
    ref?: Ref<unknown>
    [key: string]: unknown
  }) => {
    // The PARENT's widget, for `queueAllocate` — the wrapper is not a host
    // node itself, so this is the container the wrapped component is laid out
    // by, exactly as it would be without the wrapper.
    const host = useHostNode()
    const handleRef = useRef<unknown>(null)
    const { staticStyle, opacity, zIndex, slots, colors, sizes } =
      splitAnimated(style)
    const driven =
      opacity !== null ||
      zIndex !== null ||
      slots.length > 0 ||
      colors.length > 0 ||
      sizes.length > 0

    // Stable identity: a fresh callback ref every render would detach and
    // reattach the wrapped component's handle on every render.
    const forwardedRef = useRef<Ref<unknown> | undefined>(ref)
    forwardedRef.current = ref
    const [assignHandle] = useState(() => (instance: unknown) => {
      handleRef.current = instance
      const target = forwardedRef.current
      if (typeof target === "function") {
        target(instance)
      } else if (target) {
        ;(target as { current: unknown }).current = instance
      }
      // No return value: React 19 reads one as a callback-ref cleanup.
    })

    useAnimatedBinding(
      () => widgetForHandle(handleRef.current),
      host,
      opacity,
      zIndex,
      slots,
      colors,
      sizes,
    )

    // A silent no-op is the failure this repo refuses. Checked after the
    // wrapped component's own layout effects have run, which is where its
    // `useImperativeHandle` publishes the handle.
    useLayoutEffect(() => {
      if (driven && widgetForHandle(handleRef.current) === null) {
        warnNoWidget(name)
      }
    })

    const targetProps: Record<string, unknown> = { ...rest, ...animatedProps }
    // Only when there is something to attach: a component that takes no ref
    // (the SVG shapes) would otherwise get one in its rest props.
    if (driven || ref) {
      targetProps.ref = assignHandle
    }
    // Likewise `style`: passing `{}` to a component that has no style prop
    // would push an empty object into whatever collects its rest props.
    if (style !== undefined) {
      targetProps.style = staticStyle
    }

    const Target = component as ComponentType<Record<string, unknown>>
    return <Target {...targetProps} />
  }
  AnimatedWrapper.displayName = `Animated(${name})`

  return AnimatedWrapper as AnimatedComponent<C>
}

/**
 * `Animated.FlatList` is deliberately absent, and this is the refusal.
 *
 * FlatList is a COMPOSITE, not a host component: it renders the windowed
 * VirtualizedList core, which renders a ScrollView, which is the only thing
 * in that chain owning a widget. Its ref is a scroll API by contract
 * (`scrollToIndex`/`scrollToItem`/`scrollToOffset`), so there is no handle to
 * read a widget back out of — and giving it one would mean publishing the
 * scrolled window through two layers that exist to hide it.
 *
 * Upstream's `Animated.FlatList` mostly exists so `onScroll` can be an
 * `Animated.event`/`useAnimatedScrollHandler`, and neither of those is
 * implemented here either. So this throws where it is used, naming itself and
 * naming the two things that do work.
 */
const AnimatedFlatList = (): never => {
  throw new Error(
    "react-native-gtkx: `Animated.FlatList` is not implemented. FlatList is a composite — the windowed " +
      "core over a ScrollView — and its ref is a scroll API, so there is no host widget for an animated " +
      "style to write to. Put the animated style on an `Animated.View` wrapping the list, or use " +
      "`Animated.ScrollView` if the list does not need virtualization. See docs/api.md.",
  )
}
AnimatedFlatList.displayName = "Animated.FlatList"

/**
 * `Text`, `Image` and `ScrollView` are the generic wrapper over the
 * platform's own components — no subclass, no special case, and no widget
 * added to the tree. They are animatable at all because those three now
 * expose a ref carrying their widget, which is RN parity in its own right.
 */
const AnimatedText = createAnimatedComponent(Text)
const AnimatedImage = createAnimatedComponent(Image)
const AnimatedScrollView = createAnimatedComponent(ScrollView)

export const Animated = {
  ...api,
  View: AnimatedView,
  Text: AnimatedText,
  Image: AnimatedImage,
  ScrollView: AnimatedScrollView,
  // Typed as taking the props it refuses, so the failure is at RUNTIME with
  // the message above rather than at compile time with "no overload matches
  // this call" — an app porting from mobile deserves the sentence, not a
  // type puzzle.
  FlatList: AnimatedFlatList as (props: Record<string, unknown>) => never,
  createAnimatedComponent,
}

export { Easing } from "../animated/index"
