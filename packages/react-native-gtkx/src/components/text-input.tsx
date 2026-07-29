import { useLayoutEffect, useRef } from "react"
import { Gtk, GtkEntry, type Gtk as GtkNs } from "../gtkx-bridge/index"
import type { StyleProp } from "../contracts"
import { useLayoutChild, type LayoutEvent } from "./use-layout-child"

export type TextInputProps = {
  value?: string
  defaultValue?: string
  onChangeText?: (text: string) => void
  onSubmitEditing?: (event: { nativeEvent: { text: string } }) => void
  onFocus?: () => void
  onBlur?: () => void
  placeholder?: string
  secureTextEntry?: boolean
  editable?: boolean
  keyboardType?: "default" | "numeric" | "email-address" | "phone-pad" | "url"
  style?: StyleProp
  onLayout?: (event: LayoutEvent) => void
  testID?: string
}

const INPUT_PURPOSE: Record<
  NonNullable<TextInputProps["keyboardType"]>,
  Gtk.InputPurpose
> = {
  default: Gtk.InputPurpose.FREE_FORM,
  numeric: Gtk.InputPurpose.NUMBER,
  "email-address": Gtk.InputPurpose.EMAIL,
  "phone-pad": Gtk.InputPurpose.PHONE,
  url: Gtk.InputPurpose.URL,
}

// Single-line input over GtkEntry. gtkx's controlled-text behavior keeps the
// widget in sync with the `text` prop (RN controlled semantics); uncontrolled
// usage passes defaultValue once. Multiline (GtkTextView) is tracked for a
// follow-up — the RN surface accepts the prop but v1 renders an entry.
export const TextInput = ({
  value,
  defaultValue,
  onChangeText,
  onSubmitEditing,
  onFocus,
  onBlur,
  placeholder,
  secureTextEntry = false,
  editable = true,
  keyboardType = "default",
  style,
  onLayout,
  testID,
}: TextInputProps) => {
  const widgetRef = useRef<GtkNs.Entry | null>(null)

  useLayoutChild(widgetRef, {
    style,
    onLayout,
    // The entry measures itself (theme-accurate height); width is driven by
    // the style (flex/width), with a small floor for usability.
    measureFromWidget: true,
    extraLayout: { minWidth: 60 },
  })

  const controlled = value !== undefined

  // RC1-WORKAROUND(controllers-as-children): see docs/gtkx-rc1-vs-main.md
  // rc.1: controllers attach imperatively (JSX children work on main only).
  const focusHandlers = useRef({ onFocus, onBlur })
  focusHandlers.current = { onFocus, onBlur }
  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    const focus = new Gtk.EventControllerFocus()
    const enter = (): void => focusHandlers.current.onFocus?.()
    const leave = (): void => focusHandlers.current.onBlur?.()
    focus.on("enter", enter)
    focus.on("leave", leave)
    widget.addController(focus)
    return () => {
      widget.removeController(focus)
    }
  }, [])

  return (
    <GtkEntry
      ref={widgetRef}
      name={testID}
      text={controlled ? value : (defaultValue ?? "")}
      placeholderText={placeholder ?? ""}
      visibility={!secureTextEntry}
      editable={editable}
      sensitive={editable}
      inputPurpose={INPUT_PURPOSE[keyboardType]}
      onChanged={() => {
        const widget = widgetRef.current
        if (widget) {
          onChangeText?.(widget.getText())
        }
      }}
      onActivate={() => {
        const widget = widgetRef.current
        if (widget) {
          onSubmitEditing?.({ nativeEvent: { text: widget.getText() } })
        }
      }}
    />
  )
}
