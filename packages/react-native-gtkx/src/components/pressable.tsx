import {
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { splitStyle, StyleSheet } from "../style/index"
import { defaultCssRegistry } from "../style/registry.gtkx"
import type { StyleProp } from "../contracts"
import { Gtk, GtkBox } from "../gtkx/bridge/index"
import { perfAddTime, perfCount, perfEnabled, perfNow } from "../perf"
import { HostNodeContext } from "./host-node"
import { createPressEvent, createTouch, type PressEvent } from "./press-event"
import { useActivateOnKey, useFocusable, useFocusController } from "./use-focus"
import {
  useLayoutChild,
  useRnContainer,
  type LayoutEvent,
} from "./use-layout-child"

// react-native-web's own Pressable state is `{focused, hovered, pressed}`.
// `hovered` was already a documented extension here for that reason;
// `focused` is the same move, and it is what lets a row draw the focus ring
// `outlineWidth`/`outlineColor` made drawable.
export type PressableStateCallbackType = {
  pressed: boolean
  hovered: boolean
  focused: boolean
}

export type { NativeTouch, PressEvent } from "./press-event"

export type PressableProps = {
  style?: StyleProp | ((state: PressableStateCallbackType) => StyleProp)
  children?: ReactNode | ((state: PressableStateCallbackType) => ReactNode)
  onPress?: (event: PressEvent) => void
  onPressIn?: (event: PressEvent) => void
  onPressOut?: (event: PressEvent) => void
  onLongPress?: (event: PressEvent) => void
  onHoverIn?: () => void
  onHoverOut?: () => void
  onFocus?: () => void
  onBlur?: () => void
  /** Whether Tab and the arrow keys can reach this pressable. Defaults to
   *  true when `onPress` is set, which is react-native-web's own rule — a
   *  control you can click and cannot reach from the keyboard is an
   *  accessibility bug, and on a desktop that matters more, not less. */
  focusable?: boolean
  disabled?: boolean
  delayLongPress?: number
  onLayout?: (event: LayoutEvent) => void
  testID?: string
}

// Coordinates arrive from GtkGestureClick in the widget's own space, which
// is exactly RN's locationX/locationY; createTouch translates them into the
// window for pageX/pageY.
const pressEvent = (
  widget: Gtk.Widget | null,
  x: number,
  y: number,
): PressEvent => createPressEvent(createTouch(widget, x, y))

// A View with a click gesture and hover tracking. State-dependent style and
// children follow the RN Pressable function-prop contract.
export const Pressable = ({
  style,
  children,
  onPress,
  onPressIn,
  onPressOut,
  onLongPress,
  onHoverIn,
  onHoverOut,
  onFocus,
  onBlur,
  focusable,
  disabled = false,
  delayLongPress = 500,
  onLayout,
  testID,
}: PressableProps) => {
  const widgetRef = useRef<Gtk.Box | null>(null)
  const [pressed, setPressed] = useState(false)
  // Focus IS React state, unlike hover: it changes at human-decision rates
  // (a Tab press), not at pointer-motion rates, so the fast path hover needs
  // would be complexity with nothing to buy.
  const [focused, setFocused] = useState(false)
  // Hover is not React state: a boundary crossing should cost what it costs
  // a native GtkListBox row to swap a CSS class, not a setState + render +
  // Yoga + allocate cycle (measured: roughly 500x the latency of a native
  // row at rest, see docs/research/scroll-performance.md, task 007).
  // `hoveredRef` is the single source of truth, read directly at render
  // time — safe here because this component already mutates
  // `handlersRef.current` in the render body below, so render was never
  // React-DOM-pure to begin with. `forceRender` is used only for the two
  // cases that genuinely need a real render: `children` reads `hovered`,
  // or hovering would itself change layout (not just paint).
  const hoveredRef = useRef(false)
  const [, forceRender] = useReducer((n: number) => n + 1, 0)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)
  // TEMPORARY perf instrumentation (task 007, see
  // docs/research/scroll-performance.md): timestamp the native enter/leave
  // signal so hover's real signal-to-applied latency can be reported —
  // synchronously for the fast path below, after the resulting commit for
  // the slow one. perf.ts hooks are no-ops unless GTKX_PERF=1.
  const hoverSignalAt = useRef<number | null>(null)

  const state: PressableStateCallbackType = {
    pressed,
    hovered: hoveredRef.current,
    focused,
  }

  // Gestures are attached imperatively even though rc.3 has a declarative
  // `controllers` slot: the controllers are wired exactly once per widget and
  // the handlers read the latest props through a ref, so a re-render never
  // detaches and re-adds a gesture mid-press.
  const handlersRef = useRef({
    handlePressed: (n: number, x: number, y: number): void => {
      void n
      void x
      void y
    },
    handleReleased: (n: number, x: number, y: number): void => {
      void n
      void x
      void y
    },
    handleCancel: (): void => {},
    handleEnter: (): void => {},
    handleLeave: (): void => {},
  })
  const resolvedStyle = typeof style === "function" ? style(state) : style
  const resolvedChildren =
    typeof children === "function" ? children(state) : children

  const { host, node, cssClass, flat } = useLayoutChild(widgetRef, {
    style: resolvedStyle,
    onLayout,
  })
  useRnContainer(widgetRef, node)

  // Hover fast path: when `children` does not read state, hovering can
  // never change what is rendered — only `style` might. Precompute the CSS
  // class for the OTHER hover value so the native enter/leave handlers
  // below can swap classes directly on the widget, with no React involved
  // at all. If hovering would also change LAYOUT (rare — every hover style
  // in this codebase's own examples is background/border) that swap is
  // unsafe, since a real reflow is required; fall back to the ordinary
  // render in that case, exactly as before this change.
  let hoverOnClass: string | null = null
  let hoverOffClass: string | null = null
  let canSwapHoverClass = typeof children !== "function"
  if (canSwapHoverClass && typeof style === "function") {
    const otherState: PressableStateCallbackType = {
      pressed,
      hovered: !hoveredRef.current,
      focused,
    }
    const otherFlat = StyleSheet.flatten(style(otherState))
    const otherSplit = splitStyle(otherFlat)
    const currentLayout = splitStyle(flat).layout
    if (JSON.stringify(currentLayout) !== JSON.stringify(otherSplit.layout)) {
      // Hovering resizes or repositions this widget — a CSS class alone
      // cannot do that, it needs Yoga. Fall back to a real render.
      canSwapHoverClass = false
    } else {
      const otherClass = defaultCssRegistry.getClassName(otherSplit.visual)
      hoverOnClass = hoveredRef.current ? cssClass : otherClass
      hoverOffClass = hoveredRef.current ? otherClass : cssClass
    }
  }

  // TEMPORARY perf instrumentation (task 007): runs after every commit, so
  // it always lands right after whatever render the SLOW hover path
  // triggered. A no-op when no hover signal is pending (the common case:
  // renders triggered by anything else, or the fast path above, which
  // measures itself synchronously) or when GTKX_PERF is unset.
  useLayoutEffect(() => {
    if (!perfEnabled || hoverSignalAt.current === null) {
      return
    }
    perfAddTime("pressable.hoverApply", perfNow() - hoverSignalAt.current)
    perfCount("pressable.hoverFullCycle")
    hoverSignalAt.current = null
  })

  const clearLongPress = (): void => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handlePressed = (_n: number, x: number, y: number): void => {
    if (disabled) {
      return
    }
    longPressFired.current = false
    setPressed(true)
    const widget = widgetRef.current
    onPressIn?.(pressEvent(widget, x, y))
    if (onLongPress) {
      clearLongPress()
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true
        // Timestamped when it FIRES, not when the press started — the delay
        // is the whole point of the event.
        onLongPress(pressEvent(widgetRef.current, x, y))
      }, delayLongPress)
    }
  }

  const handleReleased = (_n: number, x: number, y: number): void => {
    if (disabled) {
      return
    }
    clearLongPress()
    setPressed(false)
    const widget = widgetRef.current
    onPressOut?.(pressEvent(widget, x, y))
    if (!longPressFired.current) {
      onPress?.(pressEvent(widget, x, y))
    }
  }

  const handleCancel = (): void => {
    clearLongPress()
    setPressed(false)
  }

  // Applies a hover transition: fires the RN callback, then either swaps
  // the precomputed CSS class directly on the widget (fast path) or forces
  // the ordinary render (slow path) — see the `canSwapHoverClass` block
  // above for which one applies this render.
  const applyHover = (next: boolean, fire: (() => void) | undefined): void => {
    const t0 = perfEnabled ? perfNow() : 0
    hoveredRef.current = next
    fire?.()
    if (!canSwapHoverClass) {
      if (perfEnabled) {
        hoverSignalAt.current = t0
        perfCount("pressable.hoverEvent")
      }
      forceRender()
      return
    }
    const widget = widgetRef.current
    const applyClass = next ? hoverOnClass : hoverOffClass
    const removeClass = next ? hoverOffClass : hoverOnClass
    if (widget && hoverOnClass !== hoverOffClass) {
      if (removeClass) {
        widget.removeCssClass(removeClass)
      }
      if (applyClass) {
        widget.addCssClass(applyClass)
      }
    }
    if (perfEnabled) {
      perfAddTime("pressable.hoverApply", perfNow() - t0)
      perfCount("pressable.hoverEvent")
      perfCount("pressable.hoverFast")
    }
  }

  handlersRef.current = {
    handlePressed,
    handleReleased,
    handleCancel,
    handleEnter: () => applyHover(true, onHoverIn),
    handleLeave: () => applyHover(false, onHoverOut),
  }

  // A pressable that can be clicked should be reachable from the keyboard;
  // one that only hovers or lays out should not join the Tab order. That is
  // react-native-web's rule, and it keeps every existing Pressable in this
  // repo behaving as before unless it had an onPress to begin with.
  useFocusable(widgetRef, focusable ?? onPress !== undefined)
  useFocusController(
    widgetRef,
    () => {
      setFocused(true)
      onFocus?.()
    },
    () => {
      setFocused(false)
      onBlur?.()
    },
  )
  // Enter and Space activate a focused control on web and on Android, so
  // they do here. The press event is synthesised at the widget's own origin
  // — a keyboard press has no coordinates, and RN's own handlers read
  // locationX/Y unconditionally.
  useActivateOnKey(
    widgetRef,
    disabled || !onPress
      ? undefined
      : () => onPress(pressEvent(widgetRef.current, 0, 0)),
  )

  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    const click = new Gtk.GestureClick()
    click.on("pressed", (n: number, x: number, y: number) =>
      handlersRef.current.handlePressed(n, x, y),
    )
    click.on("released", (n: number, x: number, y: number) =>
      handlersRef.current.handleReleased(n, x, y),
    )
    click.on("cancel", () => handlersRef.current.handleCancel())
    widget.addController(click)

    const motion = new Gtk.EventControllerMotion()
    motion.on("enter", () => handlersRef.current.handleEnter())
    motion.on("leave", () => handlersRef.current.handleLeave())
    widget.addController(motion)

    return () => {
      widget.removeController(click)
      widget.removeController(motion)
    }
  }, [])

  return (
    <GtkBox
      ref={widgetRef}
      name={testID}
      cssClasses={cssClass ? [cssClass] : []}
    >
      <HostNodeContext.Provider
        value={{ engine: host.engine, node, widgetRef }}
      >
        {resolvedChildren}
      </HostNodeContext.Provider>
    </GtkBox>
  )
}

export type TouchableOpacityProps = Omit<PressableProps, "style"> & {
  style?: StyleProp
  activeOpacity?: number
}

// Classic RN touchable: dims itself while pressed via widget opacity.
export const TouchableOpacity = ({
  style,
  activeOpacity = 0.5,
  ...rest
}: TouchableOpacityProps) => (
  <Pressable
    {...rest}
    style={({ pressed }) => [style, pressed && { opacity: activeOpacity }]}
  />
)
