import type { PlatformHost } from "./host"

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
  OS: "linux" as const,
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
