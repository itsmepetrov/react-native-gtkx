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
  Gtk,
  GtkBox,
  GtkScrolledWindow,
  queueAllocate,
  queueResize,
  useSignal,
} from "../gtkx-bridge/index"
import { splitStyle, StyleSheet } from "../style/index"
import type { StyleProp } from "../contracts"
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

type StickyRecord = { y: number; height: number }

// A measuring wrapper around a sticky child: a plain container that reports
// its layout AND its widget, so the scroll handler can translate/reorder the
// REAL instance (RN semantics — no duplicate is ever rendered, external
// margins travel with the header exactly as designed).
const StickySlot = ({
  index,
  onRecord,
  children,
}: {
  index: number
  onRecord: (
    index: number,
    layout: { y: number; height: number },
    widget: Gtk.Widget | null,
  ) => void
  children?: ReactNode
}) => {
  const widgetRef = useRef<Gtk.Box | null>(null)
  const { host, node } = useLayoutChild(widgetRef, {
    style: undefined,
    onLayout: (event) =>
      onRecord(index, event.nativeEvent.layout, widgetRef.current),
  })
  useRnContainer(widgetRef, node)
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
    const stickyRecords = useRef(new Map<number, StickyRecord>())
    const stickyWidgets = useRef(new Map<number, Gtk.Widget>())
    const restoreSibling = useRef(new Map<number, Gtk.Widget | null>())
    const activeStickyRef = useRef<number | null>(null)

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

      const content = contentRef.current
      const previous = activeStickyRef.current
      if (previous !== active && previous !== null) {
        const widget = stickyWidgets.current.get(previous)
        if (widget && content) {
          setStoredOffset(widget, 0, 0)
          // Put the slot back where the reconciler expects it.
          content.reorderChildAfter(
            widget,
            restoreSibling.current.get(previous) ?? null,
          )
        }
      }
      if (previous !== active && active !== null) {
        const widget = stickyWidgets.current.get(active)
        if (widget && content) {
          restoreSibling.current.set(active, widget.getPrevSibling())
          content.reorderChildAfter(widget, content.getLastChild())
        }
      }
      activeStickyRef.current = active

      if (active !== null) {
        const widget = stickyWidgets.current.get(active)
        const record = stickyRecords.current.get(active)!
        if (widget && content) {
          // Pin at the viewport top; the next sticky header pushes it out.
          const pinned = next
            ? Math.min(scrollTop, next.y - record.height)
            : scrollTop
          setStoredOffset(widget, 0, Math.max(0, pinned - record.y))
          queueAllocate(content)
        }
      }
    }

    const recordSticky = (
      index: number,
      layout: { y: number; height: number },
      widget: Gtk.Widget | null,
    ): void => {
      stickyRecords.current.set(index, { y: layout.y, height: layout.height })
      if (widget) {
        stickyWidgets.current.set(index, widget)
      }
      updateSticky(scrolled?.getVadjustment()?.getValue() ?? 0)
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
                    <StickySlot
                      key={`sticky-slot-${index}`}
                      index={index}
                      onRecord={recordSticky}
                    >
                      {child}
                    </StickySlot>
                  ) : (
                    child
                  ),
                )}
          </HostNodeContext.Provider>
        </GtkBox>
      </GtkScrolledWindow>
    )
  },
)
ScrollView.displayName = "ScrollView"
