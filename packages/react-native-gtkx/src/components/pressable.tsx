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
import {
  getViewBoxComponent,
  Gtk,
  GtkBox,
  setHitSlop,
  type HitSlop,
} from "../gtkx/bridge/index"
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
  /** RN's hitSlop: how far OUTSIDE its bounds this pressable still counts
   *  as pressed. A number is all four edges. Limited by an ancestor that
   *  clips — a ScrollView's viewport, say — because GTK stops picking at
   *  the clip, the same constraint RN documents on Android. */
  hitSlop?: number | Partial<HitSlop>
  /** RN's pressRetentionOffset: how far the pointer may drift outside the
   *  hit rect after pressing and still activate on release. Defaults to
   *  RN's own {top: 20, left: 20, right: 20, bottom: 30}. */
  pressRetentionOffset?: number | Partial<HitSlop>
  onLayout?: (event: LayoutEvent) => void
  testID?: string
}

const NO_SLOP: HitSlop = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * RN's own DEFAULT_PRESS_RECT_OFFSETS, from Libraries/Pressability. The
 * bottom edge is deliberately larger: a thumb rolls downwards off a target
 * far more often than upwards.
 */
const DEFAULT_PRESS_RECT: HitSlop = { top: 20, right: 20, bottom: 30, left: 20 }

