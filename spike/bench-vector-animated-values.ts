#!/usr/bin/env node
// Per-frame cost of an object-valued withTiming ({x, y}) against the
// existing single-number withTiming — the number docs/api.md's "Animated
// values" row carries alongside the platform's other measured costs.
// Run: /opt/homebrew/bin/node spike/bench-vector-animated-values.ts
//
// Self-contained per CLAUDE.md's rule for bare-node-executed scripts — with
// one wrinkle a plain scripts/*.ts file never has: this one benchmarks
// packages/react-native-gtkx/src, and that tree's OWN imports are
// deliberately extensionless (bundler resolution, CLAUDE.md's ground rules),
// which raw Node does not resolve on its own. Rather than add explicit
// extensions to library source for one benchmark script, this registers a
// loader hook — data: URL, so still no second file — that retries a failed
// relative resolution with ".ts" appended. The hook lives only in this
// process; nothing about the library's own import style changes.
import { register } from "node:module"

const loaderSource = `
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../")
    const hasExtension = /\\.[a-zA-Z0-9]+$/.test(specifier)
    if (isRelative && !hasExtension) {
      return nextResolve(specifier + ".ts", context)
    }
    throw error
  }
}
`
register(
  `data:text/javascript,${encodeURIComponent(loaderSource)}`,
  import.meta.url,
)

const { performance } = await import("node:perf_hooks")
const { createAnimated, Easing } =
  await import("../packages/react-native-gtkx/src/animated/index.ts")
const { withTiming } =
  await import("../packages/react-native-gtkx/src/reanimated-compat/animation.ts")
const { createMakeMutable } =
  await import("../packages/react-native-gtkx/src/reanimated-compat/mutable.ts")

type Entry = { cb: (timeMs: number) => void }

// A manual scheduler that never actually finishes the animation — the
// benchmark measures the cost of a STEADY-STATE frame, not the cost of
// starting or ending one, so the duration is set far beyond the number of
// frames driven.
const makeScheduler = () => {
  let now = 0
  let pending: Entry | null = null
  return {
    scheduler: {
      now: () => now,
      schedule(cb: (timeMs: number) => void) {
        pending = { cb }
        return () => {
          pending = null
        }
      },
    },
    tick(ms: number) {
      now += ms
      const entry = pending
      pending = null
      entry?.cb(now)
    },
  }
}

const iterations = 100_000
const rounds = 15

const benchNumber = (): number => {
  const { scheduler, tick } = makeScheduler()
  const makeMutable = createMakeMutable(createAnimated(scheduler), scheduler)
  const value = makeMutable(0)
  value.value = withTiming(1_000_000, {
    duration: (iterations + 10) * 16,
    easing: Easing.linear,
  })
  tick(0)
  const started = performance.now()
  for (let i = 0; i < iterations; i += 1) {
    tick(16)
  }
  return ((performance.now() - started) * 1000) / iterations
}

const benchObject = (): number => {
  const { scheduler, tick } = makeScheduler()
  const makeMutable = createMakeMutable(createAnimated(scheduler), scheduler)
  const value = makeMutable({ x: 0, y: 0 })
  value.value = withTiming(
    { x: 1_000_000, y: 2_000_000 },
    { duration: (iterations + 10) * 16, easing: Easing.linear },
  )
  tick(0)
  const started = performance.now()
  for (let i = 0; i < iterations; i += 1) {
    tick(16)
  }
  return ((performance.now() - started) * 1000) / iterations
}

const measure = (
  fn: () => number,
): { medianUs: number; minUs: number; maxUs: number } => {
  const samples: number[] = []
  for (let round = 0; round < rounds; round += 1) {
    samples.push(fn())
  }
  samples.sort((a, b) => a - b)
  return {
    medianUs: samples[Math.floor(rounds / 2)]!,
    minUs: samples[0]!,
    maxUs: samples.at(-1)!,
  }
}

const numberResult = measure(benchNumber)
const objectResult = measure(benchObject)

console.log(
  JSON.stringify(
    {
      iterations,
      rounds,
      numberFrameUs: numberResult,
      xyObjectFrameUs: objectResult,
      xyOverheadRatio: objectResult.medianUs / numberResult.medianUs,
    },
    null,
    2,
  ),
)
