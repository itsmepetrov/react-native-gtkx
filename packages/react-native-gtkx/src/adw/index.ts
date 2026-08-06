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
import { requireAdwJsx } from "../gtkx/bridge/adw"

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
// and docs/api.md) — a bare re-export of an actual namespace import (see
// gtkx/bridge/adw-namespace.ts), so `Adw` keeps working exactly as it did
// before this epic: both a value (`Adw.Toast.new(title)`, `Adw.ColorScheme
// .FORCE_DARK`) and a namespace in type position (`Ref<Adw.ToastOverlay |
// null>`), in ONE import, from real apps (examples/tasks-app/tasks-nav's
// toast.tsx and window.tsx, examples/gallery's adwaita-stack.tsx) as well
// as ours. That duality does not survive being synthesized through a
// function call (tried: adw.ts's requireAdwGi() — the value comes through
// fine, but "Cannot find namespace 'Adw'" everywhere it was used as a
// type), which is why this is a re-export of a plain, eager, static import
// rather than routed through the lazy probe every other Adw value in this
// package goes through. Importing react-native-gtkx/adw without Adw-1
// throws at import time regardless — just as a build failure one line
// down (adw-namespace.ts's own `@gtkx/gi/adw` import, unresolvable without
// it) instead of a thrown Error, which is an equally loud refusal for a
// subpath that always requires Adw.
export { Adw } from "../gtkx/bridge/adw-namespace"

// Auxiliary JSX elements that are not Adw.Widget subclasses, so the
// generated widget surface above never sees them: a responsive breakpoint
// (the `breakpoints` prop of AdwApplicationWindow/AdwBreakpointBin/AdwDialog
// takes one of these as a child) and the two leaf elements a
// AdwShortcutsDialog's AdwShortcutsSection is built from. See
// docs/architecture/overview.md, "The widget surface: wrapped, raw, and
// auxiliary", and docs/architecture/layout-and-styling.md, "Two ways to
// react to size" — createSidebarNavigator's own collapse
// (src/navigation/sidebar.tsx) pairs AdwBreakpoint with AdwBreakpointBin
// (a real widget, wrapped above) to scope a breakpoint to a subtree.
const { AdwBreakpoint, AdwShortcutsItem, AdwShortcutsSection, AdwToggle } =
  requireAdwJsx("react-native-gtkx/adw")
export { AdwBreakpoint, AdwShortcutsItem, AdwShortcutsSection, AdwToggle }
