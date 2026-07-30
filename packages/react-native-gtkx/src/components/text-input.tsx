import { useLayoutEffect, useRef, useState } from "react"
import type { StyleProp } from "../contracts"
import {
  Gtk,
  GtkEntry,
  GtkLabel,
  GtkScrolledWindow,
  GtkTextView,
  type Gtk as GtkNs,
} from "../gtkx/bridge/index"
import { useLayoutChild, type LayoutEvent } from "./use-layout-child"
import { View } from "./view"

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
  // RN: a multiline input needs a height in the style; Enter inserts a
  // newline and never fires onSubmitEditing.
  multiline?: boolean
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

// RC1-WORKAROUND(controllers-as-children): see docs/gtkx-rc1-vs-main.md
// rc.1: controllers attach imperatively (JSX children work on main only).
const useFocusController = (
  widgetRef: React.RefObject<GtkNs.Widget | null>,
  onFocus?: () => void,
  onBlur?: () => void,
): void => {
  const handlers = useRef({ onFocus, onBlur })
  handlers.current = { onFocus, onBlur }
  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    const focus = new Gtk.EventControllerFocus()
    const enter = (): void => handlers.current.onFocus?.()
    const leave = (): void => handlers.current.onBlur?.()
    focus.on("enter", enter)
    focus.on("leave", leave)
    widget.addController(focus)
    return () => {
      widget.removeController(focus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

// Single-line input over GtkEntry. gtkx's controlled-text behavior keeps the
// widget in sync with the `text` prop (RN controlled semantics); uncontrolled
// usage passes defaultValue once.
const SingleLineTextInput = ({
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

  useFocusController(widgetRef, onFocus, onBlur)

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

const readBuffer = (buffer: GtkNs.TextBuffer): string =>
  buffer.getText(buffer.getStartIter(), buffer.getEndIter(), true)

// GtkTextView has no native placeholder — a dim, click-transparent label
// sits over the empty view (RN shows the placeholder while empty, focused
// or not).
const MultilinePlaceholder = ({ text }: { text: string }) => {
  const labelRef = useRef<GtkNs.Label | null>(null)
  useLayoutChild(labelRef, {
    style: { position: "absolute", left: 12, top: 8 },
    onLayout: undefined,
  })
  useLayoutEffect(() => {
    labelRef.current?.setCanTarget(false)
    labelRef.current?.addCssClass("dim-label")
  }, [])
  return (
    <GtkLabel
      ref={labelRef}
      label={text}
    />
  )
}

// Multiline input over GtkTextView in a GtkScrolledWindow: word wrap, the
// style sets the box (RN requires a height for multiline), overflowing
// content scrolls inside. The buffer syncs with `value` under RN controlled
// semantics; Enter inserts a newline (onSubmitEditing never fires — RN
// multiline behavior).
const MultilineTextInput = ({
  value,
  defaultValue,
  onChangeText,
  onFocus,
  onBlur,
  placeholder,
  editable = true,
  style,
  onLayout,
  testID,
}: TextInputProps) => {
  const scrolledRef = useRef<GtkNs.ScrolledWindow | null>(null)
  const viewRef = useRef<GtkNs.TextView | null>(null)
  const controlled = value !== undefined
  const [empty, setEmpty] = useState(
    (controlled ? (value ?? "") : (defaultValue ?? "")) === "",
  )

  const suppressEcho = useRef(false)
  const latest = useRef({ onChangeText })
  latest.current = { onChangeText }

  useLayoutEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }
    // Breathing room akin to GtkEntry's built-in padding.
    view.setLeftMargin(10)
    view.setRightMargin(10)
    view.setTopMargin(8)
    view.setBottomMargin(8)
    const buffer = view.getBuffer()
    const initial = controlled ? (value ?? "") : (defaultValue ?? "")
    if (initial !== "") {
      suppressEcho.current = true
      buffer.setText(initial, -1)
      suppressEcho.current = false
    }
    const changed = (): void => {
      const text = readBuffer(buffer)
      setEmpty(text === "")
      if (!suppressEcho.current) {
        latest.current.onChangeText?.(text)
      }
    }
    buffer.on("changed", changed)
    return () => {
      buffer.off("changed", changed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // RN controlled semantics: the prop wins over whatever was typed.
  useLayoutEffect(() => {
    if (!controlled) {
      return
    }
    const view = viewRef.current
    if (!view) {
      return
    }
    const buffer = view.getBuffer()
    const next = value ?? ""
    if (readBuffer(buffer) !== next) {
      suppressEcho.current = true
      buffer.setText(next, -1)
      suppressEcho.current = false
      setEmpty(next === "")
    }
  }, [controlled, value])

  useFocusController(viewRef, onFocus, onBlur)

  return (
    <View
      style={[style, { minHeight: 36, minWidth: 60 }]}
      onLayout={onLayout}
    >
      <ScrolledFill scrolledRef={scrolledRef}>
        <GtkTextView
          ref={viewRef}
          name={testID}
          editable={editable}
          sensitive={editable}
          wrapMode={Gtk.WrapMode.WORD_CHAR}
        />
      </ScrolledFill>
      {empty && placeholder ? (
        <MultilinePlaceholder text={placeholder} />
      ) : null}
    </View>
  )
}

// The scrolled window fills the styled box exactly (its own layout child).
const ScrolledFill = ({
  scrolledRef,
  children,
}: {
  scrolledRef: React.RefObject<GtkNs.ScrolledWindow | null>
  children: React.ReactNode
}) => {
  useLayoutChild(scrolledRef, {
    style: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
    onLayout: undefined,
  })
  return <GtkScrolledWindow ref={scrolledRef}>{children}</GtkScrolledWindow>
}

export const TextInput = (props: TextInputProps) =>
  props.multiline ? (
    <MultilineTextInput {...props} />
  ) : (
    <SingleLineTextInput {...props} />
  )
