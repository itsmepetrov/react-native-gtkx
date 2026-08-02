// `entering`, `exiting` and `layout` on an animated component.
//
// The three props are added by WRAPPING, not by changing the platform's
// `Animated.View`: the wrapper renders the component it was given, adds no
// widget to the tree, and reaches the real one through the handle that
// component already exposes — the same seam `createAnimatedComponent` uses.
// That is what lets `Animated.Text` and anything through
// `createAnimatedComponent` take a layout animation on exactly the same
// terms as `Animated.View`.
//
// WHY THE WRAPPER IS WHERE `exiting` LIVES, and this is the whole reason it
// exists as a component rather than a hook inside the platform: React runs a
// deleted subtree's layout-effect cleanups from the OUTSIDE IN, and unparents
// its topmost widget last. A cleanup registered here — one component above
// the one that owns the widget — therefore runs at the only moment when the
// widget is still parented, its Yoga node still alive and its layout manager
// still attached. It hands all three to the platform's retention primitive
// (src/components/widget-retention.ts), which puts the widget back after the
// reconciler takes it out and holds everything else until the fade ends or
// the fallback timer fires.
//
// The other two need nothing new. `entering` is "write the initial values on
// mount and animate to the real ones"; `layout` is "the engine committed a
// different rect for this child, so walk it there from where it was" — both
// are snapshot-measure-animate, which is exactly what upstream's own web
// implementation does on its single thread.
import {
  useInsertionEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type ElementType,
  type ReactNode,
  type Ref,
} from "react"
import { Dimensions } from "../apis/index"
import { Animated as PlatformAnimated } from "../components/animated"
import { glibScheduler } from "../components/frame-scheduler"
import { useHostNode } from "../components/host-node"
import { widgetForHandle } from "../components/measure"
import {
  getStoredLayoutOffset,
  getStoredRect,
  observeStoredRect,
  type StoredRect,
} from "../components/rect-store"
import {
  retainWidget,
  type WidgetRetention,
} from "../components/widget-retention"
import { computePointInWindow, type Gtk } from "../gtkx/bridge/index"
import type { AnimationEngine } from "./animation"
import type {
  LayoutAnimationBuilderLike,
  LayoutAnimationValues,
} from "./layout-animation"
import { useLayoutAnimationSkip } from "./layout-animation-config"
import {
  runLayoutAnimation,
  type RunningLayoutAnimation,
} from "./layout-animation-runtime"

/**
 * How much longer than the animation itself a widget may be retained before
 * the fallback drops it. The timer exists for the case where the animation
 * never reports an end at all, so the margin only has to cover the ordinary
 * jitter of a frame source — not a whole animation.
 */
const RETENTION_MARGIN_MS = 500

/** What `entering`, `exiting` and `layout` accept: a builder, or its class. */
export type LayoutAnimationProps = {
  /** Runs once, when the component mounts. */
  entering?: LayoutAnimationBuilderLike | false | null
  /**
   * Runs when the component unmounts, on a widget the platform keeps on
   * screen for the duration. Ignored when the component's own container is
   * unmounting in the same commit — there would be nothing left to animate
   * inside.
   */
  exiting?: LayoutAnimationBuilderLike | false | null
  /** Runs whenever the layout engine commits a new position for this child. */
  layout?: LayoutAnimationBuilderLike | false | null
}

const ZERO_RECT: StoredRect = { x: 0, y: 0, width: 0, height: 0 }

// The platform's own Animated api and the frame scheduler behind it: the same
// pair every other animation in this surface runs on, so a layout animation
// adds no second clock.
const ENGINE: AnimationEngine = {
  api: PlatformAnimated,
  scheduler: glibScheduler,
}

