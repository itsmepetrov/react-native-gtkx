import { wrapReactNative } from "../common/widget"
// The full GTK widget surface lives in a generated file: every Gtk.Widget
// subclass gtkx binds, wrapped so React Native drives it. See
// scripts/generate-widget-surface.mjs and
// scripts/widget-surface/classification.json for how the list is derived.
export * from "./widgets.generated"

// The GTK namespaces themselves, exported as values because they carry both
// the enums you need at runtime — `hscrollbarPolicy={Gtk.PolicyType.NEVER}` —
// and the types you need for refs.
export { Gdk, Gio, Gtk, Pango } from "../gtkx/bridge/index"
