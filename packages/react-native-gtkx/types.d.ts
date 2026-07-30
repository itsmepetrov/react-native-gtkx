// TypeScript extensions for the linux platform, applied to the STOCK
// react-native types via module augmentation. Reference this file once in
// the app — e.g. an env.d.ts containing:
//
//   import "react-native-gtkx/types"
//
// and `Platform.select({ linux: ... })` typechecks against the regular
// react-native types (interfaces merge; the closed inline parameter types
// of the stock overloads cannot be reopened, so the linux-aware signatures
// are added as overloads). Future platform-specific props on standard
// components (the react-native-windows pattern) belong here too.
//
// Known limitation: `Platform.OS === "linux"` cannot be taught to the
// stock types — property types do not merge. Use
// `Platform.select({ linux: ..., default: ... })` in typed code.

declare module "react-native" {
  interface PlatformStatic {
    select<T>(
      specifics: {
        linux?: T
        ios?: T
        android?: T
        macos?: T
        windows?: T
        web?: T
        native?: T
      } & { default: T },
    ): T
    select<T>(specifics: {
      linux: T
      ios?: T
      android?: T
      macos?: T
      windows?: T
      web?: T
      native?: T
      default?: T
    }): T | undefined
  }
}

export {}
