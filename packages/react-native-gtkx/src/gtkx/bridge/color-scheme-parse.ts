// The pure, GTK-free half of color-scheme-portal.ts: parsing a
// org.freedesktop.portal.Settings reply/signal payload into "light" | "dark".
// Deliberately has NO @gtkx/gi imports (not even type-only ones — see
// VariantLike below) so it is importable from tests/unit (cross-platform,
// no GTK, no codegen store) — see
// tests/unit/gtkx/color-scheme-parse.test.ts and
// .claude/epics/adw-optional/004.md's note on why the real D-Bus round trip
// itself cannot be integration-tested in this repo's headless session.

export type ColorScheme = "light" | "dark"

// A structural (not nominal) slice of GLib.Variant — just enough of it to
// parse a Settings.Read reply or a SettingChanged payload, so this file can
// be unit-tested with a plain object instead of a real GLib.Variant.
export type VariantLike = {
  getTypeString(): string
  getVariant(): VariantLike
  getUint32(): number
  getString(): [string, number]
}

// org.freedesktop.portal.Settings.Read's "value" out-arg is declared as
// variant ("v"); a long-standing, widely reported implementation quirk
// (flatpak/xdg-desktop-portal#789) double-boxes it, so a real reply is
// Variant[Variant[uint32]] as often as it is Variant[uint32] depending on
// the backend (xdg-desktop-portal-gnome, -kde, ...) and version. Peeling
// while the type is still "v" handles both without having to guess which
// one a given portal implementation does.
export const unwrapVariant = (variant: VariantLike): VariantLike => {
  let current = variant
  // A defensive bound, not a real limit — no correct implementation nests
  // more than one extra layer; this only stops a corrupt/adversarial reply
  // from looping forever.
  for (
    let guard = 0;
    guard < 8 && current.getTypeString() === "v";
    guard += 1
  ) {
    current = current.getVariant()
  }
  return current
}

// The portal's own enum for org.freedesktop.appearance's color-scheme key:
// 0 = no preference, 1 = prefer dark, 2 = prefer light. The spec requires
// unknown values to be treated the same as 0 — mapped to "light" here,
// matching Gtk.Settings' own gtk-application-prefer-dark-theme default.
export const parseColorSchemeValue = (raw: number): ColorScheme =>
  raw === 1 ? "dark" : "light"

// reply is "(v)" — Settings.Read's single out-arg, boxed once more by the
// tuple every D-Bus method reply is wrapped in; the caller passes
// reply.getChildValue(0) (a real GLib.Variant call, not part of VariantLike
// — trivial enough it does not need its own seam), everything after that
// goes through the parser above.
export const parsePortalReadReply = (reply: VariantLike): ColorScheme =>
  parseColorSchemeValue(unwrapVariant(reply).getUint32())

// SettingChanged's payload is (namespace: s, key: s, value: v) — value goes
// through the same unwrap-then-read path as a Read reply. The caller passes
// just the value child (parameters.getChildValue(2)); namespace/key
// filtering happens in the caller with the real Variant's getString().
export const parseSettingChangedValue = (value: VariantLike): ColorScheme =>
  parseColorSchemeValue(unwrapVariant(value).getUint32())
