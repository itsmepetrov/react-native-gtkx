import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  GtkFixed,
  GtkScrolledWindow,
  useSignal,
  type Gtk,
} from "../gtkx-bridge/index.js"
import { splitStyle, StyleSheet } from "../style/index.js"
import type { Rect, StyleProp } from "../contracts.js"
import { HostNodeContext } from "./host-node.js"
import { useLayoutChild, type LayoutEvent } from "./use-layout-child.js"

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
  onScroll?: (event: ScrollEvent) => void
  onLayout?: (event: LayoutEvent) => void
  children?: ReactNode
  testID?: string
}

// GtkScrolledWindow whose child is a content GtkFixed backed by its own Yoga
// node inside the same engine: the content grows past the viewport
// (overflow: scroll on the outer node) and the scrolled window pans it.
export const ScrollView = forwardRef<ScrollViewHandle, ScrollViewProps>(
  (
    {
      style,
      contentContainerStyle,
      horizontal = false,
      onScroll,
      onLayout,
      children,
      testID,
    },
    handleRef,
  ) => {
    const outerRef = useRef<Gtk.ScrolledWindow | null>(null)
    const contentRef = useRef<Gtk.Fixed | null>(null)
    const [scrolled, setScrolled] = useState<Gtk.ScrolledWindow | null>(null)

    const { host, node: outerNode } = useLayoutChild(outerRef, {
      style: [style, { overflow: "scroll" }],
      onLayout,
    })

    const [contentNode] = useState(() => host.engine.createNode())

    useLayoutEffect(() => {
      outerNode.insertChild(contentNode, 0)
      contentNode.setCommit((rect: Rect) => {
        contentRef.current?.setSizeRequest(
          Math.round(rect.width),
          Math.round(rect.height),
        )
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
    useSignal(adjustment, "value-changed", emitScroll)

    return (
      <GtkScrolledWindow
        ref={(widget: Gtk.ScrolledWindow | null) => {
          outerRef.current = widget
          setScrolled(widget)
        }}
        name={testID}
      >
        <GtkFixed ref={contentRef}>
          <HostNodeContext.Provider
            value={{
              engine: host.engine,
              node: contentNode,
              widgetRef: contentRef,
            }}
          >
            {children}
          </HostNodeContext.Provider>
        </GtkFixed>
      </GtkScrolledWindow>
    )
  },
)
ScrollView.displayName = "ScrollView"
