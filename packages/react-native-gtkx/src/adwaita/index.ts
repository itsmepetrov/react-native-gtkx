// Unwrapped Adwaita widgets: full property and signal surface, exactly as
// gtkx binds it. Renamed only to drop the Adw prefix, since the subpath
// already says it. Nothing is filtered — if libadwaita has the property and
// gtkx binds it, you can set it.
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
import { wrapReactNative } from "./widget"

// react-native-gtkx/adwaita — GTK4/libadwaita widgets as React components.
//
// This subpath is the PLATFORM layer, and it is deliberately NOT portable:
// importing from here is a decision to write Linux-specific UI, and it shows
// up in your diff as such. Nothing in this file imports react-navigation.
//
// The layering mirrors the React Native ecosystem: react-native-screens
// exposes primitives, @react-navigation/native-stack binds them to a router.
// Here, this subpath exposes primitives and react-native-gtkx/navigation
// binds them to react-navigation. You can skip the binding entirely — drive
// AdwNavigationView from useState, from your own router, from anything.
//
// Prop pass-through is total by design: the widgets below are re-exported
// straight from the gtkx bindings, so every GObject property and signal gtkx
// generates is available, including ones added after this file was written.
// The two components we do wrap (AdwNavigationView, AdwNavigationPage) inherit
// their props from the widget and only ADD to them.

export {
  AdwNavigationPage,
  AdwNavigationView,
  type AdwNavigationPageProps,
  type AdwNavigationViewProps,
} from "./navigation-view"

export {
  IntrinsicContent,
  PageContent,
  type IntrinsicContentProps,
  type PageContentProps,
} from "./content"

// The other direction: a GTK widget joining React Native's flex layout.
// Without this, an exported widget dropped into a <View> would never be
// measured or positioned — see ./widget.
export {
  useWidgetLayout,
  Widget,
  wrapReactNative,
  type ReactNativeLayoutProps,
  type UseWidgetLayoutOptions,
  type WidgetProps,
} from "./widget"

export {
  AdwApplicationWindow,
  AdwHeaderBar,
  AdwNavigationSplitView,
  AdwToolbarView,
} from "../gtkx/bridge/index"

// The GTK widgets we bind, wrapped so React Native drives them: pass `style`
// and the layout half goes to Yoga while the visual half becomes a GTK CSS
// class on the widget itself. A button's position AND its colour come from
// the same style prop you would write on any React Native platform.
//
// Used inside a pure GTK slot (an AdwHeaderBar's `start`, an AdwToolbarView's
// `topBar`) the wrapper steps aside and renders the bare widget, so one
// symbol works in both worlds.
//
// They keep their Gtk prefix because they are a different family from
// Adwaita, and because that is the name you will find in the GTK docs.
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
// and the types you need for refs — `useRef<Adw.NavigationView | null>(null)`.
export { Adw, Gdk, Gio, Gtk, Pango } from "../gtkx/bridge/index"
