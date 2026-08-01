import type { PlatformHost } from "./host"

/**
 * RN's own `PlatformOSType`, plus `"linux"`.
 *
 * `OS` below is declared as this union rather than the literal `"linux"`,
 * and the reason is RN's contract rather than ours: the whole purpose of
 * `Platform.OS` is source shared across platforms, and every stock RN type
 * declares it wide enough for `Platform.OS === "android"` to COMPILE on
 * every target — it is a runtime question, not a type error. Narrowing it
 * to `"linux"` made an ordinary cross-platform line
 * (`paddingTop: Platform.OS === "android" ? 8 : 6`) fail to build on
 * exactly the platform that most needs shared source, which
 * `react-native-reanimated-dnd`'s example app hit eight times.
 *
 * The runtime value is unchanged and `Platform.OS === "linux"` still
 * narrows, so nothing that reads it loses anything.
 */
export type PlatformOSType =
  "android" | "ios" | "linux" | "macos" | "native" | "web" | "windows"

// Cross-platform code may pass ios/android/... keys too; they are ignored on
// linux, mirroring react-native's Platform.select fallback contract.
export type PlatformSelectSpec<T> = {
  linux?: T
  native?: T
  default?: T
} & Record<string, T | undefined>

const detectTesting = (): boolean =>
  process.env.NODE_ENV === "test" || process.env.VITEST !== undefined

export const createPlatform = (host: PlatformHost) => ({
  OS: "linux" as PlatformOSType,
  isTV: false as const,
  isTesting: detectTesting(),
  // GTK runtime version, e.g. "4.22.4". Lazy getter: GTK may not be
  // initialized yet when the module graph is imported.
  get Version(): string {
    return host.gtkVersion()
  },
  // Same key-presence semantics as react-native: an explicit `linux:
  // undefined` wins over `default` (checked with `in`, not truthiness).
  select<T>(spec: PlatformSelectSpec<T>): T | undefined {
    if ("linux" in spec) {
      return spec.linux
    }
    if ("native" in spec) {
      return spec.native
    }
    return spec.default
  },
})

export type PlatformModule = ReturnType<typeof createPlatform>