const retainForExit = (
  widget: Gtk.Widget,
  parentWidget: Gtk.Widget,
  builder: LayoutAnimationBuilderLike,
  stop: () => void,
): WidgetRetention | null =>
  retainWidget(widget, parentWidget, {
    // The fallback covers a frame source that never delivers an end, so it
    // only has to outlast the animation the builder describes.
    fallbackMs: builder.getMaxDuration() + RETENTION_MARGIN_MS,
    onRelease: stop,
  })

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
      `react-native-reanimated: ${name} was given an \`entering\`, \`exiting\` or \`layout\` animation, but ` +
        "the component exposed no ref carrying a widget, so there is nothing to animate. Put the animation on " +
        "an `Animated.View`, or give the component a `ref` built with the platform's own measure handle. " +
        "See docs/api.md.",
    )
  }
}

/** @internal Test seam: the warning is once per component per session. */
export const resetLayoutAnimationComponentWarnings = (): void => {
  warnedWithoutWidget.clear()
}

const valuesFor = (
  widget: Gtk.Widget,
  current: StoredRect,
  target: StoredRect,
): LayoutAnimationValues => {
  const window = Dimensions.get("window")
  // One FFI call per animation START (never per frame), so a builder reading
  // the global origin gets a real answer rather than a parent-relative one
  // wearing its name.
  const page = computePointInWindow(widget, 0, 0)
  const dx = page ? page.x - target.x : 0
  const dy = page ? page.y - target.y : 0
  return {
    targetOriginX: target.x,
    targetOriginY: target.y,
    targetWidth: target.width,
    targetHeight: target.height,
    targetGlobalOriginX: target.x + dx,
    targetGlobalOriginY: target.y + dy,
    currentOriginX: current.x,
    currentOriginY: current.y,
    currentWidth: current.width,
    currentHeight: current.height,
    currentGlobalOriginX: current.x + dx,
    currentGlobalOriginY: current.y + dy,
    windowWidth: window.width,
    windowHeight: window.height,
  }
}

const displayNameOf = (component: unknown): string => {
  if (typeof component === "string") {
    return component
  }
  const named = component as { displayName?: string; name?: string }
  return named?.displayName ?? named?.name ?? "Component"
}

/** The props a layout-animated wrapper adds on top of the component's own. */
export type LayoutAnimatedComponent<C extends ElementType> = (
  props: ComponentProps<C> & LayoutAnimationProps,
) => ReactNode

/**
 * Adds `entering`, `exiting` and `layout` to an animated component.
 *
 * The rendered output is byte-for-byte what the wrapped component produces —
 * the wrapper is a function component with no host element of its own.
 */
