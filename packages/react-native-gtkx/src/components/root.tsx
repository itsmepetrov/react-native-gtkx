import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { GtkBox, queueResize, type Gtk } from "../gtkx-bridge/index.js"
import { LayoutEngine } from "../layout/index.js"
import { HostNodeContext } from "./host-node.js"
import { beginAllocatePass, endAllocatePass } from "./rect-store.js"
import { useRnContainer } from "./use-layout-child.js"

export type RootProps = {
  width: number
  height: number
  // Window mode: report a zero minimum (the window may shrink freely) and
  // adopt whatever the window actually allocates as the engine viewport —
  // the allocation IS the layout viewport, headerbar excluded by GTK itself.
  followAllocation?: boolean
  children?: ReactNode
}

// Layout root: one engine per window (or per test harness). The root GtkBox
// reports the engine viewport as its measure (via RnGtkxLayout) and is sized
// by its parent (window/harness); the owner keeps the engine viewport in sync
// (AppRegistry does it from window-size changes).
export const Root = ({
  width,
  height,
  followAllocation = false,
  children,
}: RootProps) => {
  const widgetRef = useRef<Gtk.Box | null>(null)

  // useState lazy init — see the note in use-layout-child.ts (React Compiler).
  const [engine] = useState<LayoutEngine>(
    () => new LayoutEngine({ width, height }),
  )

  useLayoutEffect(() => {
    if (followAllocation) {
      return
    }
    engine.setViewport({ width, height })
    // The viewport is this widget's measure — invalidate the cached one.
    const widget = widgetRef.current
    if (widget) {
      queueResize(widget)
    }
  }, [engine, followAllocation, width, height])

  useEffect(
    () => () => {
      engine.dispose()
    },
    [engine],
  )

  const host = useMemo(
    () => ({ engine, node: engine.root, widgetRef }),
    [engine],
  )

  useRnContainer(
    widgetRef,
    engine.root,
    followAllocation
      ? {
          measure: () => 0,
          beforeAllocate: (allocatedWidth, allocatedHeight) => {
            const current = engine.root.getRect()
            if (
              current &&
              current.width === allocatedWidth &&
              current.height === allocatedHeight
            ) {
              return
            }
            // Synchronous reflow inside the allocation pass: commits fill the
            // rect store now; their GTK queue calls are deferred past the pass.
            beginAllocatePass()
            try {
              engine.setViewport({
                width: allocatedWidth,
                height: allocatedHeight,
              })
              engine.flushSync()
            } finally {
              endAllocatePass()
            }
          },
        }
      : undefined,
  )

  return (
    <GtkBox ref={widgetRef}>
      <HostNodeContext.Provider value={host}>
        {children}
      </HostNodeContext.Provider>
    </GtkBox>
  )
}
