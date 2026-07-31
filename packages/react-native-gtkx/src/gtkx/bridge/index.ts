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
import * as GObject from "@gtkx/gi/gobject"
import * as Graphene from "@gtkx/gi/graphene"
import * as Gsk from "@gtkx/gi/gsk"
import * as Gtk from "@gtkx/gi/gtk"
import * as Pango from "@gtkx/gi/pango"

export { Adw, Gdk, Gio, GLib, GObject, Graphene, Gsk, Gtk, Pango }

// GtkApplication and GtkGestureClick are not Gtk.Widget subclasses (an
// application object and an event controller, respectively), so the widget
// surface generator never sees them — kept here by hand, same as before it
// existed.
export { GtkApplication, GtkGestureClick } from "@gtkx/jsx/gtk"

// Auxiliary gtkx JSX elements that are not Gtk.Widget/Adw.Widget subclasses
// either, same reason as the pair above — scripts/generate-widget-surface.mjs
// only classifies widgets, so these fall into its "notAWidget" bucket
// (see scripts/widget-surface/classification.json) and are otherwise
// unreachable through react-native-gtkx/gtk or /adw. Every one of these is a
// real, necessary building block for a real app: actions and menus (Gio),
// a responsive breakpoint (Adw), a text buffer and an adjustment (the model
// objects GtkTextView/GtkSpinRow etc. bind to), keyboard shortcuts, and the
// two drag-and-drop controllers.
export { GMenu, GSimpleAction } from "@gtkx/jsx/gio"
export {
  AdwBreakpoint,
  AdwShortcutsItem,
  AdwShortcutsSection,
} from "@gtkx/jsx/adw"
export {
  GtkAdjustment,
  GtkDragSource,
  GtkDropTarget,
  GtkShortcut,
  GtkShortcutController,
  GtkTextBuffer,
} from "@gtkx/jsx/gtk"

// The full widget surface — every GTK/Adwaita class gtkx binds that derives
// Gtk.Widget, raw. src/gtk/widgets.generated and src/adw/widgets.generated
// wrap most of them with wrapReactNative; this file is where @gtkx/jsx is
// still allowed to be imported directly (see the eslint carve-out for
// src/gtkx/bridge/**), so they pull the raw widgets from here rather than
// from @gtkx/jsx themselves.
export * from "./widgets.generated"

export {
  createPortal,
  createRoot,
  quit,
  rootElement,
  useApplication,
  useBindSetting,
  useParentWindow,
  useProperty,
  useSetting,
  type Root,
  type RootElement,
  type SettingsSchema,
  type SettingsSchemaKeys,
  type SettingValue,
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
