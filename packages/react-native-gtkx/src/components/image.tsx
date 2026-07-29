import { existsSync } from "node:fs"
import { useEffect, useRef } from "react"
import { Gtk, GtkPicture } from "../gtkx-bridge/index"
import type { StyleProp } from "../contracts"
import { useLayoutChild, type LayoutEvent } from "./use-layout-child"

export type ImageSource = { uri: string } | string

export type ImageProps = {
  source: ImageSource
  style?: StyleProp
  resizeMode?: "cover" | "contain" | "stretch" | "center"
  onLayout?: (event: LayoutEvent) => void
  onLoad?: () => void
  onError?: (error: { nativeEvent: { error: string } }) => void
  testID?: string
}

const CONTENT_FIT = {
  cover: Gtk.ContentFit.COVER,
  contain: Gtk.ContentFit.CONTAIN,
  stretch: Gtk.ContentFit.FILL,
  center: Gtk.ContentFit.SCALE_DOWN,
} as const

const toPath = (source: ImageSource): string => {
  const uri = typeof source === "string" ? source : source.uri
  return uri.startsWith("file://") ? uri.slice("file://".length) : uri
}

// v1: local files only (the whole Node fs is available to apps). Sizing comes
// from the style (width/height or flex) — like RN, which also cannot infer
// remote image sizes synchronously.
export const Image = ({
  source,
  style,
  resizeMode = "cover",
  onLayout,
  onLoad,
  onError,
  testID,
}: ImageProps) => {
  const widgetRef = useRef<Gtk.Picture | null>(null)
  useLayoutChild(widgetRef, { style, onLayout })

  const path = toPath(source)

  useEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    if (!existsSync(path)) {
      onError?.({ nativeEvent: { error: `Image not found: ${path}` } })
      return
    }
    widget.setFilename(path)
    onLoad?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  return (
    <GtkPicture
      ref={widgetRef}
      name={testID}
      contentFit={CONTENT_FIT[resizeMode]}
    />
  )
}
