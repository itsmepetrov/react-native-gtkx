// The bridge's default door — everything the RN core needs, zero @gtkx/gi/adw
// or @gtkx/jsx/adw imports (see .claude/epics/adw-optional/001.md). Kept as
// a thin alias of ./core rather than folding the two together so the split
// is visible at a glance, and every file already spelling
// "../gtkx/bridge/index" — the overwhelming majority of this package, i.e.
// everything except the handful of files that need Adw specifically — needs
// no change at all.
//
// Adw-specific values (Adw, AdwBreakpoint, AdwToggle, the raw Adwaita
// widgets, colorScheme/styleManager) live in ./adw instead, behind a probe
// (adwAvailable()) — its absence surfaces as the loud named throw this repo
// uses, not a build failure.
export * from "./core"
