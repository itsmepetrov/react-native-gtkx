// RnGtkxSvgNode — one GObject class (registerClass, same mechanism as
// RnGtkxLayout/RnGtkxViewBox) reused for the <Svg> root AND every descendant
// (<G>, <Path>, <Rect>, ..., <Defs>, <LinearGradient>, <Stop>). Descendants
// are ordinary GTK children (the reconciler's generic set_parent/insert_after
// attachment — the same one View relies on) that GTK never snapshots on its
// own, because nothing ever calls snapshotChild() on them: only the mounted
// <Svg> instance's snapshot() vfunc actually runs, and it walks
// getFirstChild()/getNextSibling() itself, reading each node's role from a
// WeakMap (native wrappers get re-created by the runtime, so per-instance
// state cannot live on `this` — same reasoning as hooksByManager in
// layout-manager.ts).
//
// `Gtk.Widget.snapshot()` is a real, working vfunc in gtkx's codegen
// (node_modules/@gtkx/gi/gtk/gtk.js, registerWrapperClass(Widget, ...) lists
// it with byteOffset 320) even though it is missing from the shipped
// `gtk.d.ts` — the type generator drops it, the codegen that actually wires
// vfuncs does not. Verified by reading the generated registry before writing
// any of this; see epic.md.
import * as Gdk from "@gtkx/gi/gdk"
import * as Graphene from "@gtkx/gi/graphene"
import * as Gsk from "@gtkx/gi/gsk"
import * as Gtk from "@gtkx/gi/gtk"
import { createElementComponent } from "@gtkx/react/internal"
import { registerClass } from "@gtkx/runtime"
import { parseColor } from "../../style/colors"
import {
  resolveGradientPoint,
  resolveGradientRadius,
  type BoundingBox,
} from "../../svg/gradient-geometry"
import type { SvgTransformOp } from "../../svg/transform"
import {
  resolveViewBoxTransform,
  type PreserveAspectRatio,
  type ViewBox,
} from "../../svg/view-box"

// --- descriptors --------------------------------------------------------

export type SvgPaintSpec =
  { kind: "color"; rgba: Gdk.RGBA } | { kind: "ref"; id: string }

export type SvgGradientUnits = "objectBoundingBox" | "userSpaceOnUse"

export type SvgSvgDescriptor = {
  kind: "svg"
  viewBox: ViewBox | null
  preserveAspectRatio: PreserveAspectRatio
}

export type SvgGroupDescriptor = {
  kind: "g"
  transformOps: SvgTransformOp[]
  opacity: number
}

export type SvgShapeDescriptor = {
  kind: "shape"
  path: Gsk.Path | null
  fill: SvgPaintSpec | null
  fillOpacity: number
  fillRule: Gsk.FillRule
  stroke: SvgPaintSpec | null
  strokeOpacity: number
  strokeWidth: number
  strokeLinecap: Gsk.LineCap
  strokeLinejoin: Gsk.LineJoin
  strokeMiterlimit: number
  strokeDasharray: number[] | null
  strokeDashoffset: number
  opacity: number
}

export type SvgDefsDescriptor = { kind: "defs" }

export type SvgLinearGradientDescriptor = {
  kind: "gradient"
  type: "linear"
  id: string
  units: SvgGradientUnits
  x1: number
  y1: number
  x2: number
  y2: number
}

export type SvgRadialGradientDescriptor = {
  kind: "gradient"
  type: "radial"
  id: string
  units: SvgGradientUnits
  cx: number
  cy: number
  r: number
}

export type SvgStopDescriptor = {
  kind: "stop"
  offset: number
  color: Gdk.RGBA
}

export type SvgNodeDescriptor =
  | SvgSvgDescriptor
  | SvgGroupDescriptor
  | SvgShapeDescriptor
  | SvgDefsDescriptor
  | SvgLinearGradientDescriptor
  | SvgRadialGradientDescriptor
  | SvgStopDescriptor

