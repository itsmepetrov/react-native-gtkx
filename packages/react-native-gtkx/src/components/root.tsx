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
import { useRnContainer } from "./use-layout-child.js"

export type RootProps = {
  width: number
  height: number
  children?: ReactNode
}

// Layout root: one engine per window (or per test harness). The root GtkBox
// reports the engine viewport as its measure (via RnGtkxLayout) and is sized
// by its parent (window/harness); the owner keeps the engine viewport in sync
// (AppRegistry does it from window-size changes).
export const Root = ({ width, height, children }: RootProps) => {
  const widgetRef = useRef<Gtk.Box | null>(null)

  // useState lazy init — see the note in use-layout-child.ts (React Compiler).
  const [engine] = useState<LayoutEngine>(
    () => new LayoutEngine({ width, height }),
  )

  useLayoutEffect(() => {
    engine.setViewport({ width, height })
    // The viewport is this widget's measure — invalidate the cached one.
    const widget = widgetRef.current
    if (widget) {
      queueResize(widget)
    }
  }, [engine, width, height])

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

  useRnContainer(widgetRef, engine.root)

  return (
    <GtkBox ref={widgetRef}>
      <HostNodeContext.Provider value={host}>
        {children}
      </HostNodeContext.Provider>
    </GtkBox>
  )
}
