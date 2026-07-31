// Shared "own invalidation channel" for SVG: geometry/paint numeric props
// accept a plain number OR an Animated node (Animated.Value /
// AnimatedInterpolation). Same duck-typed detection as components/
// animated.tsx's isAnimatedNode — kept as a separate small copy rather than
// a shared export because the two call sites want different subscription
// targets (rect-store + queueAllocate there, an SVG descriptor + queueDraw
// here) and duplicating a five-line predicate is cheaper than coupling them.
//
// Every tick mutates the resolved-value snapshot and calls `build` directly
// — no React re-render, no setState, matching the epic's answer to "how does
// Animated redraw a path": queueDraw, not queueAllocate.
import { useLayoutEffect, useRef } from "react"

export type AnimatedNodeLike = {
  addListener(callback: (state: { value: number }) => void): string
  removeListener(id: string): void
  __getValue(): number
}

export type AnimatableNumber = number | AnimatedNodeLike

export const isAnimatedNode = (value: unknown): value is AnimatedNodeLike =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as AnimatedNodeLike).addListener === "function" &&
  typeof (value as AnimatedNodeLike).__getValue === "function"

const resolve = (value: AnimatableNumber): number =>
  isAnimatedNode(value) ? value.__getValue() : value

/**
 * Resolves a set of possibly-animated numeric fields and calls `build` with
 * the fully-resolved snapshot: once synchronously (mount / whenever a
 * field's identity changes — a new plain number, a new Animated node, or a
 * switch between the two) and again on every tick of any field that is
 * currently animated. `build` itself is read from a ref on every call, so a
 * re-render between ticks always reaches the latest closure without forcing
 * a re-subscribe.
 */
// `extraDeps` covers everything `build` closes over that is NOT one of the
// animatable `fields` — d/points strings, transform strings, fill/stroke and
// the rest of the static paint props. Without them here, a change to (say)
// `fill` alone would not re-run `build` until some unrelated field changed.
export const useAnimatedShapeBuild = (
  fields: Record<string, AnimatableNumber>,
  build: (resolved: Record<string, number>) => void,
  extraDeps: readonly unknown[] = [],
): void => {
  const buildRef = useRef(build)
  buildRef.current = build

  const keys = Object.keys(fields)
  const values = [...keys.map((key) => fields[key]), ...extraDeps]

  useLayoutEffect(() => {
    const resolved: Record<string, number> = {}
    for (const key of keys) {
      resolved[key] = resolve(fields[key]!)
    }
    const run = (): void => buildRef.current(resolved)
    run()

    const subscriptions: { node: AnimatedNodeLike; id: string }[] = []
    for (const key of keys) {
      const source = fields[key]!
      if (isAnimatedNode(source)) {
        const id = source.addListener(({ value }) => {
          resolved[key] = value
          run()
        })
        subscriptions.push({ node: source, id })
      }
    }
    return () => {
      for (const { node, id } of subscriptions) {
        node.removeListener(id)
      }
    }
    // `values` is the real dependency list (flattened field values/node
    // identities); `keys`/`fields`/`build` are read through refs/closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, values)
}
