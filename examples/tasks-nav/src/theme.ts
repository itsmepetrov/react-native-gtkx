// Applies the color-scheme preference to Adw.StyleManager.
// react-native-gtkx has no portable concept of an OS-wide color scheme
// override beyond Appearance.setColorScheme (which drives PlatformColor,
// not Adw.StyleManager directly), so this reaches into react-native-gtkx/adw
// — the same thing examples/tasks-app does.
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
