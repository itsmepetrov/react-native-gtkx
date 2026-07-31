// The full GTK widget surface lives in a generated file: every Gtk.Widget
// subclass gtkx binds, wrapped so React Native drives it. See
// scripts/generate-widget-surface.ts and
// scripts/widget-surface/classification.json for how the list is derived.
export * from "./widgets.generated"

// The GTK namespaces themselves, exported as values because they carry both
// the enums you need at runtime — `hscrollbarPolicy={Gtk.PolicyType.NEVER}` —
// and the types you need for refs.
export { Gdk, Gio, GLib, GObject, Gtk, Pango } from "../gtkx/bridge/index"

// Auxiliary JSX elements that are not Gtk.Widget subclasses, so the
// generated widget surface above never sees them — real building blocks a
// non-trivial app still needs: actions and menus (Gio, used through
// `Gtk.Application`/`Gtk.ApplicationWindow`), a text buffer and an
// adjustment (the model objects `GtkTextView`/`GtkSpinRow`-style widgets
// bind to), keyboard shortcuts, and the two drag-and-drop controllers. See
// docs/platform-layer.md "Unwrapped by necessity".
export {
  GMenu,
  GSimpleAction,
  GtkAdjustment,
  GtkDragSource,
  GtkDropTarget,
  GtkShortcut,
  GtkShortcutController,
  GtkTextBuffer,
} from "../gtkx/bridge/index"

// GSettings: reads and writes backed by a compiled `.gschema.xml` schema.
// `useSetting`/`useBindSetting` come straight from @gtkx/react; loading a
// `.gschema.xml` file into the `SettingsSchema` object they expect is a
// build-time concern (see docs/platform-layer.md).
export {
  useBindSetting,
  useSetting,
  type SettingsSchema,
  type SettingsSchemaKeys,
  type SettingValue,
} from "../gtkx/bridge/index"

// @gtkx/css — a real GTK CSS class from a tagged template, the same
// mechanism the style prop's visual half uses under the hood. Re-exported
// here rather than left to a direct @gtkx/css dependency for the same
// reason the namespaces above are: one subpath for the whole gtkx toolkit
// surface, not just Gtk.Widget subclasses.
export { css, cx, injectGlobal } from "../gtkx/bridge/index"

// The window and application AppRegistry itself sits on: useParentWindow
// reaches the Gtk.Window ancestor (for anything not modeled by a prop —
// e.g. binding a GSettings key to its own defaultWidth/defaultHeight),
// useApplication reaches the Adw.Application (e.g. to send a
// Gio.Notification), quit tears the whole app down programmatically (the
// same function AppRegistry wires to a window's own close button).
export { quit, useApplication, useParentWindow } from "../gtkx/bridge/index"
