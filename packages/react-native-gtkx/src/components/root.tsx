import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { GtkFixed, type Gtk } from "../gtkx-bridge/index.js"
import { LayoutEngine } from "../layout/index.js"
import { HostNodeContext } from "./host-node.js"

export type RootProps = {
  width: number
  height: number
  children?: ReactNode
}

// Layout root: one engine per window (or per test harness). The root GtkFixed
// is sized by its parent (window/harness); the engine viewport must be kept
// in sync by the owner (AppRegistry does it from Dimensions changes).
export const Root = ({ width, height, children }: RootProps) => {
  const widgetRef = useRef<Gtk.Fixed | null>(null)

  // useState lazy init — see the note in use-layout-child.ts (React Compiler).
  const [engine] = useState<LayoutEngine>(
    () => new LayoutEngine({ width, height }),
  )

  useLayoutEffect(() => {
    engine.setViewport({ width, height })
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

  return (
    <GtkFixed
      ref={widgetRef}
      widthRequest={Math.round(width)}
      heightRequest={Math.round(height)}
    >
      <HostNodeContext.Provider value={host}>
        {children}
      </HostNodeContext.Provider>
    </GtkFixed>
  )
}
