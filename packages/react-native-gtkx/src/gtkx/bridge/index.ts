// The ONLY module allowed to import @gtkx/* (enforced by eslint no-restricted-imports).
// gtkx is an RC dependency: when its API moves, this bridge absorbs the change.
//
// rc.1 caveats baked into this surface (see docs/research/yoga-gtk-spike.md):
// - 64-bit FFI values arrive as BigInt → normalize with toNumber() at this boundary

// import-then-export (not `export * as`): the latter is the one syntax the
// stock @react-native/babel-preset cannot transform — this form keeps
// consumer apps on their unmodified RN Babel config.
import * as Adw from "@gtkx/gi/adw"
import * as Gdk from "@gtkx/gi/gdk"
import * as Gio from "@gtkx/gi/gio"
import * as GLib from "@gtkx/gi/glib"
import * as Graphene from "@gtkx/gi/graphene"
import * as Gsk from "@gtkx/gi/gsk"
import * as Gtk from "@gtkx/gi/gtk"
import * as Pango from "@gtkx/gi/pango"

export { Adw, Gdk, Gio, GLib, Graphene, Gsk, Gtk, Pango }

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

export { createTextProbe, measureWidget, toNumber } from "./measure"
export { getViewBoxComponent, setBoxPassthrough } from "./view-box"
export {
  allocateChild,
  attachRnLayout,
  detachRnLayout,
  queueAllocate,
  queueResize,
  type RnLayoutHooks,
  type RnLayoutOrientation,
} from "./layout-manager"
export { colorScheme, styleManager } from "./theme"
