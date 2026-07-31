import { wrapReactNative } from "../common/widget"
import {
  GtkBox as RawGtkBox,
  GtkButton as RawGtkButton,
  GtkEntry as RawGtkEntry,
  GtkLabel as RawGtkLabel,
  GtkListBox as RawGtkListBox,
  GtkPicture as RawGtkPicture,
  GtkScrolledWindow as RawGtkScrolledWindow,
  GtkSpinner as RawGtkSpinner,
  GtkSwitch as RawGtkSwitch,
  GtkTextView as RawGtkTextView,
} from "../gtkx/bridge/index"

// react-native-gtkx/gtk — GTK4 widgets as React components, driven by React
// Native.
//
// The GTK half of the platform layer. Its Adwaita counterpart is
// react-native-gtkx/adw; what WE wrote lives in react-native-gtkx/common.
//
// This subpath is the TOOLKIT layer, and it is deliberately NOT portable:
// importing from here is a decision to write Linux-specific UI, and it shows
// up in your diff as such. Its Adwaita counterpart is react-native-gtkx/adw.
//
// NAMING, one rule across both subpaths: a name carrying a `Gtk` or `Adw`
// prefix IS that widget, as gtkx binds it. A name without a prefix is ours —
// Widget, wrapReactNative, SlotContent. So a wrapper of ours can never make a
// standard widget unreachable, and you always know which you are holding.

// Wrapped so React Native drives them: pass `style` and the layout half goes
// to Yoga while the visual half becomes a GTK CSS class on the widget itself.
// A button's position AND its colour come from the same style prop you would
// write on any React Native platform.
//
// Used inside a pure GTK slot (a HeaderBar's `start`, a ToolbarView's
// `topBar`) the wrapper steps aside and renders the bare widget, so one
// symbol works in both worlds.
export const GtkBox = wrapReactNative(RawGtkBox)
export const GtkButton = wrapReactNative(RawGtkButton)
export const GtkEntry = wrapReactNative(RawGtkEntry)
export const GtkLabel = wrapReactNative(RawGtkLabel)
export const GtkListBox = wrapReactNative(RawGtkListBox)
export const GtkPicture = wrapReactNative(RawGtkPicture)
export const GtkScrolledWindow = wrapReactNative(RawGtkScrolledWindow)
export const GtkSpinner = wrapReactNative(RawGtkSpinner)
export const GtkSwitch = wrapReactNative(RawGtkSwitch)
export const GtkTextView = wrapReactNative(RawGtkTextView)

// NOT wrapped, on purpose: a GtkListBoxRow is only valid as a direct child of
// a GtkListBox, a GtkGestureClick is an event controller rather than a
// widget, and a GtkWindow is a toplevel. A wrapper box around any of them
// would be invalid GTK, not a convenience.
export { GtkGestureClick, GtkListBoxRow, GtkWindow } from "../gtkx/bridge/index"

// The GTK namespaces themselves, exported as values because they carry both
// the enums you need at runtime — `hscrollbarPolicy={Gtk.PolicyType.NEVER}` —
// and the types you need for refs.
export { Gdk, Gio, Gtk, Pango } from "../gtkx/bridge/index"
