// Applies the color-scheme setting to Adw.StyleManager — ported from the
// gtkx tutorial (examples/tutorial/src/theme.ts). react-native-gtkx has no
// portable concept of an OS-wide color scheme override beyond
// Appearance.setColorScheme (which drives PlatformColor, not
// Adw.StyleManager directly), so this reaches into react-native-gtkx/adw.
import { Adw } from "react-native-gtkx/adw"

export const applyColorScheme = (value: string): void => {
  const manager = Adw.StyleManager.getDefault()
  const scheme =
    value === "light"
      ? Adw.ColorScheme.FORCE_LIGHT
      : value === "dark"
        ? Adw.ColorScheme.FORCE_DARK
        : Adw.ColorScheme.DEFAULT
  manager.setColorScheme(scheme)
}
