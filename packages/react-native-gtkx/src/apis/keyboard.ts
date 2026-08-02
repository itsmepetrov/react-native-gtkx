// react-native Keyboard — the SOFTWARE keyboard, not the hardware one.
//
// Every event it carries describes a panel sliding over the app and taking
// screen space away from it: `keyboardDidShow` reports the height of the
// rectangle the app just lost, and `keyboardWillChangeFrame` reports it
// moving. A desktop has no such panel — the keyboard is a device, it occludes
// nothing, and there is no rectangle to report. So the events cannot fire,
// and a subscription that is honoured and never called is the truthful
// answer rather than a shortcut.
//
// This is the same shape as BackHandler two files over ("desktop has no
// hardware back key, so no event fires today"), and it is what the two
// desktop-ish RN platforms do. react-native-windows ships RN core's own
// `Keyboard`, whose emitter is constructed over `NativeKeyboardObserver`
// only on iOS and Android — on Windows nothing ever emits into it, and the
// module is left in place so that `addListener`/`remove` still pair up.
// react-native-web is explicit about the same thing: its `Keyboard` is an
// object of no-ops with a comment saying there is no keyboard to observe.
//
// The measured caller: `@gorhom/bottom-sheet` subscribes in its own
// `useAnimatedKeyboard` and maps the event names through
// `Platform.select({ios: …, android: …, default: ''})` — so on this platform
// it subscribes to the empty string, which nothing could ever emit even if
// something did. Its keyboard state stays `UNDETERMINED`, which is what the
// sheet's own code paths already treat as "no keyboard involved".
//
// `dismiss()` is the one method with a decision in it — see below.
import type { SubscriptionHandle } from "../contracts"

/** RN's keyboard event names. None of them can fire on this platform. */
export type KeyboardEventName =
  | "keyboardWillShow"
  | "keyboardDidShow"
  | "keyboardWillHide"
  | "keyboardDidHide"
  | "keyboardWillChangeFrame"
  | "keyboardDidChangeFrame"

export type KeyboardEventEasing = "easeIn" | "easeInEaseOut" | "easeOut"

export type KeyboardEvent = {
  duration: number
  easing: KeyboardEventEasing
  endCoordinates: {
    width: number
    height: number
    screenX: number
    screenY: number
  }
  startCoordinates?: KeyboardEvent["endCoordinates"]
  isEventFromThisApp: boolean
}

const listeners = new Set<object>()

export const Keyboard = {
  /**
   * Honoured and never called. The subscription is real — `remove()` pairs
   * with it and is idempotent — because the code that adds a listener also
   * removes one on unmount, and a fake subscription object would turn a
   * cleanup into a crash. What cannot happen is the callback running: see
   * the note at the top of this file.
   */
  addListener(
    _eventName: KeyboardEventName | string,
    handler: (event: KeyboardEvent) => void,
  ): SubscriptionHandle {
    const entry = { handler }
    listeners.add(entry)
    return {
      remove: () => {
        listeners.delete(entry)
      },
    }
  },

  /** Drops every subscription for an event name. Nothing was going to fire. */
  removeAllListeners(eventName?: KeyboardEventName | string): void {
    void eventName
    listeners.clear()
  },

  /**
   * A no-op, and deliberately not RN's implementation.
   *
   * RN's `dismiss()` blurs the focused text input, and it does that as the
   * MEANS to an end: retracting the software keyboard is only possible by
   * taking focus away from what summoned it. On a desktop the end does not
   * exist and the means is a visible behaviour of its own — a caret
   * disappearing out of the entry the user was typing in. Libraries call
   * this on gestures (`@gorhom/bottom-sheet` does, from a pan, behind
   * `enableBlurKeyboardOnGesture`), so implementing it as a blur would make
   * dragging a sheet steal focus from a form on a platform where nothing
   * asked for that.
   *
   * An app that wants a widget to lose focus has GTK's own focus model for
   * it (`focusable`, `onFocus`/`onBlur` — see use-focus.ts).
   */
  dismiss(): void {},

  /**
   * RN's `isVisible()`: always false. There is no software keyboard, so it
   * is never visible — this is a fact about the platform rather than a
   * placeholder for state nobody wired up.
   */
  isVisible(): boolean {
    return false
  },

  /** The occluded rectangle, which is always empty here. */
  metrics(): undefined {
    return undefined
  },

  /**
   * iOS-only upstream, and a no-op there on every other platform too:
   * `scheduleLayoutAnimation` replays the keyboard's own show/hide easing
   * into a LayoutAnimation. There is no keyboard event to take an easing
   * from.
   */
  scheduleLayoutAnimation(event: KeyboardEvent): void {
    void event
  },
}
