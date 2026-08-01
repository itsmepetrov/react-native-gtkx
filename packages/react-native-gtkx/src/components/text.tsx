import {
  isValidElement,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react"
import { textAlignToLabelProps, textDecorationToAttrs } from "../style/index"
import type { MeasureFn, StyleProp } from "../contracts"
import {
  createTextProbe,
  Gtk,
  GtkLabel,
  measureWidget,
  Pango,
} from "../gtkx/bridge/index"
import { createMeasureHandle, type MeasureHandle } from "./measure"
import { useLayoutChild, type LayoutEvent } from "./use-layout-child"

/** RN's imperative geometry methods, on a `Text` ref. */
export type TextHandle = MeasureHandle

export type TextProps = {
  style?: StyleProp
  onLayout?: (event: LayoutEvent) => void
  numberOfLines?: number
  children?: ReactNode
  testID?: string
  // RN gives every host component the geometry methods, and `Text` is one —
  // measuring a label used to mean wrapping it in a View purely to have
  // something to hold. It is also what makes `Animated.Text` reachable: the
  // handle is the seam the imperative write path finds the widget through.
  ref?: Ref<TextHandle>
}

const flattenToString = (children: ReactNode): string => {
  if (
    children === null ||
    children === undefined ||
    typeof children === "boolean"
  ) {
    // RN renders neither `true` nor `false`; the old code only dropped
    // `false`, so `{condition && x}` was safe but `{Boolean(x)}` printed
    // "true".
    return ""
  }
  if (Array.isArray(children)) {
    return children.map(flattenToString).join("")
  }
  if (isValidElement(children)) {
    // A NESTED `<Text>` — `<Text>a <Text style={bold}>b</Text> c</Text>`,
    // which is how RN marks up a run inside a paragraph, and how every
    // `Text` with an interpolated span is written.
    //
    // This used to fall through to `String(children)` below and render
    // "[object Object]". docs/api.md has always said nested `Text` elements
    // are "concatenated without per-span styles" — the second half was true
    // and the first was not. Found by porting
    // `react-native-reanimated-dnd`'s example app, whose DroppedItemsMap
    // screen reads `<Text>{id} is dropped on <Text>{zone}</Text></Text>` and
    // rendered "[object Object] is dropped on [object Object]" on screen.
    //
    // Per-span styling is still not reproduced (one `GtkLabel`, one CSS
    // class), which is the documented difference; the TEXT is not optional.
    return flattenToString(
      (children.props as { children?: ReactNode }).children,
    )
  }
  return String(children)
}

const JUSTIFICATION = {
  left: Gtk.Justification.LEFT,
  right: Gtk.Justification.RIGHT,
  center: Gtk.Justification.CENTER,
  fill: Gtk.Justification.FILL,
} as const

// Text is a measured Yoga leaf: an offscreen probe label (with the same CSS
// class, so fonts match) feeds Pango metrics into the layout engine; the
// visible GtkLabel is positioned by the commit hook like any other widget.
export const Text = ({
  style,
  onLayout,
  numberOfLines,
  children,
  testID,
  ref,
}: TextProps) => {
  const widgetRef = useRef<Gtk.Label | null>(null)
  const text = flattenToString(children)

  // useState lazy init — see the note in use-layout-child.ts (React Compiler).
  const [probe] = useState<Gtk.Label>(() => createTextProbe())

  const lastProbeClass = useRef<string | null>(null)

  // GTK collapses wrap+ellipsize labels to a single line unless `lines` is
  // set explicitly — remember how many lines the probe wrapped into, the
  // layout callback pushes it onto the visible label.
  const measuredLines = useRef(1)

  const measure = useMemo<MeasureFn>(() => {
    return (width, widthMode) => {
      const { minimum, natural } = measureWidget(probe, "horizontal")
      // Floor at the probe's own minimum width, not at 1: gtk_widget_measure()
      // clamps a height-for-width query up to the widget's minimum before
      // computing regardless of what we pass (logging "Trying to measure
      // GtkLabel for width of N, but it needs at least M" while doing it), so
      // asking for anything below `minimum` was never honored — the height
      // below was already being computed at `minimum`, not at our `used`.
      // Clamping here ourselves gets the same height GTK would give us
      // anyway, keeps the returned width consistent with it, and drops the
      // warning as a side effect rather than the goal.
      const used =
        widthMode === "undefined"
          ? natural
          : Math.min(natural, Math.max(minimum, Math.floor(width)))
      const height = measureWidget(probe, "vertical", used).natural
      const singleLine = measureWidget(probe, "vertical", natural).natural
      measuredLines.current =
        singleLine > 0 ? Math.max(1, Math.round(height / singleLine)) : 1
      return { width: used, height }
    }
    // The probe is stable; re-measure is triggered via markDirty below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const layoutWithLines = useMemo(
    () => (event: LayoutEvent) => {
      const label = widgetRef.current
      if (label) {
        label.setLines(numberOfLines ?? measuredLines.current)
      }
      onLayout?.(event)
    },
    [numberOfLines, onLayout],
  )

  const { node, cssClass, flat } = useLayoutChild(widgetRef, {
    style,
    onLayout: layoutWithLines,
    measure,
  })

  useImperativeHandle(ref, () => createMeasureHandle(widgetRef, node), [node])

  // RN text clips to its box: an under-allocated GtkLabel would otherwise
  // paint its full text past the allocation (spike finding). Containers keep
  // overflow VISIBLE (paint-overflow); the text leaf clips.
  useLayoutEffect(() => {
    widgetRef.current?.setOverflow(Gtk.Overflow.HIDDEN)
  }, [])

  // Keep the probe in sync with everything that affects metrics, then
  // invalidate the Yoga leaf so the next pass re-measures.
  useLayoutEffect(() => {
    probe.setText(text)
    if (numberOfLines !== undefined) {
      probe.setLines(numberOfLines)
      probe.setEllipsize(Pango.EllipsizeMode.END)
    } else {
      probe.setLines(-1)
      probe.setEllipsize(Pango.EllipsizeMode.NONE)
    }
    if (lastProbeClass.current !== cssClass) {
      if (lastProbeClass.current) {
        probe.removeCssClass(lastProbeClass.current)
      }
      if (cssClass) {
        probe.addCssClass(cssClass)
      }
      lastProbeClass.current = cssClass
    }
    node.markDirty()
  }, [probe, node, text, numberOfLines, cssClass])

  const align = textAlignToLabelProps(flat.textAlign)

  // textDecorationLine goes through Pango, not CSS: GTK4 has no widget
  // `text-decoration`. Built here rather than in the style module so that
  // module stays bridge-free and unit-testable off Linux — the same split
  // textAlign already uses.
  //
  // The attribute list is applied to the PROBE as well, because it is what
  // Yoga measures: Pango reserves room for an underline below the baseline,
  // so a decorated label measured undecorated would be a pixel short.
  const decoration = textDecorationToAttrs(flat.textDecorationLine)
  const decorated = decoration.underline || decoration.strikethrough
  useLayoutEffect(() => {
    const attrs = decorated ? Pango.AttrList.new() : null
    if (attrs) {
      if (decoration.underline) {
        attrs.insert(Pango.attrUnderlineNew(Pango.Underline.SINGLE))
      }
      if (decoration.strikethrough) {
        attrs.insert(Pango.attrStrikethroughNew(true))
      }
    }
    widgetRef.current?.setAttributes(attrs)
    probe.setAttributes(attrs)
    node.markDirty()
  }, [probe, node, decorated, decoration.underline, decoration.strikethrough])

  return (
    <GtkLabel
      ref={widgetRef}
      name={testID}
      label={text}
      wrap
      xalign={align.xalign}
      yalign={0}
      justify={JUSTIFICATION[align.justification]}
      lines={numberOfLines}
      // RN semantics: the ellipsis is opt-in via numberOfLines. Plain text
      // wraps naturally; an unbreakable word wider than the rect just clips
      // (overflow HIDDEN above) — the layout manager allocates the rect
      // regardless of the label's own minimum, so nothing pushes siblings.
      ellipsize={
        numberOfLines !== undefined
          ? Pango.EllipsizeMode.END
          : Pango.EllipsizeMode.NONE
      }
      cssClasses={cssClass ? [cssClass] : []}
    />
  )
}