const nodeDescriptors = new WeakMap<Gtk.Widget, SvgNodeDescriptor>()

export const setSvgNodeDescriptor = (
  widget: Gtk.Widget,
  descriptor: SvgNodeDescriptor,
): void => {
  nodeDescriptors.set(widget, descriptor)
}

export const getSvgNodeDescriptor = (
  widget: Gtk.Widget,
): SvgNodeDescriptor | undefined => nodeDescriptors.get(widget)

// --- paint resolution ----------------------------------------------------

// `parseColor` also passes CSS variables (`var(--x)`) and legacy GTK named
// colors (`@name`) through unchanged, for the CSS-cascade styling path
// elsewhere in this codebase. Raw Gsk paint nodes have no cascade to resolve
// those against — deliberate cut (epic.md): SVG fill/stroke only accepts
// static CSS colors (hex/rgb/hsl/named/transparent), not PlatformColor.
export const resolveSvgColor = (spec: string | undefined): Gdk.RGBA | null => {
  if (!spec) {
    return null
  }
  const normalized = parseColor(spec)
  if (
    !normalized ||
    normalized.startsWith("var(") ||
    normalized.startsWith("@")
  ) {
    return null
  }
  const rgba = new Gdk.RGBA()
  return rgba.parse(normalized) ? rgba : null
}

