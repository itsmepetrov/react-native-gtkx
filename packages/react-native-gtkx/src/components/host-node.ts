import { createContext, useContext, type RefObject } from "react"
import type { LayoutEngine, LayoutNode } from "../layout/index"
import type { Gtk } from "../gtkx/bridge/index"

// One per mounted container (Root or View): children register their layout
// nodes here and commit rects into the store read by the parent's
// RnGtkxLayout allocate().
export type HostNode = {
  engine: LayoutEngine
  node: LayoutNode
  widgetRef: RefObject<Gtk.Box | null>
}

export const HostNodeContext = createContext<HostNode | null>(null)

// Which widget content area the current subtree was handed to, when it was
// handed to one. Set by wrapReactNative for every element-valued prop it
// forwards AND for the widget's children (see ../common/widget), and read
// ONLY to build the error below — the boundary clears the layout root, so
// React Native content that lands inside a widget without bringing its own
// root has to be told where it is, and what to wrap it in.
export type SlotLocation = {
  /** The widget this content was handed to, e.g. "AdwBottomSheet". */
  widget: string
  /** The slot property, e.g. "sheet" — or null for an ordinary child. */
  slot: string | null
}

export const SlotContext = createContext<SlotLocation | null>(null)

const slotError = ({ widget, slot }: SlotLocation): string => {
  // The two shapes differ only in how you write the wrapper, so the message
  // shows the caller their own syntax rather than a generic one.
  const where = slot
    ? `${widget}'s \`${slot}\` slot`
    : `${widget}, as its child`
  const wrap = (root: string): string =>
    slot
      ? `  ${slot}={<${root}>…</${root}>}`
      : `  <${widget}>…</${widget}> → <${widget}><${root}>…</${root}></${widget}>`
  return (
    `react-native-gtkx: React Native content was put in ${where} without a layout root.\n` +
    `A GTK widget hands out a rectangle, and React Native needs a root to lay out inside it. Wrap the content:\n` +
    `${wrap("SlotContent")} — fill the area (a page body, a pane, a content area)\n` +
    `${wrap("IntrinsicContent")} — size the area to the content (a bar, a header slot, a row)\n` +
    // The subpath is named without quoting it as a specifier: the metro-preset
    // test scans src for bare imports with a regex, and an import-shaped
    // sentence in a string literal reads to it exactly like a real one.
    `Both are exported by react-native-gtkx/common. GTK widgets need neither — they are what a widget takes natively.`
  )
}

export const useHostNode = (): HostNode => {
  const host = useContext(HostNodeContext)
  // One extra context read per layout child. Deliberate: it is what turns the
  // single most confusing failure on this platform — content silently laid
  // out against the wrong rectangle — into a sentence naming where it landed.
  const slot = useContext(SlotContext)
  if (host === null) {
    throw new Error(
      slot
        ? slotError(slot)
        : "react-native-gtkx components must be rendered inside AppRegistry.runApplication() or a <Root>",
    )
  }
  return host
}
