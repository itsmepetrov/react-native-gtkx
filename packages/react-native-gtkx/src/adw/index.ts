// react-native-gtkx/adw — libadwaita widgets as React components.
//
// The Adwaita half of the platform layer; its GTK counterpart is
// react-native-gtkx/gtk, and what we wrote ourselves lives in
// react-native-gtkx/common (NavigationStack, SlotContent, wrapReactNative). Nothing here
// imports react-navigation.
//
// NAMING, one rule across both subpaths: a name carrying a `Gtk` or `Adw`
// prefix IS that widget, as gtkx binds it. A name without a prefix is ours.
//
// The layering mirrors the React Native ecosystem: react-native-screens
// exposes primitives, @react-navigation/native-stack binds them to a router.
// Here, this subpath exposes primitives and react-native-gtkx/navigation
// binds them to react-navigation. You can skip the binding entirely — drive
// NavigationStack from useState, from your own router, from anything.

// The raw widgets, exactly as gtkx binds them — every GObject property and
// signal, including ones added after this file was written.
//
// AdwNavigationView and AdwNavigationPage are the imperative originals:
// NavigationStack above is a declarative alternative, NOT a replacement, and
// a standard widget must never become unreachable because we wrapped it.
export {
  AdwApplicationWindow,
  AdwHeaderBar,
  AdwNavigationPage,
  AdwNavigationSplitView,
  AdwNavigationView,
  AdwToolbarView,
} from "../gtkx/bridge/index"

// Exported as a value: it carries both the enums you need at runtime and the
// types you need for refs — `useRef<Adw.NavigationView | null>(null)`.
export { Adw } from "../gtkx/bridge/index"
