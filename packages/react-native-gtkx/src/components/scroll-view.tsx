import {
  Children,
  createContext,
  forwardRef,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { splitStyle, StyleSheet } from "../style/index"
import type { StyleProp } from "../contracts"
import {
  Gdk,
  Gtk,
  GtkBox,
  GtkScrolledWindow,
  queueAllocate,
  queueResize,
  useSignal,
} from "../gtkx/bridge/index"
import {
  ensurePerfReporter,
  perfAddTime,
  perfCount,
  perfEnabled,
  perfFrameTick,
  perfNow,
} from "../perf"
import type { ResponderProps } from "../responder/types"
import { useResponder } from "../responder/use-responder"
import { HostNodeContext } from "./host-node"
import {
  createMeasureHandle,
  registerHandleWidget,
  type MeasureHandle,
} from "./measure"
import { deferDuringAllocate, setStoredOffset } from "./rect-store"
import { scrollPhaseSink, type ScrollPhase } from "./scroll-phase"
import {
  useLayoutChild,
  useRnContainer,
  type LayoutEvent,
} from "./use-layout-child"
import { createWheelScrollSession } from "./wheel-scroll-session"

/**
 * The scroll half on its own, because the windowed list core builds its own
 * handle on top of it and is a COMPOSITE — it owns no widget, so it has no
 * honest geometry to report and does not claim any.
 */
export type ScrollHandle = {
  scrollTo(options: { x?: number; y?: number; animated?: boolean }): void
  scrollToEnd(options?: { animated?: boolean }): void
}

// RN's ScrollView ref carries the geometry methods as well as the scroll
// ones — it is a host component, and every host component has them. Here the
// composition also carries the widget: `registerHandleWidget` below is what
// lets `measureLayout(scrollViewRef, …)` resolve, and what lets
// `Animated.ScrollView` find the scrolled window to write a transform to.
export type ScrollViewHandle = MeasureHandle & ScrollHandle

export type ScrollEvent = {
  nativeEvent: {
    contentOffset: { x: number; y: number }
    contentSize: { width: number; height: number }
    // RN's viewport size. GTK's adjustments call it the page size, which is
    // the same thing: the extent the scrolled window shows at once. Without
    // it nothing can compute "how far from the end am I" — autoscroll during
    // a drag, custom end-reached logic — which is why RN carries it.
    layoutMeasurement: { width: number; height: number }
  }
}

/**
 * `ResponderProps` because a `ScrollView` is a HOST component in RN, and every
 * host component takes them. It matters more here than it reads: a
 * `GestureDetector` reaches its child through the child's own responder
 * registration, so a scrollable that did not accept them could never carry a
 * gesture — and `Gesture.Native()` exists precisely to put a scrollable into
 * the arbitration (`@gorhom/bottom-sheet` wraps its scrollable in exactly that
 * shape). `useResponder` installs nothing unless some responder prop is
 * actually present, so a plain `ScrollView` gains no controller.
 */
export type ScrollViewProps = ResponderProps & {
  style?: StyleProp
  contentContainerStyle?: StyleProp
  horizontal?: boolean
  // RN sticky headers (vertical lists): the children at these indices pin to
  // the top while scrolled past, each pushed out by the next one.
  stickyHeaderIndices?: readonly number[]
  onScroll?: (event: ScrollEvent) => void
  // RN's four scroll PHASES. What each one is here — and which input devices
  // produce it — is measured in docs/research/scroll-phases.md. A wheel gets
  // one synthetic begin/end pair around a burst and no momentum; a touchpad
  // glide gets all four from its real GTK sequence. `onScroll` is unaffected.
  //
  // Every one of them is OPTIONAL in the strong sense: while no phase
  // handler is attached — neither a prop here nor a Reanimated handler
  // carrying a phase sink — no controller is installed, no signal is
  // connected, and a scroll costs exactly what it cost before they existed.
  onScrollBeginDrag?: (event: ScrollEvent) => void
  onScrollEndDrag?: (event: ScrollEvent) => void
  onMomentumScrollBegin?: (event: ScrollEvent) => void
  onMomentumScrollEnd?: (event: ScrollEvent) => void
  // RN onContentSizeChange(contentWidth, contentHeight): fires when the
  // scrollable content changes size. GTK's adjustments emit "changed" right
  // after the allocation that resized their range — exactly the moment the
  // new scroll extent is real, which windowed lists rely on to reposition.
  onContentSizeChange?: (width: number, height: number) => void
  onLayout?: (event: LayoutEvent) => void
  children?: ReactNode
  testID?: string
}

type StickyRecord = { y: number; height: number; widget: Gtk.Widget }

// The sticky registry lives on the nearest ScrollView: any descendant may
// register a slot with its content-relative geometry (measured children of
// the ScrollView itself, or windowed list cells with engine-known offsets).
export type StickyRegistry = {
  register(key: string, record: StickyRecord): void
  unregister(key: string): void
}

export const StickyRegistryContext = createContext<StickyRegistry | null>(null)

// A wrapper around a sticky child: a plain container that reports its layout
// and widget into the registry, so the scroll handler can translate/reorder
// the REAL instance (RN semantics — no duplicate is ever rendered, external
// margins travel with the header exactly as designed). An explicit `top`
// (windowed cells) overrides the measured position.
export const StickySlot = ({
  stickyKey,
  style,
  top,
  onLayout,
  children,
}: {
  stickyKey: string
  style?: StyleProp
  top?: number
  onLayout?: (event: LayoutEvent) => void
  children?: ReactNode
}) => {
  const registry = useContext(StickyRegistryContext)
  const widgetRef = useRef<Gtk.Box | null>(null)
  const { host, node } = useLayoutChild(widgetRef, {
    style,
    onLayout: (event) => {
      onLayout?.(event)
      const widget = widgetRef.current
      if (registry && widget) {
        registry.register(stickyKey, {
          y: top ?? event.nativeEvent.layout.y,
          height: event.nativeEvent.layout.height,
          widget,
        })
      }
    },
  })
  useRnContainer(widgetRef, node)
  useLayoutEffect(() => {
    return () => {
      registry?.unregister(stickyKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickyKey])
  return (
    <GtkBox ref={widgetRef}>
      <HostNodeContext.Provider
        value={{ engine: host.engine, node, widgetRef }}
      >
        {children}
      </HostNodeContext.Provider>
    </GtkBox>
  )
}

// GtkScrolledWindow whose child is a content GtkBox backed by its own Yoga
// node inside the same engine: the content's RnGtkxLayout measures the engine
// content size (which grows past the viewport — that IS the scroll range;
// overflow: scroll on the outer node) and the scrolled window pans it.
export const ScrollView = forwardRef<ScrollViewHandle, ScrollViewProps>(
  (
    {
      style,
      contentContainerStyle,
      horizontal = false,
      stickyHeaderIndices,
      onScroll,
      onScrollBeginDrag,
      onScrollEndDrag,
      onMomentumScrollBegin,
      onMomentumScrollEnd,
      onContentSizeChange,
      onLayout,
      children,
      testID,
      ...responderProps
    },
    handleRef,
  ) => {
    const outerRef = useRef<Gtk.ScrolledWindow | null>(null)
    const contentRef = useRef<Gtk.Box | null>(null)
    const [scrolled, setScrolled] = useState<Gtk.ScrolledWindow | null>(null)

    const { host, node: outerNode } = useLayoutChild(outerRef, {
      // Yoga unconstrains a scroll node's MAIN axis — align it with the
      // scroll direction or a horizontal list's content clamps to the
      // viewport width (hadjustment upper == page).
      //
      // `flexGrow: 1, flexShrink: 1` is RN's own base style for the scroller
      // (`styles.baseVertical` / `baseHorizontal` in ScrollView.js, applied as
      // `StyleSheet.compose(baseStyle, this.props.style)` — hence base first,
      // the app's style wins). The shrink half is what turns a scrollable with
      // NO style of its own into a viewport: a flex item defaults to
      // flexShrink 0 on RN's Yoga config, so without this the scroller sizes
      // to its content, outgrows a bounded parent and its scroll range stays
      // empty. It cost a whole investigation once: `@gorhom/bottom-sheet`
      // hands its list down unstyled, so the sheet's scroll lock had nothing
      // to lock — the list never received a scroll event because it had never
      // become a viewport.
      //
      // Composing base-first does NOT protect an explicit `height`: grow and
      // height are different properties, so nothing overrides anything — the
      // height is the flex BASIS and grow expands from it, and a scroller with
      // `height: 200` in a 400px column lays out at 400. RN does the same
      // (same base, same order, same node, same Yoga resolution), so this is
      // parity and not a bug; docs/api.md says so where people will look.
      // Bound the PARENT to bound the viewport.
      style: [
        { flexGrow: 1, flexShrink: 1 },
        style,
        { overflow: "scroll", flexDirection: horizontal ? "row" : "column" },
      ],
      onLayout,
      // RN semantics: a ScrollView CLIPS its content. Containers paint-
      // overflow by default, so without this the scrolled-away content (e.g.
      // the original of a pinned sticky header) keeps drawing past the scroll
      // area's edges. The `overflow: "scroll"` above would now clip the
      // viewport on its own, but a viewport that clips only while nobody
      // overrides the style is not a contract.
      alwaysClips: true,
    })

    const [contentNode] = useState(() => host.engine.createNode())
    // Sticky positions are computed INSIDE the same allocation pass that
    // places the children (beforeAllocate): the viewport has already settled
    // on this frame's scroll offset, so the pinned header lands exactly —
    // reacting to the adjustment signal instead lags a frame and jitters.
    useRnContainer(contentRef, contentNode, {
      beforeAllocate: () => {
        if (stickyRecords.current.size > 0) {
          updateSticky(outerRef.current?.getVadjustment()?.getValue() ?? 0)
        }
      },
    })

    useLayoutEffect(() => {
      outerNode.insertChild(contentNode, 0)
      contentNode.setCommit(() => {
        // The content size IS this widget's measure (scroll range) — the
        // ScrolledWindow itself allocates the content widget.
        const widget = contentRef.current
        if (!widget) {
          return
        }
        const queue = (): void => {
          queueResize(widget)
        }
        if (!deferDuringAllocate(widget, queue)) {
          queue()
        }
      })
      return () => {
        contentNode.setCommit(null)
        outerNode.removeChild(contentNode)
        contentNode.free()
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const contentLayout = splitStyle(
      StyleSheet.flatten(contentContainerStyle),
    ).layout
    const contentKey = JSON.stringify({ horizontal, contentLayout })
    useLayoutEffect(() => {
      contentNode.setStyle({
        flexDirection: horizontal ? "row" : "column",
        // RN's content container is a plain `View`, and a `View`'s default
        // `alignItems` is `stretch` — so a vertical ScrollView's children are
        // as wide as the viewport unless they say otherwise. This used to be
        // `flex-start`, which made every child shrink to its intrinsic width
        // and any `flex: 1` inside it collapse to zero.
        //
        // It was found twice. First by `Sortable`, whose rows rendered as
        // bare drag handles with no text (docs/research/drag-and-drop.md
        // recorded it as a probable ScrollView parity bug and did not act on
        // it, because changing a shared default under every example was not
        // that epic's business). Then by porting
        // `react-native-reanimated-dnd`'s example app, where it broke
        // seventeen screens at once — at which point "a ported app changes
        // nothing in its source" was simply false, and the default was the
        // thing that was wrong.
        //
        // An app that wants the old behaviour writes it, exactly as it would
        // on iOS and Android: `contentContainerStyle={{ alignItems:
        // "flex-start" }}`.
        alignItems: "stretch",
        ...contentLayout,
      })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contentNode, contentKey])

    // On the SCROLLED WINDOW, not on the content box: that is the widget the
    // handle stands for, the widget a `GestureDetector` measures its gesture's
    // view against, and the widget whose own kinetics a `Gesture.Native()`
    // over this scrollable is talking about.
    useResponder(outerRef, responderProps)

    useImperativeHandle(handleRef, () => {
      const handle: ScrollViewHandle = {
        ...createMeasureHandle(outerRef, outerNode),

        scrollTo({ x, y }) {
          const widget = outerRef.current
          if (!widget) {
            return
          }
          if (y !== undefined) {
            widget.getVadjustment()?.setValue(y)
          }
          if (x !== undefined) {
            widget.getHadjustment()?.setValue(x)
          }
        },
        scrollToEnd() {
          const widget = outerRef.current
          const adjustment = horizontal
            ? widget?.getHadjustment()
            : widget?.getVadjustment()
          if (adjustment) {
            adjustment.setValue(
              adjustment.getUpper() - adjustment.getPageSize(),
            )
          }
        },
      }
      // Spreading built a NEW object, and the widget lookup is keyed by
      // handle identity — without this the composed handle is a stranger to
      // measure.ts.
      registerHandleWidget(handle, outerRef)
      return handle
    })

    // --- sticky headers -------------------------------------------------
    // The RN model, faithfully: the REAL child is translated (no duplicate,
    // state preserved). RN gives the pinned cell a zIndex; this reorders the
    // active slot to be the LAST content child while pinned and restores it
    // afterwards, which predates `zIndex` working (gtkx/bridge/view-box.ts)
    // and is kept because it is exact: the slots here are the ScrollView's own
    // and their Yoga order is rebuilt from the same list, so the reorder that
    // would be a hazard for arbitrary app children is not one for these. Per-frame movement
    // goes through the rect-store offset fast path — zero React work while
    // scrolling.
    const stickySet = stickyHeaderIndices ?? []
    const stickyRecords = useRef(new Map<string, StickyRecord>())
    const restoreSibling = useRef(new Map<string, Gtk.Widget | null>())
    const activeStickyRef = useRef<string | null>(null)
    const [hasSticky, setHasSticky] = useState(false)

    const stickyRegistry = useRef<StickyRegistry>({
      register: (key, record) => {
        stickyRecords.current.set(key, record)
        setHasSticky(true)
        const parent = record.widget.getParent()
        if (parent) {
          queueAllocate(parent)
        }
      },
      unregister: (key) => {
        stickyRecords.current.delete(key)
        restoreSibling.current.delete(key)
        if (activeStickyRef.current === key) {
          activeStickyRef.current = null
        }
        if (stickyRecords.current.size === 0) {
          setHasSticky(false)
        }
      },
    })

    const updateSticky = (rawScrollTop: number): void => {
      if (stickyRecords.current.size === 0) {
        return
      }
      // The viewport translates the content by the FRACTIONAL adjustment
      // value while widget allocations are integer — an unquantized pin
      // disagrees with the translation by ±1px and shimmers every frame.
      // Frame telemetry (docs/research/sticky-probe.md) proved the viewport quantizes
      // like floor: with Math.floor the header's window-relative position is
      // a flat 0.00 across every frame; round oscillates 0/1, ceil sits at 1.
      const scrollTop = Math.floor(rawScrollTop)
      let active: string | null = null
      let next: StickyRecord | null = null
      for (const [key, record] of stickyRecords.current) {
        if (record.y <= scrollTop) {
          if (
            active === null ||
            record.y >= stickyRecords.current.get(active)!.y
          ) {
            active = key
          }
        } else if (next === null || record.y < next.y) {
          next = record
        }
      }

      const previous = activeStickyRef.current
      if (previous !== active) {
        activeStickyRef.current = active
        if (previous !== null) {
          const record = stickyRecords.current.get(previous)
          if (record) {
            setStoredOffset(record.widget, 0, 0)
          }
        }
        // Reordering widgets queues GTK work — not allowed mid-allocation.
        // The z-switch lands a frame later; the POSITION is already exact.
        setTimeout(() => {
          applyStickyReorder(previous, active)
        }, 0)
      }

      if (active !== null) {
        const record = stickyRecords.current.get(active)!
        // Pin at the viewport top; the next sticky header pushes it out.
        const pinned = next
          ? Math.min(scrollTop, next.y - record.height)
          : scrollTop
        setStoredOffset(record.widget, 0, Math.max(0, pinned - record.y))
      }
    }

    const applyStickyReorder = (
      previous: string | null,
      active: string | null,
    ): void => {
      if (previous !== null) {
        const record = stickyRecords.current.get(previous)
        // Slot parents are always our GtkBox containers.
        const parent = record?.widget.getParent() as Gtk.Box | null
        if (record && parent) {
          // Put the slot back where the reconciler expects it.
          parent.reorderChildAfter(
            record.widget,
            restoreSibling.current.get(previous) ?? null,
          )
          queueAllocate(parent)
        }
      }
      if (active !== null) {
        const record = stickyRecords.current.get(active)
        const parent = record?.widget.getParent() as Gtk.Box | null
        if (record && parent) {
          restoreSibling.current.set(active, record.widget.getPrevSibling())
          parent.reorderChildAfter(record.widget, parent.getLastChild())
          queueAllocate(parent)
        }
      }
    }

    // The one place the payload is read off the widget, shared by `onScroll`
    // and by all four phases — RN hands the same `ScrollEvent` to every one
    // of them, and reading it twice would be two sets of FFI calls for one
    // truth. Null when there is nothing honest to report yet (no widget, or
    // a content size the engine has not committed).
    const readScrollEvent = (): ScrollEvent | null => {
      const widget = outerRef.current
      const contentRect = contentNode.getRect()
      if (!widget || !contentRect) {
        return null
      }
      const hadjustment = widget.getHadjustment()
      const vadjustment = widget.getVadjustment()
      return {
        nativeEvent: {
          contentOffset: {
            x: hadjustment?.getValue() ?? 0,
            y: vadjustment?.getValue() ?? 0,
          },
          contentSize: { width: contentRect.width, height: contentRect.height },
          layoutMeasurement: {
            width: hadjustment?.getPageSize() ?? 0,
            height: vadjustment?.getPageSize() ?? 0,
          },
        },
      }
    }

    const emitScroll = (): void => {
      if (!onScroll) {
        return
      }
      const event = readScrollEvent()
      if (event) {
        onScroll(event)
      }
    }

    const adjustment = horizontal
      ? (scrolled?.getHadjustment() ?? null)
      : (scrolled?.getVadjustment() ?? null)
    const onAdjustment = (): void => {
      if (!perfEnabled) {
        emitScroll()
        return
      }
      // Perf: full wall time of one scroll tick's JS work — the FFI reads in
      // emitScroll plus the app/VirtualizedList onScroll handler (windowing,
      // viewability, endReached) — everything that blocks the GTK frame.
      perfCount("scroll.events")
      const start = perfNow()
      emitScroll()
      perfAddTime("scroll.js", perfNow() - start)
    }

    // --- the four scroll phases -----------------------------------------
    //
    // What GTK actually reports, measured on 4.22.4 under a real pointer
    // (docs/research/scroll-phases.md, and the trace is in
    // tests/gtk/components/scroll-phases.gtk.test.tsx):
    //
    //   - a mouse WHEEL emits `::scroll` per detent and NOTHING around it.
    //     GTK gives us no sequence, so while a consumer asks for begin/end we
    //     synthesize a desktop scroll SESSION: begin before the first detent
    //     mutates the adjustment, end after a measured idle window, and no
    //     momentum. This is an intentional desktop extension — RN has no
    //     wheel — and is what lets a phase-aware consumer capture the offset
    //     it is about to constrain instead of discovering it one event late.
    //   - a touchpad GLIDE emits `::scroll-begin`, a stream of `::scroll`,
    //     `::scroll-end` and `::decelerate` — a real sequence with a real
    //     beginning and end — and the scrolled window's own kinetic
    //     animation then carries the adjustment on for another second or so.
    //     All four phases exist, and all four are reported.
    //
    // Drag maps onto the scroll SEQUENCE rather than onto a finger on the
    // content: `::scroll-begin` is "the user started driving this scroller",
    // which is what a consumer of `onScrollBeginDrag` acts on and is as close
    // as a device that never touches the content can get. That is the one
    // approximation here, and it is named in docs/api.md.
    //
    // Momentum is read off the ADJUSTMENT, not off `::decelerate`. The
    // controller emits `decelerate` at every `scroll-end` — it reports the
    // velocity it measured, not a decision to coast — while the scrolled
    // window decides for itself whether that velocity is worth animating. RN
    // fires `onMomentumScrollBegin` only when the view actually keeps
    // moving, so the honest source is the movement itself.
    const phaseSink = scrollPhaseSink(onScroll)
    // `wants()` rather than the sink's mere presence: every Reanimated scroll
    // handler carries one, and most of them ask for nothing but `onScroll`.
    // Asking is what keeps the common case free.
    const wantsPhases = Boolean(
      onScrollBeginDrag ||
      onScrollEndDrag ||
      onMomentumScrollBegin ||
      onMomentumScrollEnd ||
      phaseSink?.wants(),
    )
    // GTK brackets touchpad gestures for us. A wheel has only detents, so the
    // begin/end extension below needs to see those detents — but only when a
    // consumer asks for either end of the session. A momentum-only handler
    // still pays no JS call per wheel event, because a wheel never coasts.
    const wantsWheelSessions = Boolean(
      onScrollBeginDrag ||
      onScrollEndDrag ||
      phaseSink?.wants("beginDrag") ||
      phaseSink?.wants("endDrag"),
    )

    // Read per event rather than captured, exactly as `useAnimatedScrollHandler`
    // does it: a re-render that changed a handler must be picked up without
    // tearing the GTK controller down and building a new one.
    const phaseHandlers = useRef({
      onScrollBeginDrag,
      onScrollEndDrag,
      onMomentumScrollBegin,
      onMomentumScrollEnd,
      phaseSink,
      readScrollEvent,
    })
    phaseHandlers.current = {
      onScrollBeginDrag,
      onScrollEndDrag,
      onMomentumScrollBegin,
      onMomentumScrollEnd,
      phaseSink,
      readScrollEvent,
    }

    useLayoutEffect(() => {
      // The whole cost story is this early return. No phase handler means no
      // controller, no signal, no tick callback and no bookkeeping — the
      // widget is byte-for-byte the one this component built before the
      // phases existed.
      if (!wantsPhases) {
        return
      }
      const widget = scrolled
      if (!widget) {
        return
      }

      const emitPhase = (phase: ScrollPhase): void => {
        const handlers = phaseHandlers.current
        const event = handlers.readScrollEvent()
        if (!event) {
          return
        }
        if (phase === "beginDrag") {
          handlers.onScrollBeginDrag?.(event)
        } else if (phase === "endDrag") {
          handlers.onScrollEndDrag?.(event)
        } else if (phase === "momentumBegin") {
          handlers.onMomentumScrollBegin?.(event)
        } else {
          handlers.onMomentumScrollEnd?.(event)
        }
        handlers.phaseSink?.deliver(phase, event)
      }

      const axis = horizontal
        ? widget.getHadjustment()
        : widget.getVadjustment()

      // Momentum is watched on the ADJUSTMENT, with two timers and no tick
      // callback. A frame-polling watcher was the first shape and it was
      // wrong twice over: it burns a callback per frame for the length of
      // every coast, and it counts FRAMES, which is not a unit — under the
      // headless compositor the frame clock free-runs at ~106 ticks per
      // millisecond (measured, docs/research/scroll-phases.md), so a
      // four-frame grace expired in microseconds. Wall time means the same
      // thing everywhere.
      //
      // Milliseconds to wait after `::scroll-end` for the scrolled window's
      // kinetic animation to take over before concluding it never will.
      // Measured handoff: `::scroll-end` at 1921.9 ms, first inertial value
      // change at 1927.5 ms — 5.6 ms. 120 is slack, not a guess.
      const handoffMs = 120
      // Milliseconds of a motionless adjustment that end the momentum. GTK's
      // deceleration steps the value every frame right to the end (16.7 ms
      // apart in the trace), so 60 ms is three and a half missed steps.
      const restMs = 60

      let watching = false
      let coasting = false
      let lastMoveAt = 0
      let handoffTimer: ReturnType<typeof setTimeout> | null = null
      let restTimer: ReturnType<typeof setTimeout> | null = null

      const clearTimers = (): void => {
        if (handoffTimer !== null) {
          clearTimeout(handoffTimer)
          handoffTimer = null
        }
        if (restTimer !== null) {
          clearTimeout(restTimer)
          restTimer = null
        }
      }

      // Re-armed for the REMAINING idle time rather than reset on every step,
      // so the number of timers a coast costs is bounded by its duration
      // (one per `restMs`) and not by how many times the adjustment moved.
      // The difference is not academic: under the headless compositor's
      // free-running frame clock a single coast steps the value ~150,000
      // times, and a clear-and-rearm per step is 150,000 timers.
      const checkRest = (): void => {
        const idle = perfNow() - lastMoveAt
        if (idle < restMs) {
          restTimer = setTimeout(checkRest, restMs - idle)
          return
        }
        restTimer = null
        stopMomentumWatch()
        emitPhase("momentumEnd")
      }

      const onCoastStep = (): void => {
        lastMoveAt = perfNow()
        if (coasting) {
          return
        }
        coasting = true
        if (handoffTimer !== null) {
          clearTimeout(handoffTimer)
          handoffTimer = null
        }
        emitPhase("momentumBegin")
        restTimer = setTimeout(checkRest, restMs)
      }

      const stopMomentumWatch = (): void => {
        clearTimers()
        if (watching) {
          axis?.off("value-changed", onCoastStep)
          watching = false
        }
        coasting = false
      }

      const watchMomentum = (): void => {
        if (watching) {
          return
        }
        watching = true
        axis?.on("value-changed", onCoastStep)
        handoffTimer = setTimeout(() => {
          handoffTimer = null
          if (!coasting) {
            // The scroller came to rest with the drag. No inertia, so no
            // momentum pair — which is RN's behaviour too.
            stopMomentumWatch()
          }
        }, handoffMs)
      }

      const controller = Gtk.EventControllerScroll.new(
        // An axis flag is REQUIRED, and not for the deltas: measured, a
        // controller created with `KINETIC` alone emits nothing at all — not
        // even `::scroll-begin`. `::scroll` is therefore emitted. It stays
        // unconnected unless somebody asks for begin/end: only then does a
        // wheel detent enter JS to maintain the desktop session below; a
        // momentum-only or untracked scroller keeps the old empty C signal
        // path.
        Gtk.EventControllerScrollFlags.BOTH_AXES |
          Gtk.EventControllerScrollFlags.KINETIC,
      )
      // CAPTURE, so the phase is reported before the scrolled window's own
      // controller acts on the same event and moves the adjustment. Nothing
      // here handles the event, so propagation is untouched either way.
      controller.setPropagationPhase(Gtk.PropagationPhase.CAPTURE)

      const beginDrag = (): void => {
        // A new drag during a coast: RN ends the momentum before beginning
        // the drag, so a consumer never sees two live phases at once.
        if (coasting) {
          stopMomentumWatch()
          emitPhase("momentumEnd")
        } else {
          stopMomentumWatch()
        }
        emitPhase("beginDrag")
      }
      // A wheel gives GTK no begin/end signals. Group its detents into one
      // user-driven session, ending after an idle interval longer than the
      // ordinary detent spacing measured in docs/research/scroll-phases.md
      // (20–33 ms in the trace). The callback runs in CAPTURE, so beginDrag
      // sees the PRE-scroll offset before GtkScrolledWindow mutates its
      // adjustment and emits the onScroll callback that consumes the context.
      const wheelSession = createWheelScrollSession(beginDrag, () =>
        emitPhase("endDrag"),
      )
      // A touchpad brackets itself, so its sequence owns the session while it
      // runs. Two live sessions at once would hand a consumer a second
      // `beginDrag` before the first `endDrag` — which is exactly the state
      // gorhom's lock reads to decide where to pin its list.
      let nativeSequence = false
      const onScrollBegin = (): void => {
        nativeSequence = true
        // A wheel burst may still be waiting out its idle timer.
        wheelSession.finish()
        beginDrag()
      }
      const onScrollEnd = (): void => {
        nativeSequence = false
        emitPhase("endDrag")
        watchMomentum()
      }
      const onScroll = (): boolean => {
        if (
          !wantsWheelSessions ||
          nativeSequence ||
          controller.getUnit() !== Gdk.ScrollUnit.WHEEL
        ) {
          return false
        }
        wheelSession.detent()
        // Observe only. GtkScrolledWindow still receives and applies the
        // detent, which is what makes this phase seam transparent.
        return false
      }

      controller.on("scroll-begin", onScrollBegin)
      controller.on("scroll-end", onScrollEnd)
      if (wantsWheelSessions) {
        controller.on("scroll", onScroll)
      }
      widget.addController(controller)

      return () => {
        controller.off("scroll-begin", onScrollBegin)
        controller.off("scroll-end", onScrollEnd)
        if (wantsWheelSessions) {
          controller.off("scroll", onScroll)
        }
        wheelSession.dispose()
        widget.removeController(controller)
        stopMomentumWatch()
      }
    }, [scrolled, wantsPhases, wantsWheelSessions, horizontal])

    // Content-size reports dedupe on the engine rect: "changed" also fires
    // for pure viewport (page-size) changes, which RN does not report.
    const lastContentSize = useRef({ width: -1, height: -1 })
    const onRangeChanged = (): void => {
      if (!onContentSizeChange) {
        return
      }
      const rect = contentNode.getRect()
      if (!rect) {
        return
      }
      const last = lastContentSize.current
      if (rect.width === last.width && rect.height === last.height) {
        return
      }
      lastContentSize.current = { width: rect.width, height: rect.height }
      onContentSizeChange(rect.width, rect.height)
    }

    // Frame-synced sticky driver: a pure scroll TRANSLATES the content
    // without re-allocating it (same size → GTK skips the vfunc), so signal
    // handlers land a frame late and the pinned header jitters. A tick
    // callback runs in the frame's UPDATE phase, before layout: when the
    // scroll offset moved, queue an allocation for THIS frame — the
    // translation and the pin correction then paint atomically.
    useLayoutEffect(() => {
      if (!hasSticky || horizontal) {
        return
      }
      const widget = scrolled
      if (!widget) {
        return
      }
      const vadjustment = widget.getVadjustment()
      let lastValue = vadjustment?.getValue() ?? 0
      // Frames to keep requeueing after the last observed move. The scrolled
      // window's own kinetic tick may run AFTER ours, so this tick's read can
      // be one frame stale: without the grace window the first frame of a
      // deceleration (its value change lands after our read) would miss its
      // correction. Kinetic deceleration changes the value every frame, so
      // three frames of slack cover the handoff at both ends of the motion.
      const graceFrames = 3
      let remaining = graceFrames
      const id = widget.addTickCallback(() => {
        perfCount("sticky.ticks")
        const value = vadjustment?.getValue() ?? 0
        if (value !== lastValue) {
          lastValue = value
          remaining = graceFrames
        } else if (remaining > 0) {
          remaining -= 1
        } else {
          // At rest: the pin is already correct and nothing translated it,
          // so an allocation pass per frame would be pure idle cost.
          return true
        }
        perfCount("sticky.queues")
        const content = contentRef.current
        if (content) {
          queueAllocate(content)
        }
        return true
      })
      return () => {
        widget.removeTickCallback(id)
      }
    }, [scrolled, hasSticky, horizontal])

    // Perf: observe the GTK frame clock through a tick callback — the delta
    // between consecutive ticks is the real frame interval (late frames show
    // up directly). Note: registering a tick callback keeps the frame clock
    // running, so idle seconds show ~60 ticks too; the reporter separates
    // load by the accompanying counters.
    useLayoutEffect(() => {
      if (!perfEnabled) {
        return
      }
      ensurePerfReporter()
      const widget = scrolled
      if (!widget) {
        return
      }
      const id = widget.addTickCallback(() => {
        perfFrameTick(perfNow())
        return true
      })
      return () => {
        widget.removeTickCallback(id)
      }
    }, [scrolled])
    useSignal(adjustment, "value-changed", onAdjustment)
    // Both axes report into the same handler — RN's callback carries both
    // dimensions no matter which one moved.
    useSignal(scrolled?.getVadjustment() ?? null, "changed", onRangeChanged)
    useSignal(scrolled?.getHadjustment() ?? null, "changed", onRangeChanged)

    return (
      <GtkScrolledWindow
        ref={(widget: Gtk.ScrolledWindow | null) => {
          outerRef.current = widget
          setScrolled(widget)
        }}
        name={testID}
      >
        <GtkBox ref={contentRef}>
          <HostNodeContext.Provider
            value={{
              engine: host.engine,
              node: contentNode,
              widgetRef: contentRef,
            }}
          >
            <StickyRegistryContext.Provider value={stickyRegistry.current}>
              {stickySet.length === 0
                ? children
                : Children.toArray(children).map((child, index) =>
                    stickySet.includes(index) ? (
                      <StickySlot
                        key={`sticky-slot-${index}`}
                        stickyKey={`index-${index}`}
                      >
                        {child}
                      </StickySlot>
                    ) : (
                      child
                    ),
                  )}
            </StickyRegistryContext.Provider>
          </HostNodeContext.Provider>
        </GtkBox>
      </GtkScrolledWindow>
    )
  },
)
ScrollView.displayName = "ScrollView"
