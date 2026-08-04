// GENERATED FILE — do not edit by hand.
// Produced by scripts/generate-widget-surface.ts. Re-run it inside the VM
// after `npm run codegen` picks up a gtkx update; see
// scripts/widget-surface/classification.json for the full classification
// and .claude/epics/widget-surface/ for the rules behind it.
//
// Every Adwaita widget the classifier resolved to a Gtk.Widget subclass,
// re-exported RAW. Imported ONLY by src/adw/widgets.generated.ts — that
// subpath already requires Adw-1 unconditionally, so a static import here
// is fine; gtkx/bridge/adw.ts (the seam app-registry.tsx/host.gtkx.ts use)
// reaches @gtkx/jsx/adw through require() instead, never through this file,
// so it stays reachable even when Adw was never generated. See
// .claude/epics/adw-optional/001.md and docs/gtkx-rc4-notes.md for why
// @gtkx/jsx/adw cannot live in widgets.generated.ts alongside the GTK half.

export {
  AdwAboutDialog,
  AdwAboutWindow,
  AdwActionRow,
  AdwAlertDialog,
  AdwApplicationWindow,
  AdwAvatar,
  AdwBanner,
  AdwBin,
  AdwBottomSheet,
  AdwBreakpointBin,
  AdwButtonContent,
  AdwButtonRow,
  AdwCarousel,
  AdwCarouselIndicatorDots,
  AdwCarouselIndicatorLines,
  AdwClamp,
  AdwClampScrollable,
  AdwComboRow,
  AdwDialog,
  AdwEntryRow,
  AdwExpanderRow,
  AdwFlap,
  AdwHeaderBar,
  AdwInlineViewSwitcher,
  AdwLayoutSlot,
  AdwLeaflet,
  AdwMessageDialog,
  AdwMultiLayoutView,
  AdwNavigationPage,
  AdwNavigationSplitView,
  AdwNavigationView,
  AdwOverlaySplitView,
  AdwPasswordEntryRow,
  AdwPreferencesDialog,
  AdwPreferencesGroup,
  AdwPreferencesPage,
  AdwPreferencesRow,
  AdwPreferencesWindow,
  AdwShortcutLabel,
  AdwShortcutsDialog,
  AdwSidebar,
  AdwSpinRow,
  AdwSpinner,
  AdwSplitButton,
  AdwSqueezer,
  AdwStatusPage,
  AdwSwitchRow,
  AdwTabBar,
  AdwTabButton,
  AdwTabOverview,
  AdwTabView,
  AdwToastOverlay,
  AdwToggleGroup,
  AdwToolbarView,
  AdwViewStack,
  AdwViewSwitcher,
  AdwViewSwitcherBar,
  AdwViewSwitcherSidebar,
  AdwViewSwitcherTitle,
  AdwWindow,
  AdwWindowTitle,
  AdwWrapBox,
} from "@gtkx/jsx/adw"
