// Thin typed wrapper around the shared RnGtkxSvgNode intrinsic (bridge/
// svg-node.ts) — every SVG element below <Svg> itself renders exactly this;
// they differ only in what they write into the node's WeakMap descriptor.
// JSX nesting is enough to build the GTK parent-child chain the bridge's
// snapshot() walks (the reconciler's generic ref/set_parent attachment, the
// same one View relies on for real Yoga children) — nothing here
// participates in Yoga, so the props are deliberately minimal: no layout,
// no name/cssClasses (unlike View, no <Path>/<G>/... needs a CSS identity).
import type { ReactNode, RefObject } from "react"
import { getSvgNodeComponent, type Gtk } from "../../gtkx/bridge/index"

type SvgNodeElementProps = {
  ref?: RefObject<Gtk.Widget | null> | null
  children?: ReactNode
}

type SvgNodeElementComponent = (props: SvgNodeElementProps) => ReactNode

export type SvgNodeElementRefProps = {
  widgetRef: RefObject<Gtk.Widget | null>
  children?: ReactNode
}

export const SvgNodeElement = ({
  widgetRef,
  children,
}: SvgNodeElementRefProps) => {
  const Node = getSvgNodeComponent() as unknown as SvgNodeElementComponent
  return <Node ref={widgetRef}>{children}</Node>
}
