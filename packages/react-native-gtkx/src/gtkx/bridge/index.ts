// The ONLY module allowed to import @gtkx/* (enforced by eslint no-restricted-imports).
// gtkx is an RC dependency: when its API moves, this bridge absorbs the change.
//
// Caveats baked into this surface (catalogued in docs/gtkx-rc2-notes.md):
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
  AdwApplicationWindow,
  AdwHeaderBar,
  AdwNavigationPage,
  AdwNavigationSplitView,
  AdwNavigationView,
  AdwToolbarView,
} from "@gtkx/jsx/adw"

export {
  GtkApplication,
  GtkApplicationWindow,
  GtkBox,
  GtkButton,
  GtkEntry,
  GtkGestureClick,
  GtkLabel,
  GtkListBox,
  GtkListBoxRow,
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
  type Root,
} from "@gtkx/react"

// useSignal comes from ./use-signal, not @gtkx/react — see the workaround note
// there (rc.2 delivers a stale handler).
export { useSignal } from "./use-signal"

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
