// react-native-gtkx/common — the parts of the platform layer we wrote.
//
// The other two subpaths are widget bindings: react-native-gtkx/gtk and
// react-native-gtkx/adw re-export what gtkx generates, name for name. This
// one holds what has no upstream counterpart, which is why nothing here
// carries a `Gtk` or `Adw` prefix.
//
// Two jobs live here. Getting React Native content INTO a GTK slot
// (SlotContent, IntrinsicContent), and getting a GTK widget INTO React
// Native layout (Widget, wrapReactNative, useWidgetLayout). Plus
// NavigationStack, which is a declarative component over an imperative
// widget rather than a binding of one — a different contract from
// Adw.NavigationView, which is why it has its own name and lives apart.
//
// Nothing here imports react-navigation.

export {
  NavigationStack,
  NavigationStackPage,
  type NavigationStackPageProps,
  type NavigationStackProps,
} from "./navigation-stack"

export {
  IntrinsicContent,
  SlotContent,
  type IntrinsicContentProps,
  type SlotContentProps,
} from "./content"

export {
  useWidgetLayout,
  Widget,
  wrapReactNative,
  type ReactNativeLayoutProps,
  type UseWidgetLayoutOptions,
  type WidgetProps,
} from "./widget"
