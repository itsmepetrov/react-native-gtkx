// <G> — a grouping node: applies an SVG transform-list string and/or opacity
// to every descendant, then recurses. transform accepts translate/scale/
// rotate/matrix (no skewX/skewY, no per-axis object form — see epic.md).
import { useRef, type ReactNode } from "react"
import { setSvgNodeDescriptor, type Gtk } from "../../gtkx/bridge/index"
import { parseSvgTransform } from "../../svg/transform"
import {
  useAnimatedShapeBuild,
  type AnimatableNumber,
} from "./animated-support"
import { useSvgRoot } from "./context"
import { SvgNodeElement } from "./node"

export type GProps = {
  transform?: string
  opacity?: AnimatableNumber
  children?: ReactNode
}

export const G = ({ transform, opacity = 1, children }: GProps) => {
  const widgetRef = useRef<Gtk.Widget | null>(null)
  const { requestRedraw } = useSvgRoot("G")

  // transform is a static string (not part of the Animated channel — see
  // epic.md); only opacity can be an Animated node here.
  useAnimatedShapeBuild(
    { opacity },
    (resolved) => {
      const widget = widgetRef.current
      if (!widget) {
        return
      }
      setSvgNodeDescriptor(widget, {
        kind: "g",
        transformOps: parseSvgTransform(transform),
        opacity: resolved.opacity!,
      })
      requestRedraw()
    },
    [transform],
  )

  return <SvgNodeElement widgetRef={widgetRef}>{children}</SvgNodeElement>
}
