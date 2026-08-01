// The counters behind panel 2, and the honest machinery for showing them.
//
// The whole claim of this surface is that a running animation costs ZERO
// React renders, so the number that proves it must not be stored in React
// state — putting it there would make reading it cause the very renders it
// is counting. It lives in a plain module object instead: the animated
// components write to it, and a timer SNAPSHOTS it into state for the
// readout.
//
// That snapshot is not ceremony, and getting it wrong is the most interesting
// bug this example hit. `gtkx dev` and `gtkx build` run the React Compiler
// (@gtkx/cli ships it as a vite plugin), so a component that reads a mutable
// module object during render has that read memoised: `readCounter("loop")`
// takes no reactive input, so the compiler computes it once and reuses the
// JSX built from it forever. The readout re-rendered fourteen times and
// displayed the mount value every time. Snapshotting into state gives the
// JSX something that actually changes, which is what the compiler needs.
import { useEffect, useRef, useState } from "react"

export type CounterId = "drag" | "loop"

export type Counter = {
  /** React renders of the animated component itself. */
  renders: number
  /** Shared-value writes the mapper saw — one per animation frame. */
  writes: number
}

const counters: Record<CounterId, Counter> = {
  drag: { renders: 0, writes: 0 },
  loop: { renders: 0, writes: 0 },
}

/** Called from a mapper (`useAnimatedReaction`), which is not a render. */
export const countWrite = (id: CounterId): void => {
  counters[id].writes += 1
}

const publishRenders = (id: CounterId, renders: number): void => {
  counters[id].renders = renders
}

/** Panel 6's threshold crossings, kept out of state for the same reason. */
let crossings = 0

export const countCrossing = (): void => {
  crossings += 1
}

export type Snapshot = {
  loop: Counter
  drag: Counter
  crossings: number
  /** Frames a second, measured between two snapshots rather than per render. */
  perSecond: number
}

const EMPTY: Snapshot = {
  loop: { renders: 0, writes: 0 },
  drag: { renders: 0, writes: 0 },
  crossings: 0,
  perSecond: 0,
}

let sampledWrites = 0
let sampledAt = 0

const takeSnapshot = (): Snapshot => {
  const now = Date.now()
  const elapsed = now - sampledAt
  const perSecond =
    sampledAt === 0 || elapsed <= 0
      ? 0
      : Math.round(((counters.loop.writes - sampledWrites) * 1000) / elapsed)
  sampledWrites = counters.loop.writes
  sampledAt = now
  return {
    loop: { ...counters.loop },
    drag: { ...counters.drag },
    crossings,
    perSecond,
  }
}

/**
 * Copies the counters into state on a fixed interval. The copy is what a
 * readout renders; nothing being measured is on this clock, and the panels
 * say so on screen.
 */
export const useCounters = (intervalMs = 250): Snapshot => {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY)
  useEffect(() => {
    const timer = setInterval(() => setSnapshot(takeSnapshot()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return snapshot
}

/**
 * Counts renders of the calling component, in a ref rather than in state —
 * incrementing state here would be a render that counts itself forever.
 * The increment is in the render body on purpose: that is the event being
 * counted, and an effect would miss a render React bailed out of committing.
 *
 * Both hooks below read and write a ref during render, which `react-hooks/refs`
 * forbids and which is exactly what a render counter has to do. The rule is
 * turned off for this example in eslint.config.ts, with the same reasoning the
 * repo already applies to src/components (lazy ref init) and spike/.
 */
export const useRenderCount = (id: CounterId): number => {
  const renders = useRef(0)
  renders.current += 1
  publishRenders(id, renders.current)
  return renders.current
}

/** The readout's own render count — deliberately not one of the counters. */
export const useReadoutRenderCount = (): number => {
  const renders = useRef(0)
  renders.current += 1
  return renders.current
}
