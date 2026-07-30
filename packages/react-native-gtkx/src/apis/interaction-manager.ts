// react-native InteractionManager. Long-running work (list rendering, data
// crunching) scheduled through runAfterInteractions waits until no
// "interaction" is in progress — on this platform an interaction is a
// navigation transition (a stack push/pop slide). This keeps the animation
// frames clear of competing work; the navigators bracket their transitions
// with createInteractionHandle / clearInteractionHandle.
//
// Semantics mirror RN's: handles are reference-counted, tasks queue while
// any handle is open and flush once the count returns to zero, and
// runAfterInteractions returns a cancellable, then-able handle.

type Task = () => void

let handleCounter = 0
const openHandles = new Set<number>()
let pending: Array<{ id: number; run: Task }> = []
let taskCounter = 0

type InteractionListener = () => void
const startListeners = new Set<InteractionListener>()
const completeListeners = new Set<InteractionListener>()

const flushIfIdle = (): void => {
  if (openHandles.size > 0 || pending.length === 0) {
    return
  }
  const tasks = pending
  pending = []
  for (const task of tasks) {
    task.run()
  }
}

export type InteractionPromise = Promise<void> & {
  cancel: () => void
  done: (callback: Task) => void
}

export const InteractionManager = {
  // RN parity: a small pre-flush spacing so a burst of scheduling does not
  // starve the very frame the last interaction ended on. Kept minimal.
  runAfterInteractions(task?: Task): InteractionPromise {
    const id = (taskCounter += 1)
    let cancelled = false
    let settle: () => void = () => {}
    const promise = new Promise<void>((resolve) => {
      settle = resolve
    }) as InteractionPromise
    const run: Task = () => {
      if (cancelled) {
        return
      }
      task?.()
      settle()
    }
    pending.push({ id, run })
    promise.cancel = () => {
      cancelled = true
      pending = pending.filter((entry) => entry.id !== id)
    }
    promise.done = (callback: Task) => {
      void promise.then(callback)
    }
    // If nothing is in progress, flush on the next microtask (never
    // synchronously — RN callers rely on the async boundary).
    queueMicrotask(flushIfIdle)
    return promise
  },

  createInteractionHandle(): number {
    const handle = (handleCounter += 1)
    const wasIdle = openHandles.size === 0
    openHandles.add(handle)
    if (wasIdle) {
      for (const listener of startListeners) {
        listener()
      }
    }
    return handle
  },

  clearInteractionHandle(handle: number): void {
    if (!openHandles.delete(handle)) {
      return
    }
    if (openHandles.size === 0) {
      for (const listener of completeListeners) {
        listener()
      }
      // Defer the flush a microtask so a synchronous clear-then-create pair
      // (a pop immediately followed by a push) does not flush in between.
      queueMicrotask(flushIfIdle)
    }
  },

  addListener(
    event: "interactionStart" | "interactionComplete",
    listener: InteractionListener,
  ): { remove: () => void } {
    const set =
      event === "interactionStart" ? startListeners : completeListeners
    set.add(listener)
    return { remove: () => set.delete(listener) }
  },
}

// Test hook: reset the module state between cases.
export const resetInteractionManager = (): void => {
  handleCounter = 0
  taskCounter = 0
  openHandles.clear()
  pending = []
  startListeners.clear()
  completeListeners.clear()
}