export const withLayoutAnimations = <C extends ElementType>(
  component: C,
): LayoutAnimatedComponent<C> => {
  const name = displayNameOf(component)

  const LayoutAnimated = ({
    entering,
    exiting,
    layout,
    ref,
    ...rest
  }: LayoutAnimationProps & {
    ref?: Ref<unknown>
    [key: string]: unknown
  }) => {
    const host = useHostNode()
    const handleRef = useRef<unknown>(null)
    // Null unless a `<LayoutAnimationConfig>` is above. Captured once and read
    // from inside the effects below: the object identity is stable for the
    // life of that wrapper, and both of its flags are only meaningful at the
    // moment the effect (or its cleanup) actually runs.
    const skip = useLayoutAnimationSkip()

    // Read by an unmount cleanup and by a rect observer, both of which
    // outlive the render that produced them. Refreshed in an insertion effect
    // — the project's standard escape from writing a ref during render, and
    // early enough that a layout effect in the same commit sees it.
    const exitingRef = useRef<LayoutAnimationBuilderLike | false | null>(
      exiting ?? null,
    )
    const layoutRef = useRef<LayoutAnimationBuilderLike | false | null>(
      layout ?? null,
    )
    const forwardedRef = useRef<Ref<unknown> | undefined>(ref)
    useInsertionEffect(() => {
      exitingRef.current = exiting ?? null
      layoutRef.current = layout ?? null
      forwardedRef.current = ref
    })

    // Stable identity: a fresh callback ref every render would detach and
    // reattach the wrapped component's handle on every render.
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

    const parentWidgetRef = host.widgetRef

    // --- entering --------------------------------------------------------
    // Never refreshed, unlike the two above: an entering animation runs once,
    // on mount, so the builder that counts is the one this component was
    // mounted with.
    const enteringRef = useRef<LayoutAnimationBuilderLike | false | null>(
      entering ?? null,
    )
    useLayoutEffect(() => {
      const builder = enteringRef.current
      if (!builder || skip?.entering.current) {
        return
      }
      const widget = widgetForHandle(handleRef.current)
      if (!widget) {
        warnNoWidget(name)
        return
      }
      const rect = getStoredRect(widget) ?? ZERO_RECT
      const values = valuesFor(widget, rect, rect)
      const running = runLayoutAnimation(
        ENGINE,
        { widget, parentWidget: parentWidgetRef.current },
        builder.build()(values),
        values,
      )
      return () => running.stop()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // --- layout ----------------------------------------------------------
    // Keyed on whether there IS a layout animation, not on which one: a rect
    // observer is what turns on the rect store's notify path, and a view that
    // never asked for a layout transition must not pay for it.
    const hasLayout = Boolean(layout)
    useLayoutEffect(() => {
      if (!hasLayout) {
        return
      }
      const widget = widgetForHandle(handleRef.current)
      if (!widget) {
        warnNoWidget(name)
        return
      }
      let running: RunningLayoutAnimation | null = null
      const unobserve = observeStoredRect(widget, (next, previous) => {
        const builder = layoutRef.current
        // Nothing to walk from on the first commit, and a pure resize has no
        // position to animate — the size lands immediately either way.
        if (!builder || previous === undefined) {
          return
        }
        if (previous.x === next.x && previous.y === next.y) {
          return
        }
        // Where the child is being DRAWN right now, which is the rect it had
        // plus whatever a transition still in flight has added to it.
        const offset = getStoredLayoutOffset(widget)
        const drawn: StoredRect = {
          x: previous.x + offset.dx,
          y: previous.y + offset.dy,
          width: previous.width,
          height: previous.height,
        }
        running?.stop()
        const values = valuesFor(widget, drawn, next)
        running = runLayoutAnimation(
          ENGINE,
          { widget, parentWidget: parentWidgetRef.current },
          builder.build()(values),
          values,
          () => {
            running = null
          },
        )
      })
      return () => {
        unobserve()
        running?.stop()
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasLayout])

    // --- exiting ---------------------------------------------------------
    // Declared last so its cleanup runs after the other two have stopped
    // whatever they were driving: React tears a component's layout effects
    // down in the order they were created.
    useLayoutEffect(() => {
      return () => {
        const builder = exitingRef.current
        // `skip.exiting` is set by a `<LayoutAnimationConfig skipExiting>`
        // above us, whose own cleanup React already ran — deletions tear down
        // outside in, which is the same ordering `exiting` itself relies on.
        if (!builder || skip?.exiting.current) {
          return
        }
        const widget = widgetForHandle(handleRef.current)
        // Read HERE and not captured when the effect ran, which is the whole
        // point: null means this component's own container is unmounting in
        // the same commit (React detaches the container's ref before
        // descending into it), and there is then no container left to hold
        // the widget — an exit animation inside a disappearing parent is not
        // one anybody sees.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        const parentWidget = parentWidgetRef.current
        if (!widget || !parentWidget) {
          return
        }
        const rect = getStoredRect(widget) ?? ZERO_RECT
        const values = valuesFor(widget, rect, rect)
        let running: RunningLayoutAnimation | null = null
        const retention = retainForExit(widget, parentWidget, builder, () =>
          running?.stop(),
        )
        if (retention === null) {
          return
        }
        running = runLayoutAnimation(
          ENGINE,
          { widget, parentWidget },
          builder.build()(values),
          values,
          () => retention.release(),
        )
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const targetProps: Record<string, unknown> = { ...rest }
    if (entering || exiting || layout || ref) {
      targetProps.ref = assignHandle
    }

    const Target = component as ComponentType<Record<string, unknown>>
    return <Target {...targetProps} />
  }
  LayoutAnimated.displayName = `LayoutAnimated(${name})`

  return LayoutAnimated as unknown as LayoutAnimatedComponent<C>
}
