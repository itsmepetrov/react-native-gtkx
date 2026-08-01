// `useAnimatedProps`: the same trick as `useAnimatedStyle`, applied to props
// instead of to a style.
//
// The mapper returns ordinary values every frame. On the first run each
// NUMERIC leaf is replaced by an animated node and the mapping is remembered;
// later runs push new values into those nodes, so a running animation costs
// zero React renders. `createAnimatedComponent` spreads the result onto the
// wrapped component without resolving it, and the component subscribes.
//
// WHY THIS IS ALMOST FREE HERE, and what it is actually for. The SVG shapes
// already accept `number | AnimatedNode` on every numeric geometry and paint
// prop and drive their own invalidation from it — `src/components/svg/
// animated-support.ts` subscribes and rebuilds the path descriptor straight
// into `queueDraw`. So an animated `r`, `strokeWidth` or `strokeDashoffset`
// reaches GTK through a channel that has been there since the SVG epic, and
// this file only has to hand it a node instead of a number. That is the whole
// mechanism: `useAnimatedProps` is not a second write path, it is the first
// one addressed by prop name rather than by style key.
//
// A NON-numeric prop is not driveable, for the same reason a colour is not
// driveable in a style: nothing downstream subscribes to it, so it can only
// land on the next React render — which, since the point of this surface is
// that there ISN'T one, may be a long time. It says so once, by name, rather
// than being dropped silently.
import { createStyleNode, type StyleNode } from "./style"

export type PropsObject = Record<string, unknown>

// One warning per prop name per session, matching the style path's policy.
const warned = new Set<string>()

const warnUndriveableProp = (property: string): void => {
  if (warned.has(property)) {
    return
  }
  warned.add(property)
  const isProduction =
    typeof process !== "undefined" && process.env.NODE_ENV === "production"
  if (!isProduction) {
    console.warn(
      `react-native-reanimated: useAnimatedProps changed \`${property}\`, which is not a number, so nothing ` +
        "downstream subscribes to it — only numeric props are driven at frame rate here (the SVG geometry " +
        "and paint numbers). The new value is applied on the next React render instead. See docs/api.md.",
    )
  }
}

/** @internal Test seam: the warning is once per session by design. */
export const resetUndriveablePropWarnings = (): void => {
  warned.clear()
}

// Only top-level numbers. Not a simplification: a prop is driveable exactly
// when its receiver duck-types an animated node in that position, and the
// components that do (the SVG shapes) take `number | AnimatedNode` — never a
// nested object.
const numericKeysOf = (source: PropsObject): string[] =>
  Object.keys(source).filter((key) => typeof source[key] === "number")

export type AnimatedPropsObject = {
  /** Stable object spread onto the component; never replaced in place. */
  readonly props: PropsObject
  /** The nodes behind it, reusable when the props have to be rebuilt. */
  readonly nodes: ReadonlyMap<string, StyleNode>
  /**
   * Publishes a fresh updater result. Returns false when the SHAPE changed
   * (a prop became numeric, stopped being numeric, or appeared) and the
   * caller must rebuild — the nodes the component subscribed to no longer
   * describe these props.
   */
  apply(next: PropsObject): boolean
}

export const createAnimatedProps = (
  source: PropsObject,
  reuse?: ReadonlyMap<string, StyleNode>,
): AnimatedPropsObject => {
  const numeric = numericKeysOf(source)
  const signature = numeric.join("|")

  const nodes = new Map<string, StyleNode>()
  for (const key of numeric) {
    const existing = reuse?.get(key)
    if (existing) {
      existing.__push(source[key] as number)
      nodes.set(key, existing)
    } else {
      nodes.set(key, createStyleNode(source[key] as number))
    }
  }

  const props: PropsObject = { ...source }
  for (const [key, node] of nodes) {
    props[key] = node
  }

  // The last values seen for everything that is NOT node-backed, so a change
  // can be reported rather than silently dropped.
  let staticSnapshot = source

  return {
    props,
    nodes,
    apply(next) {
      if (numericKeysOf(next).join("|") !== signature) {
        return false
      }
      for (const [key, node] of nodes) {
        node.__push(next[key] as number)
      }
      for (const key of Object.keys(next)) {
        if (nodes.has(key)) {
          continue
        }
        if (!Object.is(next[key], staticSnapshot[key])) {
          warnUndriveableProp(key)
          // Kept up to date anyway: the next React render — whenever it
          // happens, for whatever reason — applies the current value rather
          // than the one from mount.
          props[key] = next[key]
        }
      }
      staticSnapshot = next
      return true
    },
  }
}
