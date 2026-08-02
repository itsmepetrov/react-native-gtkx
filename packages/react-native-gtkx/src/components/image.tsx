import { existsSync } from "node:fs"
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type Ref,
} from "react"
import type { StyleProp } from "../contracts"
import { Gdk, Gtk, GtkPicture, setPaintOnlyLeaf } from "../gtkx/bridge/index"
import { isRemoteUri, loadRemoteImage } from "./image-loader"
import { createMeasureHandle, type MeasureHandle } from "./measure"
import { useLayoutChild, type LayoutEvent } from "./use-layout-child"

export type ImageSource = { uri: string } | string

/** RN's imperative geometry methods, on an `Image` ref. */
export type ImageHandle = MeasureHandle

export type ImageProps = {
  source: ImageSource
  style?: StyleProp
  resizeMode?: "cover" | "contain" | "stretch" | "center"
  onLayout?: (event: LayoutEvent) => void
  onLoad?: () => void
  onError?: (error: { nativeEvent: { error: string } }) => void
  testID?: string
  // The same handle every other host component exposes — RN parity, and the
  // seam `Animated.Image` reads its widget back through.
  ref?: Ref<ImageHandle>
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

// Local files load synchronously; http(s) URIs download through the
// on-disk cache (image-loader.ts) and set the picture when ready. The
// texture is decoded explicitly (Gdk.Texture throws on unsupported
// formats — e.g. ICO favicons), so onError is honest instead of showing
// an empty picture. Sizing comes from the style (width/height or flex) —
// like RN, which also cannot infer remote image sizes synchronously.
export const Image = ({
  source,
  style,
  resizeMode = "cover",
  onLayout,
  onLoad,
  onError,
  testID,
  ref,
}: ImageProps) => {
  const widgetRef = useRef<Gtk.Picture | null>(null)
  const { node } = useLayoutChild(widgetRef, { style, onLayout })

  useImperativeHandle(ref, () => createMeasureHandle(widgetRef, node), [node])

  // Paint-only for picking, exactly as `Text`'s label is: `Image` has no press
  // prop, so a targetable GtkPicture only ever shadowed its own container —
  // see the zIndex block in gtkx/bridge/view-box.ts.
  useLayoutEffect(() => {
    const picture = widgetRef.current
    if (picture) {
      setPaintOnlyLeaf(picture)
    }
  }, [])

  const path = toPath(source)

  useEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    const show = (file: string): void => {
      const target = widgetRef.current
      if (!target) {
        return
      }
      try {
        // Decode explicitly: setFilename fails silently on formats the
        // texture loader does not support, newFromFilename throws.
        target.setPaintable(Gdk.Texture.newFromFilename(file))
        onLoad?.()
      } catch (error) {
        onError?.({ nativeEvent: { error: String(error) } })
      }
    }
    if (isRemoteUri(path)) {
      let cancelled = false
      loadRemoteImage(path).then(
        (file) => {
          // Unmount (or a source change) during the download must not touch
          // the widget or fire stale callbacks.
          if (!cancelled) {
            show(file)
          }
        },
        (error: unknown) => {
          if (!cancelled) {
            onError?.({ nativeEvent: { error: String(error) } })
          }
        },
      )
      return () => {
        cancelled = true
      }
    }
    if (!existsSync(path)) {
      onError?.({ nativeEvent: { error: `Image not found: ${path}` } })
      return
    }
    show(path)
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
