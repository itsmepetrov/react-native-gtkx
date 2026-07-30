// react-native BackHandler. Desktop has no hardware back key, so no event
// fires today — subscriptions are honored and dispatchBackPress exists as
// the single entry point for a future key binding (RN semantics: handlers
// run last-registered-first, the first returning true consumes the press,
// an unconsumed press exits the app — the Android default).
import type { SubscriptionHandle } from "../contracts"
import type { BackHandlerHost } from "./host"

export type BackPressEventName = "hardwareBackPress"
export type BackPressHandler = () => boolean | null | undefined

export const createBackHandler = (host: BackHandlerHost) => {
  const handlers: BackPressHandler[] = []

  const remove = (handler: BackPressHandler): void => {
    const index = handlers.indexOf(handler)
    if (index !== -1) {
      handlers.splice(index, 1)
    }
  }

  return {
    addEventListener(
      _event: BackPressEventName,
      handler: BackPressHandler,
    ): SubscriptionHandle {
      handlers.push(handler)
      return { remove: () => remove(handler) }
    },

    exitApp(): void {
      host.exitApp()
    },

    // Not part of the RN surface: drives the handler chain exactly like a
    // hardware back press would. Returns true when a handler consumed it.
    dispatchBackPress(): boolean {
      for (let index = handlers.length - 1; index >= 0; index -= 1) {
        if (handlers[index]?.() === true) {
          return true
        }
      }
      host.exitApp()
      return false
    },
  }
}
