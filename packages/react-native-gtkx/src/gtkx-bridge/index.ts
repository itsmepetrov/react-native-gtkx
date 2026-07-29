// The ONLY module allowed to import @gtkx/* (enforced by eslint no-restricted-imports).
// gtkx is an RC dependency: when its API moves, this bridge absorbs the change.
//
// rc.1 caveats baked into this surface (see spike/RESULTS.md):
// - 64-bit FFI values arrive as BigInt → normalize with toNumber() at this boundary

export * as Adw from "@gtkx/gi/adw"
export * as Gdk from "@gtkx/gi/gdk"
export * as Gio from "@gtkx/gi/gio"
export * as GLib from "@gtkx/gi/glib"
export * as Graphene from "@gtkx/gi/graphene"
export * as Gsk from "@gtkx/gi/gsk"
export * as Gtk from "@gtkx/gi/gtk"
export * as Pango from "@gtkx/gi/pango"

export {
  GtkApplication,
  GtkApplicationWindow,
  GtkBox,
  GtkEntry,
  GtkGestureClick,
  GtkLabel,
  GtkPicture,
  GtkScrolledWindow,
  GtkSpinner,
  GtkSwitch,
  GtkTextView,
  GtkWindow,
} from "@gtkx/jsx/gtk"

export {
  createPortal,
  createRoot,
  quit,
  useApplication,
  useParentWindow,
  useProperty,
  useSignal,
  type Root,
} from "@gtkx/react"

export { css, cx, injectGlobal } from "@gtkx/css"

export { createTextProbe, measureWidget, toNumber } from "./measure.js"
export {
  allocateChild,
  attachRnLayout,
  detachRnLayout,
  queueAllocate,
  queueResize,
  type RnLayoutHooks,
  type RnLayoutOrientation,
} from "./layout-manager.js"
export { colorScheme, styleManager } from "./theme.js"
