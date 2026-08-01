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
  HeaderSlotContent,
  IntrinsicContent,
  SlotContent,
  WidgetContent,
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

export { Icon, type IconProps } from "./icon"

// REMOVED: `List`, `ListRow`, `ListSeparator`, `rowPosition`.
//
// They were Adwaita's boxed list re-implemented in React Native, and the
// argument for shipping them was that a screen shared with iOS and Android
// could not import `react-native-gtkx/adw`. That argument does not hold —
// **this subpath does not resolve on iOS or Android either.** Either import
// needs a `.linux.tsx` split or a `Platform` check, so `List` bought a
// consumer nothing over `AdwActionRow`, while costing a hand-maintained copy
// of libadwaita's metrics that drifts with every release of it. And
// `AdwActionRow` is better where it works: real keynav, focus and
// accessibility, with the metrics coming from the system theme instead of
// numbers baked into our source. They had exactly one consumer.
//
// Want a native list → `react-native-gtkx/adw`. Want that LOOK written in
// React Native → `examples/tasks-nav/src/components/list.tsx`, which is the
// same file, to copy.
//
// What stays public is the part of #47 that mattered: `boxShadow`,
// `outline*` and `textDecorationLine` in the style layer, which are what
// made an Adwaita-looking list expressible in `StyleSheet` at all.
//
// Reorder went with them, and separately: `onReorder`/`reorderId` was a
// second, id-keyed entry point into the same module `Draggable` and
// `Sortable` come from. One way to drag now — `react-native-gtkx/dnd`.
