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
  type RefObject,
} from "react"
import {
  DRIVEABLE_COLOR_PROPERTIES,
  driveableColorsToCss,
  type DriveableColorProperty,
} from "../style/imperative-css"
import { createAnimated } from "../animated/index"
import type { FlatStyle, StyleProp, TransformPart } from "../contracts"
import {
  createWidgetCss,
  GtkBox,
  queueAllocate,
  type Gtk,
  type WidgetCss,
} from "../gtkx/bridge/index"
import type { ResponderProps } from "../responder/types"
import { useResponder } from "../responder/use-responder"
import { glibScheduler } from "./frame-scheduler"
import { HostNodeContext, useHostNode } from "./host-node"
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
  "opacity" | "transform" | DriveableColorProperty
> & {
  opacity?: number | AnimatedNode
  transform?: (TransformPart | AnimatedTransformPart)[]
} & Partial<Record<DriveableColorProperty, string | AnimatedNode>>

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

const splitAnimated = (
  style: AnimatedStyleProp | false | null | undefined,
): {
  staticStyle: StyleProp
  opacity: AnimatedNode | null
  slots: TransformSlot[]
  colors: ColorSlot[]
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
  const slots: TransformSlot[] = []
  const colors: ColorSlot[] = []

  if (isAnimatedNode(flat.opacity)) {
    opacity = flat.opacity
    delete flat.opacity
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

  return { staticStyle: flat as StyleProp, opacity, slots, colors }
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
  parentWidgetRef: RefObject<Gtk.Widget | null>,
  opacity: AnimatedNode | null,
  slots: TransformSlot[],
  colors: ColorSlot[],
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
  const getWidgetRef = useRef(getWidget)
  getWidgetRef.current = getWidget

  // Rebind on a change of shape (which transforms, in which order), of the
  // node behind an animated entry, or of a static entry's value — not on
  // every render that rebuilds an equal-looking array.
  const bindingKey =
    (opacity ? `opacity#${nodeId(opacity)}` : "") +
    slots
      .map((slot) =>
        slot.node
          ? `|${slot.key}#${nodeId(slot.node)}`
          : `|${slot.key}=${String(slot.value)}`,
      )
      .join("") +
    colors.map((slot) => `|${slot.property}#${nodeId(slot.node)}`).join("")

  useLayoutEffect(() => {
    const widget = getWidgetRef.current()
    if (!widget) {
      return
    }

    // The live transform array, mutated in place: an Animated write must
    // stay one numeric store plus one queued allocation — no React render,
    // no Yoga pass, no allocation per frame beyond the composed matrix.
    //
    // RN transform semantics: this is paint-only. The result goes to the
    // rect store unclamped — the parent's measure ignores children, so a
    // transformed child draws past the boundary over its neighbors without
    // moving a single ancestor.
    const parts = slotsRef.current.map(
      (slot) => ({ [slot.key]: slot.value }) as Record<string, AnimatedValue>,
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
          part[slot.key] = value
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

    flush()

    return () => {
      for (const { node: animated, id } of subscriptions) {
        animated.removeListener(id)
      }
      widgetCss?.dispose()
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
  ...responderProps
}: AnimatedViewProps) => {
  const widgetRef = useRef<Gtk.Box | null>(null)
  const { staticStyle, opacity, slots, colors } = splitAnimated(style)

  const { host, node, cssClass } = useLayoutChild(widgetRef, {
    style: staticStyle,
    onLayout,
  })
  useRnContainer(widgetRef, node)
  useResponder(widgetRef, responderProps)

  useImperativeHandle(ref, () => createMeasureHandle(widgetRef, node), [node])

  useAnimatedBinding(
    () => widgetRef.current,
    host.widgetRef,
    opacity,
    slots,
    colors,
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
        "`transform` or colour, but the component exposed no ref carrying a widget, so there is nothing to write " +
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
    const { staticStyle, opacity, slots, colors } = splitAnimated(style)
    const driven = opacity !== null || slots.length > 0 || colors.length > 0

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
      host.widgetRef,
      opacity,
      slots,
      colors,
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
