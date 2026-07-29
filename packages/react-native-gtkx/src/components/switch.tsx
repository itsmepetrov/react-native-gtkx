import { useRef } from "react"
import { GtkSwitch, type Gtk } from "../gtkx-bridge/index"
import type { StyleProp } from "../contracts"
import { useLayoutChild, type LayoutEvent } from "./use-layout-child"

export type SwitchProps = {
  value?: boolean
  onValueChange?: (value: boolean) => void
  disabled?: boolean
  style?: StyleProp
  onLayout?: (event: LayoutEvent) => void
  testID?: string
}

// GtkSwitch natural size drives the Yoga leaf; controlled like RN: the state
// change is reported but the widget follows the `value` prop.
export const Switch = ({
  value = false,
  onValueChange,
  disabled = false,
  style,
  onLayout,
  testID,
}: SwitchProps) => {
  const widgetRef = useRef<Gtk.Switch | null>(null)

  useLayoutChild(widgetRef, {
    style,
    onLayout,
    measureFromWidget: true,
  })

  return (
    <GtkSwitch
      ref={widgetRef}
      name={testID}
      active={value}
      sensitive={!disabled}
      onStateSet={(state: boolean) => {
        onValueChange?.(state)
        // Controlled: swallow the default toggle, the prop drives the widget.
        return true
      }}
    />
  )
}
