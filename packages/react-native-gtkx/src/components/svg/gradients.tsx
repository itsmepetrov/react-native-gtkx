// <Defs>/<LinearGradient>/<RadialGradient>/<Stop> — paint resources, not
// visible nodes. They ride the same RnGtkxSvgNode tree as everything else
// (so the bridge's snapshot() can walk <Defs> separately, before the main
// paint pass, to build an id → gradient map — see svg-node.ts), but are
// never part of the Animated numeric channel: gradients are definitions,
// not painted geometry, and nothing in scope needs an animated stop.
import { useLayoutEffect, useRef, type ReactNode } from "react"
import {
  Gdk,
  resolveSvgColor,
  setSvgNodeDescriptor,
  type Gtk,
  type SvgGradientUnits,
} from "../../gtkx/bridge/index"
import { SvgNodeElement } from "./node"

export type DefsProps = { children?: ReactNode }

export const Defs = ({ children }: DefsProps) => {
  const widgetRef = useRef<Gtk.Widget | null>(null)
  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (widget) {
      setSvgNodeDescriptor(widget, { kind: "defs" })
    }
  }, [])
  return <SvgNodeElement widgetRef={widgetRef}>{children}</SvgNodeElement>
}

export type LinearGradientProps = {
  id: string
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  gradientUnits?: SvgGradientUnits
  children?: ReactNode
}

export const LinearGradient = ({
  id,
  x1 = 0,
  y1 = 0,
  x2 = 1,
  y2 = 0,
  gradientUnits = "objectBoundingBox",
  children,
}: LinearGradientProps) => {
  const widgetRef = useRef<Gtk.Widget | null>(null)
  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (widget) {
      setSvgNodeDescriptor(widget, {
        kind: "gradient",
        type: "linear",
        id,
        units: gradientUnits,
        x1,
        y1,
        x2,
        y2,
      })
    }
  }, [id, x1, y1, x2, y2, gradientUnits])
  return <SvgNodeElement widgetRef={widgetRef}>{children}</SvgNodeElement>
}

export type RadialGradientProps = {
  id: string
  cx?: number
  cy?: number
  r?: number
  gradientUnits?: SvgGradientUnits
  children?: ReactNode
}

export const RadialGradient = ({
  id,
  cx = 0.5,
  cy = 0.5,
  r = 0.5,
  gradientUnits = "objectBoundingBox",
  children,
}: RadialGradientProps) => {
  const widgetRef = useRef<Gtk.Widget | null>(null)
  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (widget) {
      setSvgNodeDescriptor(widget, {
        kind: "gradient",
        type: "radial",
        id,
        units: gradientUnits,
        cx,
        cy,
        r,
      })
    }
  }, [id, cx, cy, r, gradientUnits])
  return <SvgNodeElement widgetRef={widgetRef}>{children}</SvgNodeElement>
}

// "50%" or 0.5 — both spellings are common in real SVGO output.
const parseOffset = (offset: number | string): number => {
  if (typeof offset === "number") {
    return offset
  }
  const trimmed = offset.trim()
  return trimmed.endsWith("%")
    ? Number.parseFloat(trimmed.slice(0, -1)) / 100
    : Number.parseFloat(trimmed)
}

export type StopProps = {
  offset: number | string
  stopColor?: string
  stopOpacity?: number
}

export const Stop = ({
  offset,
  stopColor = "black",
  stopOpacity = 1,
}: StopProps) => {
  const widgetRef = useRef<Gtk.Widget | null>(null)
  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    const color =
      resolveSvgColor(stopColor) ??
      new Gdk.RGBA({ red: 0, green: 0, blue: 0, alpha: 1 })
    const clampedOpacity = Math.max(0, Math.min(1, stopOpacity))
    setSvgNodeDescriptor(widget, {
      kind: "stop",
      offset: Math.max(0, Math.min(1, parseOffset(offset))),
      color:
        clampedOpacity >= 1
          ? color
          : new Gdk.RGBA({
              red: color.red,
              green: color.green,
              blue: color.blue,
              alpha: color.alpha * clampedOpacity,
            }),
    })
  }, [offset, stopColor, stopOpacity])
  return <SvgNodeElement widgetRef={widgetRef} />
}
