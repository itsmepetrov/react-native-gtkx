// Dev-mode guidance for silently ignored screen options: react-navigation's
// factory is untyped upstream, so neither TS nor the runtime would otherwise
// say a word when a ported app sets `presentation: "modal"` and nothing
// happens. Each unknown key warns ONCE per navigator kind with an honest
// verdict (see docs/research/navigation-extensibility.md).
const VERDICTS: Record<string, string> = {
  header: "full header replacement is not supported yet",
  headerTitle:
    "string titles map to `title`; a component title-widget is not " +
    "exposed yet",
  headerStyle: "Adwaita's theme owns the chrome styling on this platform",
  headerTintColor: "Adwaita's theme owns the chrome styling on this platform",
  headerTitleStyle: "Adwaita's theme owns the chrome styling on this platform",
  headerTransparent: "planned on AdwToolbarView's top-bar-style",
  headerShadowVisible: "planned on AdwToolbarView's top-bar-style",
  headerSearchBarOptions: "planned on Gtk.SearchBar",
  headerBackVisible: "planned on AdwNavigationPage's can-pop",
  headerBackTitle: "the GNOME back button is icon-only by HIG",
  headerBackButtonDisplayMode: "the GNOME back button is icon-only by HIG",
  headerBackButtonMenuEnabled:
    "the Adwaita back button already shows a history menu natively",
  headerLargeTitle: "no large-title idiom on this desktop",
  headerBlurEffect: "no blur idiom on this desktop",
  presentation: 'only "card" exists today; "modal" is planned on Adw.Dialog',
  animation: 'transitions are Adwaita\'s own; "none" is planned',
  animationDuration: "transitions are Adwaita's own",
  animationTypeForReplace: "transitions are Adwaita's own",
  gestureDirection: "the platform defines gesture directions",
  fullScreenGestureEnabled: "the platform defines gestures",
  statusBarStyle: "no status bar on desktop",
  statusBarHidden: "no status bar on desktop",
  statusBarAnimation: "no status bar on desktop",
  navigationBarColor: "no Android navigation bar on desktop",
  navigationBarHidden: "no Android navigation bar on desktop",
  orientation: "window orientation is the compositor's business",
  autoHideHomeIndicator: "no home indicator on desktop",
  // detachInactiveScreens/freezeOnBlur (native-stack v7) collapsed into
  // inactiveBehavior (v8, 'pause' | 'unmount' | 'none'). All three are
  // flagged the same way: our stack always keeps pushed pages mounted —
  // there is no unmount/freeze knob to offer.
  detachInactiveScreens: "screens below the stack top already stay mounted",
  freezeOnBlur: "screens below the stack top already stay mounted",
  inactiveBehavior:
    "screens below the stack top already stay mounted; there is no unmount/freeze knob",
  contentStyle: "style a wrapper View inside the screen instead",
}

const warned = new Set<string>()

export const warnIgnoredOptions = (
  navigator: string,
  options: Record<string, unknown>,
  supported: ReadonlySet<string>,
): void => {
  if (process.env.NODE_ENV === "production") {
    return
  }
  for (const key of Object.keys(options)) {
    if (supported.has(key)) {
      continue
    }
    const dedupe = `${navigator}:${key}`
    if (warned.has(dedupe)) {
      continue
    }
    warned.add(dedupe)
    const verdict = VERDICTS[key] ?? "not supported by this navigator"
    console.warn(
      `[react-native-gtkx/navigation] ${navigator} ignores the screen ` +
        `option "${key}" — ${verdict}.`,
    )
  }
}

// Test hook: warnings are once-per-process by design.
export const resetIgnoredOptionWarnings = (): void => {
  warned.clear()
}
