// The full GTK widget surface lives in a generated file: every Gtk.Widget
// subclass gtkx binds, wrapped so React Native drives it. See
// scripts/generate-widget-surface.mjs and
// scripts/widget-surface/classification.json for how the list is derived.
export * from "./widgets.generated"

// The GTK namespaces themselves, exported as values because they carry both
// the enums you need at runtime — `hscrollbarPolicy={Gtk.PolicyType.NEVER}` —
// and the types you need for refs.
export { Gdk, Gio, GObject, Gtk, Pango } from "../gtkx/bridge/index"

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
