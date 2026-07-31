// <Svg> — the one part of this API that touches Yoga at all. Sized purely
// by style (width/height/flex), no measureFromWidget: same precedent as
// Image (verified while researching the epic — Image does not introspect
// GtkPicture's natural size either, it is entirely style-driven). viewBox +
// preserveAspectRatio only reshape the coordinate space INSIDE the
// allocated rect; Yoga never sees them.
import {
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react"
import type { DimensionValue, StyleProp } from "../../contracts"
import {
  getSvgNodeComponent,
  queueSvgRedraw,
  setSvgNodeDescriptor,
  type Gtk,
} from "../../gtkx/bridge/index"
import { parsePreserveAspectRatio, parseViewBox } from "../../svg/view-box"
import { useLayoutChild, type LayoutEvent } from "../use-layout-child"
import { SvgRootContext, type SvgRootContextValue } from "./context"

export type SvgProps = {
  width?: DimensionValue
  height?: DimensionValue
  viewBox?: string
  preserveAspectRatio?: string
  style?: StyleProp
  onLayout?: (event: LayoutEvent) => void
  testID?: string
  children?: ReactNode
}

type SvgElementProps = {
  ref?: RefObject<Gtk.Widget | null> | null
  name?: string
  cssClasses?: string[]
  children?: ReactNode
}

type SvgElementComponent = (props: SvgElementProps) => ReactNode

export const Svg = ({
  width,
  height,
  viewBox,
  preserveAspectRatio,
  style,
  onLayout,
  testID,
  children,
}: SvgProps) => {
  const widgetRef = useRef<Gtk.Widget | null>(null)

  // width/height are RN-svg convenience props layered onto style, the same
  // relationship style has to every other layout prop in this codebase.
  const sizeStyle = useMemo(
    () =>
      width === undefined && height === undefined ? null : { width, height },
    [width, height],
  )
  const { cssClass } = useLayoutChild(widgetRef, {
    style: [style, sizeStyle],
    onLayout,
  })

  const parsedViewBox = useMemo(() => parseViewBox(viewBox), [viewBox])
  const parsedPreserveAspectRatio = useMemo(
    () => parsePreserveAspectRatio(preserveAspectRatio),
    [preserveAspectRatio],
  )

  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    setSvgNodeDescriptor(widget, {
      kind: "svg",
      viewBox: parsedViewBox,
      preserveAspectRatio: parsedPreserveAspectRatio,
    })
    queueSvgRedraw(widget)
  }, [parsedViewBox, parsedPreserveAspectRatio])

  const contextValue = useMemo<SvgRootContextValue>(
    () => ({
      rootRef: widgetRef,
      requestRedraw: () => {
        const widget = widgetRef.current
        if (widget) {
          queueSvgRedraw(widget)
        }
      },
    }),
    [],
  )

  const SvgElement = getSvgNodeComponent() as unknown as SvgElementComponent
  return (
    <SvgElement
      ref={widgetRef}
      name={testID}
      cssClasses={cssClass ? [cssClass] : []}
    >
      <SvgRootContext.Provider value={contextValue}>
        {children}
      </SvgRootContext.Provider>
    </SvgElement>
  )
}
