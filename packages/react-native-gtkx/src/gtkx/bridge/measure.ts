import * as Gtk from "@gtkx/gi/gtk"
import { perfAddTime, perfEnabled, perfNow } from "../../perf"

export type MeasureOrientation = "horizontal" | "vertical"

export type MeasureResult = {
  minimum: number
  natural: number
}

// 64-bit FFI values cross the boundary as BigInt — normalize before doing math.
export const toNumber = (value: number | bigint): number =>
  typeof value === "bigint" ? Number(value) : value

// Gtk.Widget.measure() works synchronously on unmapped widgets (request phase),
// returns [min, nat, minBaseline, natBaseline]. This is the Yoga measure input.
export const measureWidget = (
  widget: Gtk.Widget,
  orientation: MeasureOrientation,
  forSize = -1,
): MeasureResult => {
  const gtkOrientation =
    orientation === "horizontal"
      ? Gtk.Orientation.HORIZONTAL
      : Gtk.Orientation.VERTICAL
  const constraint = forSize > 0 ? Math.floor(forSize) : -1
  const start = perfEnabled ? perfNow() : 0
  const [minimum, natural] = widget.measure(gtkOrientation, constraint)
  if (perfEnabled) {
    perfAddTime("gtk.measure", perfNow() - start)
  }
  return { minimum: toNumber(minimum), natural: toNumber(natural) }
}

// Offscreen label used as a Pango-backed text measurer for Yoga text nodes.
export const createTextProbe = (): Gtk.Label => {
  const probe = new Gtk.Label()
  probe.setWrap(true)
  return probe
}
