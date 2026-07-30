// react-native I18nManager. Reads are real: isRTL reflects the locale text
// direction GTK resolved for the process. The writers (allowRTL / forceRTL /
// swapLeftAndRightInRTL) are persisted preferences on mobile that apply from
// the NEXT app start — there is no equivalent desktop store, so they are
// accepted and ignored (documented in docs/api.md).
import type { I18nHost } from "./host"

export type I18nManagerConstants = {
  isRTL: boolean
  doLeftAndRightSwapInRTL: boolean
  localeIdentifier?: string
}

export const createI18nManager = (host: I18nHost) => ({
  get isRTL(): boolean {
    return host.isRTL()
  },
  doLeftAndRightSwapInRTL: true,
  getConstants: (): I18nManagerConstants => ({
    isRTL: host.isRTL(),
    doLeftAndRightSwapInRTL: true,
  }),
  allowRTL: (allow: boolean): void => {
    void allow
  },
  forceRTL: (force: boolean): void => {
    void force
  },
  swapLeftAndRightInRTL: (swap: boolean): void => {
    void swap
  },
})
