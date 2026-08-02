// The hooks. Each one is a mapper plus a React lifetime: built during
// render (so the first frame is already correct), subscribed in an effect,
// and — the part the spike deliberately left out — DISPOSED on unmount, so a
// shared value never keeps a dead component's mapper alive.
//
// `dependencies` is honoured but is not how dependencies are found. Upstream
// needs the array because its inputs come from the Babel plugin's `__closure`
// snapshot, which is absent without the plugin; here tracking is dynamic, so
// the array only controls when a mapper is REBUILT (its updater closure went
// stale), never what it listens to. An app that passes the array and an app
// that does not both work.
import { useEffect, useReducer, useRef, useState } from "react"
import { initialUpdaterRun } from "./animation"
import type { SharedValue } from "./mutable"
import { cancelAnimation } from "./mutable"
import {
  createAnimatedProps,
  type AnimatedPropsObject,
  type PropsObject,
} from "./props"
import {
  createAnimatedStyle,
  type AnimatedStyle,
  type StyleObject,
} from "./style"
import { createMapper, untracked } from "./tracking"

export type DependencyList = readonly unknown[]

type MakeMutable = <T>(initial: T) => SharedValue<T>

/**
 * When the Babel plugin IS in the app's build (an app that also targets iOS
 * or Android keeps it), the emitted worklet carries the values it captured.
 * Using them as the rebuild trigger costs nothing and makes an explicit
 * `dependencies` array unnecessary for those apps, exactly as upstream does.
 */
const closureDependencies = (updater: unknown): DependencyList => {
  const closure = (updater as { __closure?: Record<string, unknown> }).__closure
  return closure ? Object.values(closure) : []
}

const rebuildDependencies = (
  updater: unknown,
  dependencies: DependencyList | undefined,
): DependencyList => dependencies ?? closureDependencies(updater)

export const createHooks = (makeMutable: MakeMutable) => {
  /** A mutable value that survives renders and drives animations. */
  const useSharedValue = <T>(initialValue: T | (() => T)): SharedValue<T> => {
    const [shared] = useState(() =>
      makeMutable(
        typeof initialValue === "function"
          ? (initialValue as () => T)()
          : initialValue,
      ),
    )
    useEffect(
      () => () => {
        // Upstream cancels on unmount too: a running animation holds a frame
        // subscription, and nothing is left to observe it.
        cancelAnimation(shared)
      },
      [shared],
    )
    return shared
  }

  /** A read-only shared value recomputed whenever its inputs change. */
  const useDerivedValue = <T>(
    updater: () => T,
    dependencies?: DependencyList,
  ): SharedValue<T> => {
    const updaterRef = useRef(updater)
    updaterRef.current = updater
    const [derived] = useState(() =>
      makeMutable(initialUpdaterRun(() => untracked(updater))),
    )

    useEffect(() => {
      const mapper = createMapper(() => {
        derived.value = updaterRef.current()
      })
      mapper.run()
      return () => {
        mapper.dispose()
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [derived, ...rebuildDependencies(updater, dependencies)])

    return derived
  }

  /** Runs `react` whenever what `prepare` reads produces a new value. */
  const useAnimatedReaction = <T>(
    prepare: () => T,
    react: (current: T, previous: T | null) => void,
    dependencies?: DependencyList,
  ): void => {
    const prepareRef = useRef(prepare)
    prepareRef.current = prepare
    const reactRef = useRef(react)
    reactRef.current = react

    useEffect(() => {
      let previous: T | null = null
      const mapper = createMapper(() => {
        const current = prepareRef.current()
        // Outside tracking: only `prepare` decides what re-runs this mapper,
        // as upstream's __closure-derived inputs do.
        untracked(() => {
          reactRef.current(current, previous)
          previous = current
        })
      })
      mapper.run()
      return () => {
        mapper.dispose()
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...rebuildDependencies(prepare, dependencies)])
  }

  /**
   * A style whose animatable leaves are driven straight to GTK. The updater
   * re-runs on every write to a shared value it read; React does not.
   */
  const useAnimatedStyle = (
    updater: () => StyleObject,
    dependencies?: DependencyList,
  ): StyleObject => {
    const updaterRef = useRef(updater)
    updaterRef.current = updater
    const [rebuilds, requestRebuild] = useReducer(
      (count: number) => count + 1,
      0,
    )
    const animatedRef = useRef<AnimatedStyle | null>(null)
    // Carries the result that did not fit the current shape from the mapper
    // run that noticed into the render that rebuilds for it.
    const pendingRef = useRef<StyleObject | null>(null)

    if (animatedRef.current === null) {
      animatedRef.current = createAnimatedStyle(
        initialUpdaterRun(() => untracked(updater)),
      )
    } else if (pendingRef.current !== null) {
      // Reusing the nodes keeps the identity of every leaf that survived the
      // shape change, so the view layer rebinds only what actually moved.
      animatedRef.current = createAnimatedStyle(
        pendingRef.current,
        animatedRef.current.nodes,
      )
      pendingRef.current = null
    }

    useEffect(() => {
      const mapper = createMapper(() => {
        const next = updaterRef.current()
        const animated = animatedRef.current
        if (animated && !animated.apply(next)) {
          // The set of animatable leaves changed, so the nodes the view layer
          // bound no longer describe this style. This is the ONE case that
          // costs a React render, and it costs exactly one.
          pendingRef.current = next
          requestRebuild()
        }
      })
      mapper.run()
      return () => {
        mapper.dispose()
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rebuilds, ...rebuildDependencies(updater, dependencies)])

    return animatedRef.current.style
  }

  /**
   * Props whose numeric leaves are driven straight to the component that
   * takes them — the SVG shapes, which subscribe to an animated node on any
   * numeric geometry or paint prop. Same lifecycle as `useAnimatedStyle`,
   * down to the one render a shape change costs.
   */
  const useAnimatedProps = (
    updater: () => PropsObject,
    dependencies?: DependencyList,
  ): PropsObject => {
    const updaterRef = useRef(updater)
    updaterRef.current = updater
    const [rebuilds, requestRebuild] = useReducer(
      (count: number) => count + 1,
      0,
    )
    const animatedRef = useRef<AnimatedPropsObject | null>(null)
    const pendingRef = useRef<PropsObject | null>(null)

    if (animatedRef.current === null) {
      animatedRef.current = createAnimatedProps(
        initialUpdaterRun(() => untracked(updater)),
      )
    } else if (pendingRef.current !== null) {
      animatedRef.current = createAnimatedProps(
        pendingRef.current,
        animatedRef.current.nodes,
      )
      pendingRef.current = null
    }

    useEffect(() => {
      const mapper = createMapper(() => {
        const next = updaterRef.current()
        const animated = animatedRef.current
        if (animated && !animated.apply(next)) {
          pendingRef.current = next
          requestRebuild()
        }
      })
      mapper.run()
      return () => {
        mapper.dispose()
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rebuilds, ...rebuildDependencies(updater, dependencies)])

    return animatedRef.current.props
  }

  return {
    useSharedValue,
    useDerivedValue,
    useAnimatedReaction,
    useAnimatedStyle,
    useAnimatedProps,
  }
}