const toRect = (
  value: number | Partial<HitSlop> | undefined,
  fallback: HitSlop,
): HitSlop => {
  if (value === undefined) {
    return fallback
  }
  if (typeof value === "number") {
    return { top: value, right: value, bottom: value, left: value }
  }
  return {
    top: value.top ?? 0,
    right: value.right ?? 0,
    bottom: value.bottom ?? 0,
    left: value.left ?? 0,
  }
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
  hitSlop,
  pressRetentionOffset,
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

  /**
   * Whether a release at (x, y) — in the widget's own coordinates — still
   * counts as pressing this control. RN's press rect is the hit rect plus
   * pressRetentionOffset, and a release outside it is a cancel, not a
   * press: dragging off a button to change your mind is how every toolkit
   * works, GTK's own GtkButton included. GtkGestureClick keeps an implicit
   * grab for the whole press, so `released` arrives here wherever the
   * pointer ended up and the check has to be ours.
   */
  const withinPressRect = (x: number, y: number): boolean => {
    const widget = widgetRef.current
    if (!widget) {
      return false
    }
    const slop = slopRef.current
    const retention = retentionRef.current
    return (
      x >= -(slop.left + retention.left) &&
      y >= -(slop.top + retention.top) &&
      x < widget.getWidth() + slop.right + retention.right &&
      y < widget.getHeight() + slop.bottom + retention.bottom
    )
  }

  const handleReleased = (_n: number, x: number, y: number): void => {
    if (disabled) {
      return
    }
    clearLongPress()
    setPressed(false)
    const widget = widgetRef.current
    // onPressOut fires either way — RN reports the end of the press whether
    // it turned into an activation or not.
    onPressOut?.(pressEvent(widget, x, y))
    if (!longPressFired.current && withinPressRect(x, y)) {
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

  // Read from the gesture handlers, which are installed once and must not
  // close over a stale prop.
  const slopRef = useRef(NO_SLOP)
  const retentionRef = useRef(DEFAULT_PRESS_RECT)
  slopRef.current = toRect(hitSlop, NO_SLOP)
  retentionRef.current = toRect(pressRetentionOffset, DEFAULT_PRESS_RECT)

  const slop = slopRef.current
  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    const empty =
      slop.top === 0 && slop.right === 0 && slop.bottom === 0 && slop.left === 0
    setHitSlop(widget, empty ? null : slop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slop.top, slop.right, slop.bottom, slop.left])

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

    // Hover fires from touch as well as from a mouse, and that is left
    // alone deliberately. react-native-web filters it — `useHover` drops
    // any event whose pointerType is "touch", because on a phone every tap
    // would otherwise leave a view looking hovered. Three measurements say
    // not to copy it here. GTK gives a crossing event no device at all:
    // inside `enter` and `leave` both `get_current_event()` and
    // `get_current_event_device()` are null, because GTK routes crossings
    // through a path that never sets the controller's current event, so the
    // filter would have to come from somewhere else entirely — a raw event
    // tap on the toplevel recording the last input source, which is
    // per-event JS work on every window for a filter nobody can check.
    // GTK also sends a matching leave when a touch sequence ends, so the
    // stuck phantom hover that motivates RNW's filter does not arise, and
    // GTK's own CSS `:hover` lights up on touch — filtering would make this
    // platform's Pressable behave unlike every widget beside it. And it
    // cannot be verified either way here: there is no way to inject a touch
    // on this rig (docs/research/gestures.md). Revisit with a touchscreen
    // and a reason, not before.
    const motion = new Gtk.EventControllerMotion()
    motion.on("enter", () => handlersRef.current.handleEnter())
    motion.on("leave", () => handlersRef.current.handleLeave())
    widget.addController(motion)

    return () => {
      widget.removeController(click)
      widget.removeController(motion)
    }
  }, [])

  // The same GtkBox subclass a View renders, for its contains() override:
  // hitSlop is a picking change and nothing in JS can substitute for one,
  // because a press outside the widget is never delivered to it at all.
  const PressableBox = getViewBoxComponent() as typeof GtkBox
  return (
    <PressableBox
      ref={widgetRef}
      name={testID}
      cssClasses={cssClass ? [cssClass] : []}
    >
      <HostNodeContext.Provider
        value={{ engine: host.engine, node, widgetRef }}
      >
        {resolvedChildren}
      </HostNodeContext.Provider>
    </PressableBox>
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

export type TouchableHighlightProps = Omit<PressableProps, "style"> & {
  style?: StyleProp
  /**
   * RN's default is `"black"`, and its default `activeOpacity` is `0.85` — the
   * underlay shows through the dimmed child rather than replacing it. Here the
   * underlay IS the background, because there is no separate underlay view to
   * put behind a child that may be opaque, so an app that wants RN's exact
   * blend gives the child a translucent background itself.
   */
  underlayColor?: string
  activeOpacity?: number
  onShowUnderlay?: () => void
  onHideUnderlay?: () => void
}

/**
 * RN's `TouchableHighlight`: a background colour while held.
 *
 * Here because `@gorhom/bottom-sheet` re-exports it from its own public entry
 * as `BottomSheetTouchable` on every platform except iOS — it is upstream's
 * export, not an app's choice, so an app cannot avoid it. It is also an
 * ordinary `react-native` component that this surface was simply missing.
 *
 * One structural difference, stated rather than papered over: RN renders a
 * separate underlay VIEW behind the child and lowers the child's opacity onto
 * it. Reproducing that needs a second box, and an extra box changes flex
 * layout and what `measureLayout` is relative to — the same reason
 * `GestureDetector` and `createAnimatedComponent` add none. So the highlight
 * is this view's own `backgroundColor` while pressed.
 */
export const TouchableHighlight = ({
  style,
  underlayColor = "black",
  activeOpacity,
  onShowUnderlay,
  onHideUnderlay,
  onPressIn,
  onPressOut,
  ...rest
}: TouchableHighlightProps) => (
  <Pressable
    {...rest}
    onPressIn={(event) => {
      onShowUnderlay?.()
      onPressIn?.(event)
    }}
    onPressOut={(event) => {
      onHideUnderlay?.()
      onPressOut?.(event)
    }}
    style={({ pressed }) => [
      style,
      pressed && {
        backgroundColor: underlayColor,
        ...(activeOpacity === undefined ? null : { opacity: activeOpacity }),
      },
    ]}
  />
)

export type TouchableWithoutFeedbackProps = PressableProps

/**
 * RN's `TouchableWithoutFeedback`: the press callbacks and nothing visual.
 *
 * RN's own version clones its single child rather than rendering a box, and
 * its documentation calls that a mistake it kept for compatibility. This one
 * renders the `Pressable` box, which is what `Pressable` already is with no
 * `style` callback — the difference is invisible unless the child was relying
 * on being laid out by ITS parent, and RN's own docs tell you to use
 * `Pressable` instead for exactly that reason.
 */
export const TouchableWithoutFeedback = (props: PressableProps) => (
  <Pressable {...props} />
)
