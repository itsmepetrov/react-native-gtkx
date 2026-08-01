// Dependency tracking for mappers — the one part of Reanimated that does NOT
// collapse on a single-runtime platform. Something still has to re-run a
// mapper when a shared value it reads is written.
//
// Upstream solves it STATICALLY: its Babel plugin emits a `__closure` object
// listing everything the worklet captured, and `extractInputs` filters that
// candidate list down to the shared values. With one runtime we can do it
// DYNAMICALLY instead — record which shared values a mapper actually reads
// while it runs. That is strictly more precise (a value read only on one
// branch is tracked on the runs that take that branch, and dropped on the
// runs that do not) and it needs no build step, which matters because this
// platform never runs Babel: the vite path is rolldown, and the Metro path
// uses the app's own stock preset.
//
// The whole mechanism is one module-level variable. There is no runtime and
// no thread to schedule onto; a write is a synchronous function call that
// walks its subscribers.

/**
 * Something a mapper can depend on. Implemented by shared values; kept as an
 * interface so this module never imports the mutable, which imports back.
 */
export type Trackable = {
  __addMapper(mapper: Mapper): void
  __removeMapper(mapper: Mapper): void
}

export type Mapper = {
  /** Re-runs the body, re-collecting dependencies. */
  run(): void
  /** Detaches from every dependency. Idempotent. */
  dispose(): void
}

type MapperInternal = Mapper & {
  readonly dependencies: Set<Trackable>
}

// The mapper currently running, so a read of `.value` knows who to register.
let activeMapper: MapperInternal | null = null

/**
 * Called by a shared value's getter. Outside a mapper run this is a no-op,
 * which is what makes `sharedValue.value` in an event handler or a React
 * render subscribe to nothing.
 */
export const trackRead = (source: Trackable): void => {
  activeMapper?.dependencies.add(source)
}

/**
 * Runs `body` with tracking suspended, so reads inside it register nothing.
 *
 * `useAnimatedReaction` needs this: upstream derives a mapper's inputs from
 * the `prepare` worklet's closure ALONE, so a shared value that only the
 * `react` side reads must not become a trigger. Dynamic tracking would
 * otherwise be more eager than upstream rather than merely more precise.
 */
export const untracked = <T>(body: () => T): T => {
  const previousMapper = activeMapper
  activeMapper = null
  try {
    return body()
  } finally {
    activeMapper = previousMapper
  }
}

/**
 * Runs `body` under tracking and keeps it subscribed to exactly the shared
 * values that run read — no more (a value dropped between runs is
 * unsubscribed) and no less.
 *
 * Re-entrancy: a mapper that writes a value it also reads would recurse
 * forever. The guard below drops the nested re-run rather than throwing,
 * because the outer run is still in progress and is about to publish the
 * newer value anyway — the observable result is the same as the last write
 * winning, which is what a synchronous observer graph has to converge on.
 */
export const createMapper = (body: () => void): Mapper => {
  let disposed = false
  let running = false
  const dependencies = new Set<Trackable>()

  const mapper: MapperInternal = {
    dependencies,
    run() {
      if (disposed || running) {
        return
      }
      running = true
      const previousMapper = activeMapper
      const previousDependencies = new Set(dependencies)
      activeMapper = mapper
      dependencies.clear()
      try {
        body()
      } finally {
        activeMapper = previousMapper
        running = false
        // Diffed rather than resubscribed wholesale: a mapper that reads the
        // same values every frame must not churn its subscriptions 60 times
        // a second.
        for (const dependency of dependencies) {
          if (!previousDependencies.has(dependency)) {
            dependency.__addMapper(mapper)
          }
        }
        for (const dependency of previousDependencies) {
          if (!dependencies.has(dependency)) {
            dependency.__removeMapper(mapper)
          }
        }
      }
    },
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      for (const dependency of dependencies) {
        dependency.__removeMapper(mapper)
      }
      dependencies.clear()
    },
  }

  return mapper
}
