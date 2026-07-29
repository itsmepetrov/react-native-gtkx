import { useRef } from "react"
import { GtkSpinner, type Gtk } from "../gtkx-bridge/index.js"
import type { StyleProp } from "../contracts.js"
import { useLayoutChild, type LayoutEvent } from "./use-layout-child.js"

export type ActivityIndicatorProps = {
  animating?: boolean
  size?: "small" | "large" | number
  style?: StyleProp
  onLayout?: (event: LayoutEvent) => void
  testID?: string
}

const sizeToPixels = (size: ActivityIndicatorProps["size"]): number => {
  if (typeof size === "number") {
    return size
  }
  return size === "large" ? 36 : 20
}

export const ActivityIndicator = ({
  animating = true,
  size = "small",
  style,
  onLayout,
  testID,
}: ActivityIndicatorProps) => {
  const widgetRef = useRef<Gtk.Spinner | null>(null)
  const pixels = sizeToPixels(size)

  useLayoutChild(widgetRef, {
    style,
    onLayout,
    extraLayout: { width: pixels, height: pixels },
  })

  return (
    <GtkSpinner
      ref={widgetRef}
      name={testID}
      spinning={animating}
    />
  )
}
