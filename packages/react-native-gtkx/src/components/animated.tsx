import { useLayoutEffect, useRef, type ReactNode } from "react"
import { createAnimated, type FrameScheduler } from "../animated/index"
import type { FlatStyle, StyleProp, TransformPart } from "../contracts"
import { GLib, GtkBox, queueAllocate, type Gtk } from "../gtkx/bridge/index"
import { HostNodeContext } from "./host-node"
import { setStoredTransform } from "./rect-store"
import {
  useLayoutChild,
  useRnContainer,
  type LayoutEvent,
} from "./use-layout-child"

// ~60fps one-shot ticks off the GLib main loop. A frame-clock driver (per
// window) is a later optimization; timeouts keep the driver widget-free.
const glibScheduler: FrameScheduler = {
  schedule(callback) {
    let cancelled = false
    const id = GLib.timeoutAdd(GLib.PRIORITY_DEFAULT, 16, () => {
      if (!cancelled) {
        callback(Number(GLib.getMonotonicTime()) / 1000)
      }
      return false
    })
    return () => {
      if (!cancelled) {
        cancelled = true
        GLib.Source.remove(id)
      }
    }
  },
}

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
export type AnimatedViewStyle = Omit<FlatStyle, "opacity" | "transform"> & {
  opacity?: number | AnimatedNode
  transform?: (TransformPart | AnimatedTransformPart)[]
}

export type AnimatedViewProps = {
  style?: AnimatedViewStyle | AnimatedViewStyle[]
  children?: ReactNode
  onLayout?: (event: LayoutEvent) => void
  testID?: string
}

const splitAnimated = (
  style: AnimatedViewProps["style"],
): {
  staticStyle: StyleProp
  opacity: AnimatedNode | null
  slots: TransformSlot[]
} => {
  const flat: Record<string, unknown> = {}
  const collect = (entry: AnimatedViewProps["style"]): void => {
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

  if (isAnimatedNode(flat.opacity)) {
    opacity = flat.opacity
    delete flat.opacity
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

  return { staticStyle: flat as StyleProp, opacity, slots }
}

// Animated values bypass React entirely: listeners write straight to the
// widget (opacity) and to the rect store (the transform applied by the
// parent's allocate), on top of the engine-committed base rect — the fast
// path measured in the spike. Animation frames never touch Yoga.
const AnimatedView = ({
  style,
  children,
  onLayout,
  testID,
}: AnimatedViewProps) => {
  const widgetRef = useRef<Gtk.Box | null>(null)
  const { staticStyle, opacity, slots } = splitAnimated(style)

  const { host, node, cssClass } = useLayoutChild(widgetRef, {
    style: staticStyle,
    onLayout,
  })
  useRnContainer(widgetRef, node)

  // The effect reads the slots of the render that (re)armed it; the values
  // inside are then owned by the listeners.
  const slotsRef = useRef<TransformSlot[]>(slots)
  slotsRef.current = slots

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
      .join("")

  useLayoutEffect(() => {
    const widget = widgetRef.current
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
      setStoredTransform(widget, parts as unknown as TransformPart[])
      const parentWidget = host.widgetRef.current
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
        widgetRef.current?.setOpacity(Math.min(1, Math.max(0, numeric)))
      }
      subscriptions.push({
        node: opacity,
        id: opacity.addListener(({ value }) => {
          applyOpacity(value)
        }),
      })
      applyOpacity(opacity.__getValue())
    }

    flush()

    return () => {
      for (const { node: animated, id } of subscriptions) {
        animated.removeListener(id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindingKey, node])

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

export const Animated = {
  ...api,
  View: AnimatedView,
}

export { Easing } from "../animated/index"
