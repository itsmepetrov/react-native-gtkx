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
import { requireAdwGi, requireAdwJsx } from "../gtkx/bridge/adw"

// The raw widgets, exactly as gtkx binds them — every GObject property and
// signal, including ones added after this file was written.
//
// AdwNavigationView and AdwNavigationPage are the imperative originals:
// NavigationStack above is a declarative alternative, NOT a replacement, and
// a standard widget must never become unreachable because we wrapped it.
// The full Adwaita widget surface lives in a generated file: every
// Adw.Widget subclass gtkx binds, wrapped so React Native drives it. The raw
// AdwNavigationView and AdwNavigationPage are in there too — NavigationStack
// in react-native-gtkx/common is a declarative alternative, never a
// replacement, and a standard widget must stay reachable.
export * from "./widgets.generated"

// This whole subpath REQUIRES Adw-1 (see .claude/epics/adw-optional/001.md
// and docs/api.md) — called eagerly, at module scope, so importing
// react-native-gtkx/adw without it throws the loud named error right away
// rather than at some later, harder-to-place call site.
//
// A VALUE only: it carries the enums you need at runtime
// (`Adw.BreakpointCondition.newLength(...)`). Unlike a plain
// `import * as Adw`, a value re-exported through requireAdwGi() cannot also
// merge in the namespace's dotted-member TYPE access (`Adw.NavigationView`
// as a type) — TypeScript has no re-export form that reliably preserves
// both facets across this hop (tried: a same-named type-only import next to
// the const, and two export specifiers under one name — both rejected as
// duplicate/conflicting identifiers). Code that needs `Adw.Foo` as a TYPE
// (e.g. `useRef<Adw.NavigationView | null>`) imports `type { Adw }` from
// "../gtkx/bridge/adw" directly instead — a single hop, which works (see
// common/navigation-stack.tsx).
export const Adw = requireAdwGi("react-native-gtkx/adw")

// Auxiliary JSX elements that are not Adw.Widget subclasses, so the
// generated widget surface above never sees them: a responsive breakpoint
// (the `breakpoints` prop of AdwApplicationWindow/AdwBreakpointBin/AdwDialog
// takes one of these as a child) and the two leaf elements a
// AdwShortcutsDialog's AdwShortcutsSection is built from. See
// docs/platform-layer.md "Unwrapped by necessity" and "Two ways to react
// to size" — createSidebarNavigator's own collapse
// (src/navigation/sidebar.tsx) pairs AdwBreakpoint with AdwBreakpointBin
// (a real widget, wrapped above) to scope a breakpoint to a subtree.
const { AdwBreakpoint, AdwShortcutsItem, AdwShortcutsSection, AdwToggle } =
  requireAdwJsx("react-native-gtkx/adw")
export { AdwBreakpoint, AdwShortcutsItem, AdwShortcutsSection, AdwToggle }
