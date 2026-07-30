import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { LayoutEngine } from "../layout/index"
import { GtkBox, queueResize, type Gtk } from "../gtkx/bridge/index"
import { HostNodeContext } from "./host-node"
import { beginAllocatePass, endAllocatePass } from "./rect-store"
import { useRnContainer } from "./use-layout-child"

export type RootProps = {
  width: number
  height: number
  // Window mode: report a zero minimum (the window may shrink freely) and
  // adopt whatever the window actually allocates as the engine viewport —
  // the allocation IS the layout viewport, headerbar excluded by GTK itself.
  followAllocation?: boolean
  // Claim the parent slot: a zero-minimum box inside a plain GTK container
  // gets no space unless it expands (window children fill implicitly, other
  // containers honor the expand flags).
  expand?: boolean
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
  expand = false,
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
    <GtkBox
      ref={widgetRef}
      hexpand={expand}
      vexpand={expand}
    >
      <HostNodeContext.Provider value={host}>
        {children}
      </HostNodeContext.Provider>
    </GtkBox>
  )
}

export type NestedRootProps = {
  children?: ReactNode
}

// Nested layout root: a full Yoga engine mounted inside ANY GTK container
// slot — an Adw.NavigationPage, a toolbar view content area, a future
// gtk-components container. The slot's allocation is the layout viewport
// (viewport-following; the initial 0×0 viewport is replaced synchronously
// inside the first allocation pass, so nothing paints at zero). Attach is
// the JSX mount; detach is the unmount — the engine is disposed with it.
// Allocate passes of sibling/nested roots may overlap: the rect-store
// tracks pass depth, so deferred GTK queue jobs run only after the
// outermost pass ends.
export const NestedRoot = ({ children }: NestedRootProps) => (
  <Root
    width={0}
    height={0}
    followAllocation
    expand
  >
    {children}
  </Root>
)
