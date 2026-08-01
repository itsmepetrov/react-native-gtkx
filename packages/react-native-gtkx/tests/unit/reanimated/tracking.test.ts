// Dependency tracking is the one part of Reanimated that does not collapse on
// a single-runtime platform, and it is the part the spike left unfinished:
// mappers were never torn down and dependencies were never re-collected.
// Everything here is about those two.
import { expect, test } from "vitest"
import { createAnimated } from "../../../src/animated/index"
import { createMakeMutable } from "../../../src/reanimated-compat/mutable"
import {
  createMapper,
  untracked,
} from "../../../src/reanimated-compat/tracking"
import { createManualScheduler } from "../animated/manual-scheduler"

const makeMutable = createMakeMutable(
  createAnimated(createManualScheduler().scheduler),
)

test("a mapper re-runs when a value it read is written", () => {
  const value = makeMutable(1)
  const seen: number[] = []
  const mapper = createMapper(() => {
    seen.push(value.value)
  })
  mapper.run()

  value.value = 2
  value.value = 3

  expect(seen).toEqual([1, 2, 3])
})

test("a value the mapper never read does not trigger it", () => {
  const read = makeMutable(1)
  const ignored = makeMutable(1)
  let runs = 0
  const mapper = createMapper(() => {
    void read.value
    runs++
  })
  mapper.run()

  ignored.value = 99

  expect(runs).toBe(1)
})

test("dependencies are re-collected, so a value read only on one branch is dropped", () => {
  // The precision a static __closure scan cannot have: upstream lists every
  // captured value as a candidate, this tracks the reads that happened.
  const toggle = makeMutable(true)
  const whenTrue = makeMutable(0)
  const whenFalse = makeMutable(0)
  let runs = 0
  const mapper = createMapper(() => {
    runs++
    if (toggle.value) {
      void whenTrue.value
    } else {
      void whenFalse.value
    }
  })
  mapper.run()
  expect(runs).toBe(1)

  whenFalse.value = 1
  expect(runs).toBe(1)

  whenTrue.value = 1
  expect(runs).toBe(2)

  // Take the other branch; the old dependency must be released.
  toggle.value = false
  expect(runs).toBe(3)

  whenTrue.value = 2
  expect(runs).toBe(3)

  whenFalse.value = 2
  expect(runs).toBe(4)
})

test("dispose() detaches the mapper from every value it was reading", () => {
  const value = makeMutable(0)
  let runs = 0
  const mapper = createMapper(() => {
    void value.value
    runs++
  })
  mapper.run()
  expect(runs).toBe(1)

  mapper.dispose()
  value.value = 1
  expect(runs).toBe(1)

  // Idempotent, because React can call a cleanup more than once.
  expect(() => {
    mapper.dispose()
  }).not.toThrow()
})

test("disposing during a write stops that mapper without disturbing the others", () => {
  const value = makeMutable(0)
  const order: string[] = []
  const first = createMapper(() => {
    order.push(`first:${value.value}`)
  })
  const second = createMapper(() => {
    order.push(`second:${value.value}`)
  })
  first.run()
  second.run()
  order.length = 0

  first.dispose()
  value.value = 1

  expect(order).toEqual(["second:1"])
})

test("a mapper that writes what it reads converges instead of recursing", () => {
  const value = makeMutable(0)
  let runs = 0
  const mapper = createMapper(() => {
    runs++
    if (value.value < 5) {
      value.value = value.value + 1
    }
  })
  mapper.run()

  expect(value.value).toBe(1)
  expect(runs).toBe(1)
})

test("untracked() reads register nothing", () => {
  const tracked = makeMutable(0)
  const hidden = makeMutable(0)
  let runs = 0
  const mapper = createMapper(() => {
    runs++
    void tracked.value
    untracked(() => {
      void hidden.value
    })
  })
  mapper.run()

  hidden.value = 1
  expect(runs).toBe(1)

  tracked.value = 1
  expect(runs).toBe(2)
})

test("reading .value outside a mapper subscribes to nothing", () => {
  const value = makeMutable(0)
  expect(value.value).toBe(0)
  // No mapper was active, so nothing was registered and nothing leaks.
  expect(() => {
    value.value = 1
  }).not.toThrow()
})

test("a nested mapper run restores the outer mapper's tracking", () => {
  // A write from inside a mapper runs the other mapper synchronously, on the
  // same stack — there is no queue to defer it to. The reads on either side
  // of that re-entry must still belong to the OUTER mapper.
  const shared = makeMutable(7)
  const relayed = makeMutable(0)
  const afterInner = makeMutable(0)
  let outerRuns = 0
  let innerRuns = 0

  const inner = createMapper(() => {
    innerRuns++
    void relayed.value
  })
  inner.run()
  expect(innerRuns).toBe(1)

  const outer = createMapper(() => {
    outerRuns++
    // Re-enters `inner` synchronously, mid-run.
    relayed.value = shared.value
    // …and this read happens after the re-entry returned.
    void afterInner.value
  })
  outer.run()
  expect(outerRuns).toBe(1)
  expect(innerRuns).toBe(2)

  afterInner.value = 1
  expect(outerRuns).toBe(2)
  // `relayed` belongs to inner, not outer: the nested run must not have
  // stolen the outer mapper's subscription list.
  expect(innerRuns).toBe(2)

  outer.dispose()
  inner.dispose()
})