const URL_REF_PATTERN = /^url\(#(.+)\)$/

export const resolveSvgPaint = (
  spec: string | undefined,
): SvgPaintSpec | null => {
  if (!spec || spec === "none") {
    return null
  }
  const match = URL_REF_PATTERN.exec(spec.trim())
  if (match) {
    return { kind: "ref", id: match[1]! }
  }
  const rgba = resolveSvgColor(spec)
  return rgba ? { kind: "color", rgba } : null
}

const scaledAlpha = (rgba: Gdk.RGBA, factor: number): Gdk.RGBA =>
  factor >= 1
    ? rgba
    : new Gdk.RGBA({
        red: rgba.red,
        green: rgba.green,
        blue: rgba.blue,
        alpha: rgba.alpha * factor,
      })

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

// --- gradients -------------------------------------------------------------

type GradientEntry = {
  descriptor: SvgLinearGradientDescriptor | SvgRadialGradientDescriptor
  stops: Gsk.ColorStop[]
}

// RC2-WORKAROUND(gsk-colorstop-boxed-write) — row in docs/gtkx-rc2-notes.md.
// Writing a Gdk.RGBA into a Gsk.ColorStop's `color` field crashes in the
// native addon (@gtkx/native)
// with "Expected an Object for Boxed field write type, got Object" —
// verified through THREE independent paths, all hitting the same native
// code: the generated constructor (uses the wrong of two RGBA descriptors,
// _desc1 instead of the inline _desc2 — a real codegen bug), the property
// setter (uses the documented-correct _desc2 descriptor and STILL fails,
// which rules out a simple descriptor mix-up as the whole story), and a
// bypass that skips ColorStop construction and hands appendLinearGradient a
// plain {offset, color} object array instead (fails differently, with "No
// native handle associated with Object" — the array marshaling genuinely
// requires a native-backed instance per element, so there is no JS-level
// escape hatch). This is a native-addon bug, not something fixable from
// application code.
//
// Rather than crash every app that uses a gradient, or drop the gradient
// components from the API while their descriptor-building is fully correct
// and tested, a stop that fails to construct is treated exactly like a
// missing gradient reference (see the url(#missing) test): the shape using
// it simply paints no fill/stroke for that paint, instead of throwing.
const makeColorStop = (
  offset: number,
  color: Gdk.RGBA,
): Gsk.ColorStop | null => {
  try {
    const stop = new Gsk.ColorStop()
    stop.offset = offset
    stop.color = color
    return stop
  } catch {
    return null
  }
}

const collectStops = (gradientWidget: Gtk.Widget): Gsk.ColorStop[] => {
  const stops: Gsk.ColorStop[] = []
  let child = gradientWidget.getFirstChild()
  while (child) {
    const descriptor = nodeDescriptors.get(child)
    if (descriptor?.kind === "stop") {
      const stop = makeColorStop(descriptor.offset, descriptor.color)
      if (stop) {
        stops.push(stop)
      }
    }
    child = child.getNextSibling()
  }
  return stops
}

// Only DIRECT <Defs> children of <Svg> are scanned (a deliberate simplicity
// cut — every real react-native-svg example keeps Defs at the top).
const collectGradients = (root: Gtk.Widget): Map<string, GradientEntry> => {
  const gradients = new Map<string, GradientEntry>()
  let child = root.getFirstChild()
  while (child) {
    if (nodeDescriptors.get(child)?.kind === "defs") {
      let gradientNode = child.getFirstChild()
      while (gradientNode) {
        const descriptor = nodeDescriptors.get(gradientNode)
        if (descriptor?.kind === "gradient") {
          gradients.set(descriptor.id, {
            descriptor,
            stops: collectStops(gradientNode),
          })
        }
        gradientNode = gradientNode.getNextSibling()
      }
    }
    child = child.getNextSibling()
  }
  return gradients
}

const asBoundingBox = (rect: Graphene.Rect): BoundingBox => ({
  x: rect.origin.x,
  y: rect.origin.y,
  width: rect.size.width,
  height: rect.size.height,
})

const appendGradient = (
  snapshot: Gtk.Snapshot,
  path: Gsk.Path,
  entry: GradientEntry,
  opacity: number,
): void => {
  if (entry.stops.length === 0) {
    return
  }
  const rescaled =
    opacity >= 1
      ? entry.stops
      : entry.stops
          .map((stop) =>
            makeColorStop(stop.offset, scaledAlpha(stop.color, opacity)),
          )
          .filter((stop): stop is Gsk.ColorStop => stop !== null)
  // fillOpacity/strokeOpacity < 1 on a gradient re-builds each stop with a
  // scaled alpha (see makeColorStop's WORKAROUND note); if that rebuild
  // itself fails, fall back to the already-working full-opacity stops
  // rather than losing the gradient entirely over an opacity nuance.
  const stops = rescaled.length > 0 ? rescaled : entry.stops
  const [hasBounds, tightBounds] = path.getBounds()
  const bounds = hasBounds ? tightBounds : Graphene.Rect.zero()
  const box = asBoundingBox(bounds)
  const { descriptor } = entry

  if (descriptor.type === "linear") {
    const start = resolveGradientPoint(
      box,
      descriptor.x1,
      descriptor.y1,
      descriptor.units,
    )
    const end = resolveGradientPoint(
      box,
      descriptor.x2,
      descriptor.y2,
      descriptor.units,
    )
    snapshot.appendLinearGradient(
      bounds,
      new Graphene.Point(start),
      new Graphene.Point(end),
      stops,
    )
    return
  }

  const center = resolveGradientPoint(
    box,
    descriptor.cx,
    descriptor.cy,
    descriptor.units,
  )
  const { hradius, vradius } = resolveGradientRadius(
    box,
    descriptor.r,
    descriptor.units,
  )
  snapshot.appendRadialGradient(
    bounds,
    new Graphene.Point(center),
    hradius,
    vradius,
    0,
    1,
    stops,
  )
}

// --- drawing ---------------------------------------------------------------

const applyTransformOps = (
  snapshot: Gtk.Snapshot,
  ops: SvgTransformOp[],
): void => {
  for (const op of ops) {
    switch (op.type) {
      case "translate":
        snapshot.translate(new Graphene.Point({ x: op.x, y: op.y }))
        break
      case "scale":
        snapshot.scale(op.x, op.y)
        break
      case "rotate":
        snapshot.rotate(op.angleDeg)
        break
      case "matrix":
        snapshot.transform(
          Gsk.Transform.new().matrix2d(op.a, op.b, op.c, op.d, op.e, op.f),
        )
        break
    }
  }
}

const paintFill = (
  snapshot: Gtk.Snapshot,
  path: Gsk.Path,
  paint: SvgPaintSpec,
  opacity: number,
  fillRule: Gsk.FillRule,
  gradients: Map<string, GradientEntry>,
): void => {
  if (paint.kind === "color") {
    snapshot.appendFill(path, fillRule, scaledAlpha(paint.rgba, opacity))
    return
  }
  const gradient = gradients.get(paint.id)
  if (!gradient) {
    // url(#missing-id): SVG renders nothing for that paint, not an error.
    return
  }
  snapshot.pushFill(path, fillRule)
  appendGradient(snapshot, path, gradient, opacity)
  snapshot.pop()
}

const paintStroke = (
  snapshot: Gtk.Snapshot,
  path: Gsk.Path,
  shape: SvgShapeDescriptor,
  paint: SvgPaintSpec,
  opacity: number,
  gradients: Map<string, GradientEntry>,
): void => {
  const stroke = Gsk.Stroke.new(shape.strokeWidth)
  stroke.setLineCap(shape.strokeLinecap)
  stroke.setLineJoin(shape.strokeLinejoin)
  stroke.setMiterLimit(shape.strokeMiterlimit)
  if (shape.strokeDasharray && shape.strokeDasharray.length > 0) {
    stroke.setDash(shape.strokeDasharray)
    stroke.setDashOffset(shape.strokeDashoffset)
  }
  if (paint.kind === "color") {
    snapshot.appendStroke(path, stroke, scaledAlpha(paint.rgba, opacity))
    return
  }
  const gradient = gradients.get(paint.id)
  if (!gradient) {
    return
  }
  snapshot.pushStroke(path, stroke)
  appendGradient(snapshot, path, gradient, opacity)
  snapshot.pop()
}

const drawShape = (
  snapshot: Gtk.Snapshot,
  shape: SvgShapeDescriptor,
  gradients: Map<string, GradientEntry>,
): void => {
  const path = shape.path
  if (!path || path.isEmpty()) {
    return
  }
  const groupOpacity = clamp01(shape.opacity)
  const needsGroup = groupOpacity < 1
  if (needsGroup) {
    snapshot.pushOpacity(groupOpacity)
  }
  if (shape.fill) {
    paintFill(
      snapshot,
      path,
      shape.fill,
      clamp01(shape.fillOpacity),
      shape.fillRule,
      gradients,
    )
  }
  if (shape.stroke && shape.strokeWidth > 0) {
    paintStroke(
      snapshot,
      path,
      shape,
      shape.stroke,
      clamp01(shape.strokeOpacity),
      gradients,
    )
  }
  if (needsGroup) {
    snapshot.pop()
  }
}

const drawChildren = (
  snapshot: Gtk.Snapshot,
  parent: Gtk.Widget,
  gradients: Map<string, GradientEntry>,
): void => {
  let child = parent.getFirstChild()
  while (child) {
    drawNode(snapshot, child, gradients)
    child = child.getNextSibling()
  }
}

const drawNode = (
  snapshot: Gtk.Snapshot,
  widget: Gtk.Widget,
  gradients: Map<string, GradientEntry>,
): void => {
  const descriptor = nodeDescriptors.get(widget)
  if (!descriptor) {
    return
  }
  switch (descriptor.kind) {
    case "shape":
      drawShape(snapshot, descriptor, gradients)
      return
    case "g": {
      const opacity = clamp01(descriptor.opacity)
      const needsOpacity = opacity < 1
      snapshot.save()
      applyTransformOps(snapshot, descriptor.transformOps)
      if (needsOpacity) {
        snapshot.pushOpacity(opacity)
      }
      drawChildren(snapshot, widget, gradients)
      if (needsOpacity) {
        snapshot.pop()
      }
      snapshot.restore()
      return
    }
    // defs/gradient/stop are resources, not paint; a nested <Svg> is not a
    // supported composition (undocumented, no-op rather than a crash).
    case "defs":
    case "gradient":
    case "stop":
    case "svg":
      return
  }
}

// --- widget registration ---------------------------------------------------

let RnGtkxSvgNodeClass: (new () => Gtk.Widget) | null = null

const ensureRegistered = (): new () => Gtk.Widget => {
  if (RnGtkxSvgNodeClass) {
    return RnGtkxSvgNodeClass
  }

  // Box, not a bare Widget: the reconciler only auto-attaches JSX children
  // (generic set_parent/insert_after) for widget types that carry a
  // registered "children" behavior, resolved by walking the GType ancestry
  // chain (@gtkx/react's typeInfoFor/buildTypeInfo). Plain GtkWidget has no
  // such behavior — only concrete container types like Box do — which is
  // also why RnGtkxViewBox (view-box.ts) is a Box subclass, not a bare
  // Widget one. GtkBox's own default BoxLayout then measures/allocates
  // these children, but harmlessly: they report a natural size of 0x0 (no
  // style, no content) and their own snapshot() no-ops for anything that
  // is not the mounted <Svg> root (see below), so nothing is ever
  // double-painted through GTK's normal child-snapshot path.
  class RnGtkxSvgNode extends Gtk.Box {
    // Only ever invoked by GTK on the mounted <Svg> root (nothing calls
    // snapshotChild() on the inert descendant instances). Defensive no-op
    // otherwise, so a stray direct call never throws.
    snapshot(snapshot: Gtk.Snapshot): void {
      const descriptor = nodeDescriptors.get(this)
      if (!descriptor || descriptor.kind !== "svg") {
        return
      }
      const width = this.getWidth()
      const height = this.getHeight()
      if (width <= 0 || height <= 0) {
        return
      }
      const transform = resolveViewBoxTransform(
        descriptor.viewBox,
        width,
        height,
        descriptor.preserveAspectRatio,
      )
      const gradients = collectGradients(this)
      // RC2-WORKAROUND(graphene-rect-nested-boxed-props) — row in
      // docs/gtkx-rc2-notes.md. `new Graphene.Rect({ origin: new
      // Graphene.Point(...), size: new Graphene.Size(...) })` hits the same
      // native "Expected an Object for Boxed field write type, got Object"
      // as Gsk.ColorStop's `color` field (see makeColorStop below) — Rect
      // has a working escape hatch, `.alloc().init(x, y, w, h)`, that
      // ColorStop does not.
      //
      // SVG clips to the viewport by default (no overflow:visible opt-out
      // in this API — deliberate cut, see epic.md).
      snapshot.pushClip(Graphene.Rect.alloc().init(0, 0, width, height))
      snapshot.save()
      snapshot.translate(
        new Graphene.Point({
          x: transform.translateX,
          y: transform.translateY,
        }),
      )
      snapshot.scale(transform.scaleX, transform.scaleY)
      drawChildren(snapshot, this, gradients)
      snapshot.restore()
      snapshot.pop()
    }
  }
  // Explicit typeName: bundlers minify class names (same reasoning as
  // RnGtkxLayout/RnGtkxViewBox).
  registerClass(RnGtkxSvgNode, { typeName: "RnGtkxSvgNode" })
  RnGtkxSvgNodeClass = RnGtkxSvgNode
  return RnGtkxSvgNode
}

type SvgNodeComponent = ReturnType<typeof createElementComponent>

let component: SvgNodeComponent | null = null

export const getSvgNodeComponent = (): SvgNodeComponent => {
  if (component) {
    return component
  }
  ensureRegistered()
  component = createElementComponent("RnGtkxSvgNode")
  return component
}

/** Imperative invalidation channel for SVG: paint-only changes (including
 * Animated-driven ones) call this instead of queueAllocate/queueResize —
 * nothing here ever touches Yoga. */
export const queueSvgRedraw = (rootWidget: Gtk.Widget): void => {
  rootWidget.queueDraw()
}
