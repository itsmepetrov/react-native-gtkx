// A physical wheel reports isolated detents: no begin/end signals and no
// momentum. Consumers still need a user-driven SESSION around a burst — the
// same distinction browsers expose as wheel-start/wheel-end internally — so
// they can capture state before the first detent mutates it. Kept pure so the
// ordering, deduplication and teardown rules are unit-testable without GTK.

export type WheelScrollSession = {
  detent(): void
  /** End now before another input device starts its own native session. */
  finish(): void
  dispose(): void
}

export const createWheelScrollSession = (
  begin: () => void,
  end: () => void,
  delay: (
    callback: () => void,
    ms: number,
  ) => ReturnType<typeof setTimeout> = setTimeout,
  cancel: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout,
  idleMs = 120,
): WheelScrollSession => {
  let active = false
  let endTimer: ReturnType<typeof setTimeout> | null = null
  let generation = 0

  const cancelEnd = (): void => {
    if (endTimer !== null) {
      cancel(endTimer)
      endTimer = null
    }
  }

  const finish = (): void => {
    generation += 1
    cancelEnd()
    if (!active) {
      return
    }
    active = false
    end()
  }

  return {
    detent: () => {
      if (!active) {
        active = true
        begin()
      }
      cancelEnd()
      const ownGeneration = ++generation
      endTimer = delay(() => {
        // clearTimeout normally makes this impossible. The generation also
        // covers a callback already queued when a later detent re-arms the
        // session — ending that newer burst early would lose its context.
        if (!active || ownGeneration !== generation) {
          return
        }
        endTimer = null
        active = false
        end()
      }, idleMs)
    },
    finish,
    dispose: () => {
      generation += 1
      cancelEnd()
      active = false
    },
  }
}
