// Shared plumbing for every shape component (Path/Rect/Circle/Ellipse/Line/
// Polygon/Polyline): resolves geometry + numeric paint fields (any of which
// may be Animated), builds the `d` string and the descriptor, writes it, and
// requests a redraw. `extraDeps` must list every non-numeric prop `computeD`
// or `paint` close over (a plain string like `d`/`points`/`fill` changing is
// not itself part of the Animated field set, but must still re-run `build`).
import { useRef, type RefObject } from "react"
import { setSvgNodeDescriptor, type Gtk } from "../../gtkx/bridge/index"
import {
  useAnimatedShapeBuild,
  type AnimatableNumber,
} from "./animated-support"
import { useSvgRoot } from "./context"
import {
  buildShapeDescriptor,
  DEFAULT_PAINT_NUMBERS,
  type SvgPaintProps,
} from "./paint"

export type ShapeNumericPaintProps = {
  fillOpacity?: AnimatableNumber
  strokeOpacity?: AnimatableNumber
  strokeWidth?: AnimatableNumber
  strokeDashoffset?: AnimatableNumber
  opacity?: AnimatableNumber
}

export const useShapeNode = (
  componentName: string,
  geometry: Record<string, AnimatableNumber>,
  computeD: (resolvedGeometry: Record<string, number>) => string,
  paint: SvgPaintProps,
  numeric: ShapeNumericPaintProps,
  extraDeps: readonly unknown[],
): RefObject<Gtk.Widget | null> => {
  const widgetRef = useRef<Gtk.Widget | null>(null)
  const { requestRedraw } = useSvgRoot(componentName)
  const geometryKeys = Object.keys(geometry)

  const fields: Record<string, AnimatableNumber> = {
    ...geometry,
    fillOpacity: numeric.fillOpacity ?? DEFAULT_PAINT_NUMBERS.fillOpacity,
    strokeOpacity: numeric.strokeOpacity ?? DEFAULT_PAINT_NUMBERS.strokeOpacity,
    strokeWidth: numeric.strokeWidth ?? DEFAULT_PAINT_NUMBERS.strokeWidth,
    strokeDashoffset:
      numeric.strokeDashoffset ?? DEFAULT_PAINT_NUMBERS.strokeDashoffset,
    opacity: numeric.opacity ?? DEFAULT_PAINT_NUMBERS.opacity,
  }

  useAnimatedShapeBuild(
    fields,
    (resolved) => {
      const widget = widgetRef.current
      if (!widget) {
        return
      }
      const geometryValues: Record<string, number> = {}
      for (const key of geometryKeys) {
        geometryValues[key] = resolved[key]!
      }
      setSvgNodeDescriptor(
        widget,
        buildShapeDescriptor(computeD(geometryValues), paint, {
          fillOpacity: resolved.fillOpacity!,
          strokeOpacity: resolved.strokeOpacity!,
          strokeWidth: resolved.strokeWidth!,
          strokeDashoffset: resolved.strokeDashoffset!,
          opacity: resolved.opacity!,
        }),
      )
      requestRedraw()
    },
    [
      paint.fill,
      paint.fillRule,
      paint.stroke,
      paint.strokeLinecap,
      paint.strokeLinejoin,
      paint.strokeDasharray,
      ...extraDeps,
    ],
  )

  return widgetRef
}
