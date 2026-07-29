import { useLayoutEffect, useRef, type ReactNode } from "react"
import { GLib, GtkBox, queueAllocate, type Gtk } from "../gtkx-bridge/index.js"
import { createAnimated, type FrameScheduler } from "../animated/index.js"
import type { FlatStyle, StyleProp, TransformPart } from "../contracts.js"
import { HostNodeContext } from "./host-node.js"
import { setStoredOffset } from "./rect-store.js"
import {
  useLayoutChild,
  useRnContainer,
  type LayoutEvent,
} from "./use-layout-child.js"

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

type AnimatedNode = {
  addListener(callback: (state: { value: number }) => void): string
  removeListener(id: string): void
  __getValue(): number
}

const isAnimatedNode = (value: unknown): value is AnimatedNode =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as AnimatedNode).addListener === "function" &&
  typeof (value as AnimatedNode).__getValue === "function"

type AnimatedTransformPart = { [key: string]: number | string | AnimatedNode }

// Omit, not plain intersection: intersecting would AND the animated transform
// with FlatStyle's numeric one, rejecting Animated.Value entries.
export type AnimatedViewStyle = Omit<FlatStyle, "opacity" | "transform"> & {
  opacity?: number | AnimatedNode
  transform?: (TransformPart | AnimatedTransformPart)[]
}

type Binding = {
  node: AnimatedNode
  apply: (value: number) => void
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
  translateX: AnimatedNode | null
  translateY: AnimatedNode | null
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
  let translateX: AnimatedNode | null = null
  let translateY: AnimatedNode | null = null

  if (isAnimatedNode(flat.opacity)) {
    opacity = flat.opacity
    delete flat.opacity
  }
  if (Array.isArray(flat.transform)) {
    const staticParts: TransformPart[] = []
    for (const part of flat.transform as AnimatedTransformPart[]) {
      const key = Object.keys(part)[0]
      const value = part[key!]
      if (key === "translateX" && isAnimatedNode(value)) {
        translateX = value
      } else if (key === "translateY" && isAnimatedNode(value)) {
        translateY = value
      } else if (!isAnimatedNode(value)) {
        staticParts.push(part as TransformPart)
      }
    }
    if (staticParts.length > 0) {
      flat.transform = staticParts
    } else {
      delete flat.transform
    }
  }

  return { staticStyle: flat as StyleProp, opacity, translateX, translateY }
}

// Animated values bypass React entirely: listeners write straight to the
// widget (opacity) and to the rect store (translate offsets applied by the
// parent's allocate), on top of the engine-committed base rect — the fast
// path measured in the spike. Animation frames never touch Yoga.
const AnimatedView = ({
  style,
  children,
  onLayout,
  testID,
}: AnimatedViewProps) => {
  const widgetRef = useRef<Gtk.Box | null>(null)
  const { staticStyle, opacity, translateX, translateY } = splitAnimated(style)

  const { host, node, cssClass } = useLayoutChild(widgetRef, {
    style: staticStyle,
    onLayout,
  })
  useRnContainer(widgetRef, node)

  const offsets = useRef({ x: 0, y: 0 })

  useLayoutEffect(() => {
    // Translate stays clamped to the parent rect for now: with allocate()
    // driven by the engine the container can no longer inflate, but true RN
    // paint-overflow (drawing past the boundary) lands in the next task of
    // this epic — removing the clamp is its acceptance criterion.
    const applyTranslate = (): void => {
      const widget = widgetRef.current
      const parentWidget = host.widgetRef.current
      const rect = node.getRect()
      const parentRect = host.node.getRect()
      if (!widget || !parentWidget || !rect) {
        return
      }
      let x = rect.x + offsets.current.x
      let y = rect.y + offsets.current.y
      if (parentRect) {
        x = Math.min(Math.max(0, x), Math.max(0, parentRect.width - rect.width))
        y = Math.min(
          Math.max(0, y),
          Math.max(0, parentRect.height - rect.height),
        )
      }
      setStoredOffset(widget, x - rect.x, y - rect.y)
      queueAllocate(parentWidget)
    }

    const bindings: Binding[] = []
    if (opacity) {
      bindings.push({
        node: opacity,
        apply: (value) => {
          widgetRef.current?.setOpacity(Math.min(1, Math.max(0, value)))
        },
      })
    }
    if (translateX) {
      bindings.push({
        node: translateX,
        apply: (value) => {
          offsets.current.x = value
          applyTranslate()
        },
      })
    }
    if (translateY) {
      bindings.push({
        node: translateY,
        apply: (value) => {
          offsets.current.y = value
          applyTranslate()
        },
      })
    }

    const subscriptions = bindings.map((binding) => ({
      binding,
      id: binding.node.addListener(({ value }) => binding.apply(value)),
    }))
    for (const { binding } of subscriptions) {
      binding.apply(binding.node.__getValue())
    }
    return () => {
      for (const { binding, id } of subscriptions) {
        binding.node.removeListener(id)
      }
    }
    // Re-bind when the animated node identities change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opacity, translateX, translateY, node])

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

export { Easing } from "../animated/index.js"
