// The stand-in for an export a compat surface deliberately does not
// implement.
//
// WHY it throws rather than no-ops. docs/research/gestures.md records the
// failure mode this repo most wants to avoid: `Animated.View` silently
// accepting the responder props and ignoring them compiled, ran, and did
// nothing — "the worst possible failure mode". A `PanGestureHandler` that
// renders its children without gestures, or a `FadeIn` that mounts without
// fading, is the same trap. An unsupported import must fail where it is
// used, naming itself and naming the replacement.
//
// Shared by every mirrored package (react-native-gesture-handler,
// react-native-reanimated) because the trap is the same one each time and the
// introspection allowlist below is the part that is easy to get subtly wrong.

/**
 * Builds an `unsupported(name)` for one mirrored package.
 *
 * `explanation` is appended to every message and is where the surface says
 * what IS implemented and what to reach for instead — a refusal that does not
 * point somewhere is half an answer.
 */
export const createUnsupportedFactory = (
  packageName: string,
  explanation: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ((name: string) => any) => {
  // React, bundlers and `console.log` all introspect a value before using it.
  // Throwing on `$$typeof` or `toString` would replace a precise message with
  // a confusing one from inside React, so those reads answer normally; every
  // read that could only come from real use throws.
  const introspection = new Set([
    "$$typeof",
    "prototype",
    "name",
    "length",
    "displayName",
    "defaultProps",
    "propTypes",
    "contextTypes",
    "childContextTypes",
    "toString",
    "toJSON",
    "then",
    "_owner",
    "_store",
    "render",
    "constructor",
  ])

  /**
   * A FUNCTION wrapped in a Proxy, so the symbol throws however it is
   * reached: called as a hook or factory (`usePanGesture()`), rendered as a
   * component (React calls it), or read as a namespace (`Gesture.Pan()`,
   * `State.ACTIVE`).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (name: string): any => {
    const fail = (): never => {
      throw new Error(
        `${packageName}: \`${name}\` is not supported on Linux ` +
          `(react-native-gtkx). ${explanation}`,
      )
    }

    return new Proxy(fail, {
      get: (target, key, receiver) =>
        typeof key === "symbol" || introspection.has(key)
          ? Reflect.get(target, key, receiver)
          : fail(),
      apply: fail,
      construct: fail,
    })
  }
}
