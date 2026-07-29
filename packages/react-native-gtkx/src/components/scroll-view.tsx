import {
  Children,
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  GtkBox,
  GtkScrolledWindow,
  queueResize,
  useSignal,
  type Gtk,
} from "../gtkx-bridge/index"
import { splitStyle, StyleSheet } from "../style/index"
import type { StyleProp } from "../contracts"
import { Animated } from "./animated"
import { HostNodeContext } from "./host-node"
import { deferDuringAllocate } from "./rect-store"
import {
  useLayoutChild,
  useRnContainer,
  type LayoutEvent,
} from "./use-layout-child"
import { View } from "./view"

export type ScrollViewHandle = {
  scrollTo(options: { x?: number; y?: number; animated?: boolean }): void
  scrollToEnd(options?: { animated?: boolean }): void
}

export type ScrollEvent = {
  nativeEvent: {
    contentOffset: { x: number; y: number }
    contentSize: { width: number; height: number }
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
  onLayout?: (event: LayoutEvent) => void
  children?: ReactNode
  testID?: string
}

type StickyRecord = { x: number; y: number; width: number; height: number }

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
    useRnContainer(contentRef, contentNode)

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
    // RN model: the child stays in flow; when scrolled past, a SECOND
    // instance of it renders as the LAST content child (sibling paint order
    // puts it on top) pinned to the viewport top via the Animated fast path —
    // no React work per scroll frame, only when the ACTIVE index changes.
    const stickySet = stickyHeaderIndices ?? []
    const stickyRecords = useRef(new Map<number, StickyRecord>())
    const [activeSticky, setActiveSticky] = useState<number | null>(null)
    const activeStickyRef = useRef<number | null>(null)
    // Geometry changes of the recorded slots must re-render the pinned copy
    // (it inherits the slot's x/width) — bump on onLayout.
    const [, setStickyGeometry] = useState(0)
    const [stickyTop] = useState(() => new Animated.Value(0))

    const updateSticky = (scrollTop: number): void => {
      if (stickySet.length === 0) {
        return
      }
      let active: number | null = null
      let next: StickyRecord | null = null
      for (const index of stickySet) {
        const record = stickyRecords.current.get(index)
        if (!record) {
          continue
        }
        if (record.y <= scrollTop) {
          if (
            active === null ||
            record.y >= stickyRecords.current.get(active)!.y
          ) {
            active = index
          }
        } else if (next === null || record.y < next.y) {
          next = record
        }
      }
      // Compare through a ref: the adjustment handler may hold a stale
      // closure over the state.
      if (active !== activeStickyRef.current) {
        activeStickyRef.current = active
        setActiveSticky(active)
      }
      if (active !== null) {
        const record = stickyRecords.current.get(active)!
        // Pinned at the viewport top, pushed out by the next sticky header:
        // it freezes at next.y - height and scrolls away naturally, so the
        // hand-off is continuous.
        const pinned = next
          ? Math.min(scrollTop, next.y - record.height)
          : scrollTop
        stickyTop.setValue(Math.max(record.y, pinned))
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
      onScroll({
        nativeEvent: {
          contentOffset: {
            x: widget.getHadjustment()?.getValue() ?? 0,
            y: widget.getVadjustment()?.getValue() ?? 0,
          },
          contentSize: { width: contentRect.width, height: contentRect.height },
        },
      })
    }

    const adjustment = horizontal
      ? (scrolled?.getHadjustment() ?? null)
      : (scrolled?.getVadjustment() ?? null)
    const onAdjustment = (): void => {
      emitScroll()
      if (!horizontal) {
        updateSticky(scrolled?.getVadjustment()?.getValue() ?? 0)
      }
    }
    useSignal(adjustment, "value-changed", onAdjustment)

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
            {stickySet.length === 0
              ? children
              : Children.toArray(children).map((child, index) =>
                  stickySet.includes(index) ? (
                    <View
                      key={`sticky-slot-${index}`}
                      onLayout={(event) => {
                        stickyRecords.current.set(index, {
                          x: event.nativeEvent.layout.x,
                          y: event.nativeEvent.layout.y,
                          width: event.nativeEvent.layout.width,
                          height: event.nativeEvent.layout.height,
                        })
                        setStickyGeometry((value) => value + 1)
                        updateSticky(
                          scrolled?.getVadjustment()?.getValue() ?? 0,
                        )
                      }}
                    >
                      {child}
                    </View>
                  ) : (
                    child
                  ),
                )}
            {activeSticky !== null && (
              <Animated.View
                // The pinned copy inherits the slot's measured geometry so it
                // matches the in-flow header exactly (container paddings,
                // non-stretched widths).
                style={{
                  position: "absolute",
                  left: stickyRecords.current.get(activeSticky)?.x ?? 0,
                  width: stickyRecords.current.get(activeSticky)?.width,
                  top: 0,
                  transform: [{ translateY: stickyTop }],
                }}
              >
                {Children.toArray(children)[activeSticky]}
              </Animated.View>
            )}
          </HostNodeContext.Provider>
        </GtkBox>
      </GtkScrolledWindow>
    )
  },
)
ScrollView.displayName = "ScrollView"
