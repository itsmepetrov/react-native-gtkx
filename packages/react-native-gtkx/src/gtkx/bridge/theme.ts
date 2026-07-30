import * as Adw from "@gtkx/gi/adw"

export type ColorScheme = "light" | "dark"

export const styleManager = (): Adw.StyleManager =>
  Adw.StyleManager.getDefault()

// The Appearance API subscribes to notify::dark on the style manager.
export const colorScheme = (): ColorScheme =>
  styleManager().getDark() ? "dark" : "light"
