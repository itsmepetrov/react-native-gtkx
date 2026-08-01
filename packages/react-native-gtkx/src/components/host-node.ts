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

// Which widget slot the current subtree was handed to, when it was handed to
// one. Set by wrapReactNative for every slot prop it forwards (see
// ../common/widget), and read ONLY to build the error below — a slot clears
// the layout root, so React Native content that lands in one without bringing
// its own root has to be told which slot it was, and what to wrap it in.
export type SlotLocation = {
  /** The widget whose slot this is, e.g. "AdwBottomSheet". */
  widget: string
  /** The slot property, e.g. "content". */
  slot: string
}

export const SlotContext = createContext<SlotLocation | null>(null)

const slotError = ({ widget, slot }: SlotLocation): string =>
  `react-native-gtkx: React Native content was put in ${widget}'s \`${slot}\` slot without a layout root.\n` +
  `A GTK slot hands out a rectangle, and React Native needs a root to lay out inside it. Wrap the slot's content:\n` +
  `  ${slot}={<SlotContent>…</SlotContent>}       — fill the slot (a page body, a pane, a sheet)\n` +
  `  ${slot}={<IntrinsicContent>…</IntrinsicContent>} — size the slot to the content (a bar, a header slot, a row)\n` +
  // The subpath is named without quoting it as a specifier: the metro-preset
  // test scans src for bare imports with a regex, and an import-shaped
  // sentence in a string literal reads to it exactly like a real one.
  `Both are exported by react-native-gtkx/common. GTK widgets need neither — they are what a slot takes natively.`

export const useHostNode = (): HostNode => {
  const host = useContext(HostNodeContext)
  // One extra context read per layout child. Deliberate: it is what turns the
  // single most confusing failure on this platform — content silently laid
  // out against the wrong rectangle — into a sentence naming the slot.
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
