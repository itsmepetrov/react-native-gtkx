// Making a raw GTK widget a first-class citizen of React Native layout.
//
// The widgets this subpath re-exports are real GTK widgets, and GTK widgets
// know nothing about Yoga. Dropped into a <View> as-is they would never be
// measured or positioned, which would make "we export everything" a hollow
// promise. `Widget` closes that gap: it gives the widget a Yoga node, applies
// the layout half of a React Native style to it, and — this is the part that
// matters — measures the widget itself, so it lands at the size the GTK theme
// actually wants instead of collapsing to zero.
//
// The visual half of the style (background, border, radius) is applied as a
// GTK CSS class, the same mechanism View uses.
import { useContext, useRef, type ComponentType, type ReactNode } from "react"
import { HostNodeContext } from "../components/host-node"
import {
  useLayoutChild,
  type LayoutEvent,
} from "../components/use-layout-child"
import type { StyleProp } from "../contracts"
import { GtkBox, type Gtk } from "../gtkx/bridge/index"

export type WidgetProps = {
  /** React Native style. The layout half drives Yoga, the visual half becomes
   *  a GTK CSS class. Omit sizing and the widget's own natural size wins. */
  style?: StyleProp
  onLayout?: (event: LayoutEvent) => void
  /** The GTK widget(s) to lay out. Your own `ref` on them is untouched. */
  children: ReactNode
  testID?: string
}

/**
 * Put any GTK widget into React Native layout.
 *
 * ```tsx
 * <View style={{ flexDirection: "row", gap: 8, padding: 12 }}>
 *   <Widget style={{ flex: 1 }}>
 *     <GtkEntry placeholderText="Search" />
 *   </Widget>
 *   <Widget>
 *     <GtkButton iconName="edit-find-symbolic" />
 *   </Widget>
 * </View>
 * ```
 *
 * The entry flexes, the button takes its natural size, both sit in the row
 * exactly like React Native children — because to Yoga they now are.
 *
 * For the reverse direction (React Native content inside a GTK slot) see
 * `PageContent` and `IntrinsicContent`.
 */
export const Widget = ({ style, onLayout, children, testID }: WidgetProps) => {
  // The wrapper box IS the Yoga leaf, and it is measured through GTK, so the
  // widget inside reports its natural size up to Yoga. Wrapping rather than
  // cloning keeps the child's own ref and props untouched.
  const boxRef = useRef<Gtk.Box | null>(null)
  const { cssClass } = useLayoutChild(boxRef, {
    style,
    onLayout,
    // Without this a widget with no explicit size would measure as zero —
    // the whole reason a naked GtkButton in a View looks broken.
    measureFromWidget: true,
  })

  return (
    <GtkBox
      ref={boxRef}
      name={testID}
      cssClasses={cssClass ? [cssClass] : undefined}
    >
      {children}
    </GtkBox>
  )
}

export type UseWidgetLayoutOptions = {
  style?: StyleProp
  onLayout?: (event: LayoutEvent) => void
}

/**
 * The same thing as {@link Widget}, without the extra component — attach the
 * ref yourself when you already hold one.
 *
 * ```tsx
 * const ref = useRef<Gtk.Button | null>(null)
 * useWidgetLayout(ref, { style: { width: 40, height: 40 } })
 * return <GtkButton ref={ref} iconName="open-menu-symbolic" />
 * ```
 *
 * Returns the GTK CSS class produced by the visual half of the style, or
 * null — pass it to the widget's `cssClasses` if you want backgrounds and
 * borders from the style to apply.
 */
export const useWidgetLayout = (
  ref: { current: Gtk.Widget | null },
  options: UseWidgetLayoutOptions = {},
): string | null => {
  const { cssClass } = useLayoutChild(ref, {
    style: options.style,
    onLayout: options.onLayout,
    measureFromWidget: true,
  })
  return cssClass
}

export type ReactNativeLayoutProps = {
  /** React Native style. The layout half drives Yoga, the visual half becomes
   *  a GTK CSS class. Omit sizing and the widget's natural size wins. */
  style?: StyleProp
  onLayout?: (event: LayoutEvent) => void
}

/**
 * Give a GTK component React Native layout, keeping every prop it already
 * has.
 *
 * ```tsx
 * const Button = wrapReactNative(GtkButton)
 *
 * <View style={{ flexDirection: "row", gap: 8 }}>
 *   <Button style={{ flex: 1 }} label="Save" onClicked={save} />
 * </View>
 * ```
 *
 * The result is generic in the wrapped component's props, so `label`,
 * `onClicked` and everything else gtkx binds keep their types; `style` and
 * `onLayout` are added on top.
 *
 * **Outside React Native layout it steps aside.** The same widget is often
 * used in a pure GTK slot — a HeaderBar's `start`, a ToolbarView's `topBar` —
 * where there is no Yoga tree to join. The wrapper detects that and renders
 * the bare component, so one exported symbol works in both worlds.
 */
export const wrapReactNative = <P extends object>(
  Component: ComponentType<P>,
): ComponentType<P & ReactNativeLayoutProps> => {
  const InLayout = (props: P & ReactNativeLayoutProps) => {
    const { style, onLayout, ...rest } = props
    const boxRef = useRef<Gtk.Box | null>(null)
    const { cssClass } = useLayoutChild(boxRef, {
      style,
      onLayout,
      // Without this a widget with no explicit size measures as zero — the
      // whole reason a naked GtkButton in a View looks broken.
      measureFromWidget: true,
    })
    const inner = rest as P & { cssClasses?: string[] } & {
      hexpand?: boolean
      vexpand?: boolean
    }
    return (
      <GtkBox ref={boxRef}>
        <Component
          {...inner}
          // The style's visual half lands on the WIDGET, not on the wrapper,
          // so backgrounds and borders colour the button itself. This is the
          // point: on this platform React Native style drives GTK.
          cssClasses={
            cssClass
              ? [...(inner.cssClasses ?? []), cssClass]
              : inner.cssClasses
          }
          // Fill the rect Yoga computed, so `flex: 1` and explicit sizes mean
          // what they mean everywhere else in React Native. An explicit
          // hexpand/vexpand from the caller still wins.
          hexpand={inner.hexpand ?? true}
          vexpand={inner.vexpand ?? true}
        />
      </GtkBox>
    )
  }

  const Wrapped = (props: P & ReactNativeLayoutProps) => {
    // Read the context directly rather than through useHostNode, which throws
    // by design: here its absence is a supported case, not a mistake. The
    // same widget is often used in a pure GTK slot (a HeaderBar's `start`, a
    // ToolbarView's `topBar`) where there is no Yoga tree to join.
    const host = useContext(HostNodeContext)
    if (!host) {
      // style/onLayout are meaningless without a Yoga tree — drop them rather
      // than forward them onto a GObject that has no such properties.
      const rest = { ...props } as Partial<ReactNativeLayoutProps>
      delete rest.style
      delete rest.onLayout
      return <Component {...(rest as P)} />
    }
    return <InLayout {...props} />
  }

  const name =
    (Component as { displayName?: string; name?: string }).displayName ??
    (Component as { name?: string }).name ??
    "Widget"
  InLayout.displayName = `wrapReactNative(${name}).InLayout`
  Wrapped.displayName = `wrapReactNative(${name})`
  return Wrapped
}
