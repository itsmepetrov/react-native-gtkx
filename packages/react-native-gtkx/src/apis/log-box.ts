// RN's LogBox — the full-screen dev overlay that shows warnings and errors
// on top of a running app, and the API for telling it which ones to skip.
//
// ACCEPTED AND IGNORED, and the reason is not "there was nothing better to
// do": it is that `ignoreLogs` never affected the console on RN either. RN's
// LogBox installs a *view*; ignoring a pattern keeps the yellow box from
// appearing and leaves `console.warn` output exactly where it was. A GTK app
// has no such overlay — a warning goes to stderr and stays there — so the
// console output after `LogBox.ignoreLogs([...])` here is already the console
// output RN would have. There is no behaviour to suppress, and no behaviour
// silently lost.
//
// That distinction is what separates this from the stand-ins in
// src/unsupported-export.ts. Those refuse because accepting would make
// something that visibly does work stop working — a `PanGestureHandler` that
// renders children with no gestures. Here the call is a request to hide
// something this platform never showed.
//
// The measured caller: `react-native-draggable-flatlist` calls
// `LogBox.ignoreLogs([...])` during the first render of every
// `NestableDraggableFlatList`, to silence RN's "VirtualizedLists should never
// be nested inside plain ScrollViews" warning. That warning does not exist on
// this platform either, which is the same fact from the other side.
//
// Not implemented, and the reason to build an overlay if one is ever wanted:
// RN's LogBox is also a UI. `install()`/`uninstall()` are how RN's own
// AppContainer turns it on and off, so they are accepted for source parity;
// there is nothing to turn on yet.

/** RN's ignore pattern: a substring, or a regular expression. */
export type LogBoxIgnorePattern = string | RegExp

export const LogBox = {
  /**
   * Accepted and ignored — there is no overlay to keep these out of, and
   * this call never filtered the console on RN either.
   */
  ignoreLogs(patterns: readonly LogBoxIgnorePattern[]): void {
    void patterns
  },

  /** Accepted and ignored, for the same reason as {@link LogBox.ignoreLogs}. */
  ignoreAllLogs(ignore?: boolean): void {
    void ignore
  },

  /** Accepted and ignored: there is no LogBox to install. */
  install(): void {},

  /** Accepted and ignored: there is no LogBox to uninstall. */
  uninstall(): void {},
}
