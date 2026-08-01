// Focus, in the shape React Native already has for it.
//
// `docs/research/react-native-first-showcase.md` listed focus STATE as one
// of the three things no style closes: `outlineWidth` and friends made the
// ring drawable, but nothing told a `View` it was focused, so the ring could
// never be asked for. Nothing here is invented to fix that — RN has all of
// the surface already, on the platforms that have a focus model:
//
// - `focusable` is on RN's own `View` (Android, Windows);
// - `onFocus`/`onBlur` are on `View` in react-native-web and
//   react-native-windows (RN core has them on TextInput and the touchables);
// - react-native-web's `Pressable` state callback is
//   `{focused, hovered, pressed}` — this platform already added `hovered`
//   to that callback for the same reason, so `focused` is the same move.
//
// The second half of the finding — "RN has no focus-traversal model on the
// desktop at all" — needs no model of ours either. `gtk_widget_set_focusable`
// puts the widget into GTK's focus chain, and GTK's directional keynav then
// moves focus between focusable siblings with Tab and the arrow keys. That
// is precisely the behaviour `GtkListBox` was supplying to `AdwActionRow`s,
// obtained by making the boxes focusable rather than by reimplementing it.
import { useLayoutEffect, useRef, type RefObject } from "react"
import { Gtk } from "../gtkx/bridge/index"

/**
 * Reports GTK focus enter/leave as RN's `onFocus`/`onBlur`.
 *
 * Attached imperatively even though rc.3 has a declarative `controllers`
 * slot: one wiring per widget, handlers read from a ref, so changing
 * `onFocus`/`onBlur` never re-creates the controller mid-interaction — the
 * same reasoning as `Pressable`'s gestures.
 */
export const useFocusController = (
  widgetRef: RefObject<Gtk.Widget | null>,
  onFocus?: () => void,
  onBlur?: () => void,
): void => {
  // Written during render on purpose: the effect below runs once and must
  // see the latest handlers, and there is no commit between this render and
  // a focus signal that could deliver them any other way.
  const handlers = useRef({ onFocus, onBlur })
  handlers.current = { onFocus, onBlur }
  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    const focus = new Gtk.EventControllerFocus()
    focus.on("enter", () => handlers.current.onFocus?.())
    focus.on("leave", () => handlers.current.onBlur?.())
    widget.addController(focus)
    return () => {
      widget.removeController(focus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/**
 * RN's `focusable`: puts the widget into GTK's focus chain (or takes it
 * out), which is what makes Tab and the arrow keys reach it.
 */
export const useFocusable = (
  widgetRef: RefObject<Gtk.Widget | null>,
  focusable: boolean,
): void => {
  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    // `focusable`, NOT `can-focus`. The two read alike and are not: GTK4's
    // `can-focus` governs the whole SUBTREE (it defaults to true, and
    // clearing it would make every descendant unreachable too), while
    // `focusable` is about this widget alone — which is what RN's prop
    // means.
    widget.setFocusable(focusable)
  }, [widgetRef, focusable])
}

// GDK keyvals for the two keys that activate a focused control everywhere
// RN runs (gdk/gdkkeysyms.h). Spelled out rather than imported: gtkx binds
// no keysym table, and three constants do not justify one.
const KEY_RETURN = 0xff_0d
const KEY_KP_ENTER = 0xff_8d
const KEY_SPACE = 0x20

/**
 * Enter/Space on a focused widget, reported through `onActivate`.
 *
 * Without this `focusable` would be decorative: a control you can Tab to
 * and not operate is worse than one you cannot reach. Web and Android both
 * fire a press for these two keys, so a `Pressable` here does too.
 *
 * Returns `true` from the GTK handler when it acted, so the key does not
 * also travel on to a parent's own bindings.
 */
export const useActivateOnKey = (
  widgetRef: RefObject<Gtk.Widget | null>,
  onActivate?: () => void,
): void => {
  const handler = useRef(onActivate)
  handler.current = onActivate
  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    const keys = new Gtk.EventControllerKey()
    keys.on("key-pressed", (keyval: number) => {
      if (
        keyval !== KEY_RETURN &&
        keyval !== KEY_KP_ENTER &&
        keyval !== KEY_SPACE
      ) {
        return false
      }
      const activate = handler.current
      if (!activate) {
        return false
      }
      activate()
      return true
    })
    widget.addController(keys)
    return () => {
      widget.removeController(keys)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
