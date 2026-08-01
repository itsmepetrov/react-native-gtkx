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
import { HostNodeContext } from "./host-node"
import { deferDuringAllocate, setStoredOffset } from "./rect-store"
import {
  useLayoutChild,
  useRnContainer,
  type LayoutEvent,
} from "./use-layout-child"

export type ScrollViewHandle = {
  scrollTo(options: { x?: number; y?: number; animated?: boolean }): void
  scrollToEnd(options?: { animated?: boolean }): void
}

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

export type ScrollViewProps = {
  style?: StyleProp
  contentContainerStyle?: StyleProp
  horizontal?: boolean
  // RN sticky headers (vertical lists): the children at these indices pin to
  // the top while scrolled past, each pushed out by the next one.
  stickyHeaderIndices?: readonly number[]
  onScroll?: (event: ScrollEvent) => void
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
      onContentSizeChange,
      onLayout,
      children,
      testID,
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
      style: [
        style,
        { overflow: "scroll", flexDirection: horizontal ? "row" : "column" },
      ],
      onLayout,
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

    // RN semantics: a ScrollView CLIPS its content. Branch B made containers
    // paint-overflow by default, so without this the scrolled-away content
    // (e.g. the original of a pinned sticky header) keeps drawing past the
    // scroll area's edges.
    useLayoutEffect(() => {
      outerRef.current?.setOverflow(Gtk.Overflow.HIDDEN)
    }, [])

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
        alignItems: "flex-start",
        ...contentLayout,
      })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contentNode, contentKey])

    useImperativeHandle(handleRef, () => ({
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
          adjustment.setValue(adjustment.getUpper() - adjustment.getPageSize())
        }
      },
    }))

    // --- sticky headers -------------------------------------------------
    // The RN model, faithfully: the REAL child is translated (no duplicate,
    // state preserved). RN gives the pinned cell a zIndex; GTK's z-order is
    // sibling paint order, so the active slot is reordered to be the LAST
    // content child while pinned and restored afterwards. Per-frame movement
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

    const emitScroll = (): void => {
      if (!onScroll) {
        return
      }
      const widget = outerRef.current
      const contentRect = contentNode.getRect()
      if (!widget || !contentRect) {
        return
      }
      const hadjustment = widget.getHadjustment()
      const vadjustment = widget.getVadjustment()
      onScroll({
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
      })
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
