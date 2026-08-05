// Scheduling semantics for the global requestAnimationFrame/
// cancelAnimationFrame pair (src/components/request-animation-frame.ts):
// next-frame batching, cancellation, timestamp monotonicity and exception
// isolation — the four RN/browser guarantees the platform global promises.
// Driven by the SAME manual scheduler Animated's own tests use
// (tests/unit/animated/manual-scheduler.ts), not the real GTK clock, so a
// "frame" here is one explicit advance() call.
import { expect, it, vi } from "vitest"
import {
  createRequestAnimationFrame,
  installGlobalRequestAnimationFrame,
} from "../../../src/components/request-animation-frame"
import { createManualScheduler } from "../animated/manual-scheduler"

it("returns a numeric handle and delivers the frame's own timestamp", () => {
  const manual = createManualScheduler()
  const { requestAnimationFrame } = createRequestAnimationFrame(
    manual.scheduler,
  )
  const seen: number[] = []
  const handle = requestAnimationFrame((time) => seen.push(time))

  expect(typeof handle).toBe("number")
  manual.advance(16)

  expect(seen).toEqual([manual.now()])
})

it("a callback requested during a running frame lands on the NEXT frame", () => {
  const manual = createManualScheduler()
  const { requestAnimationFrame } = createRequestAnimationFrame(
    manual.scheduler,
  )
  const order: string[] = []
  requestAnimationFrame(() => {
    order.push("first")
    // Every real rAF-driven loop re-books itself from inside its own
    // callback — this must not run in the batch currently flushing.
    requestAnimationFrame(() => order.push("second"))
  })

  manual.advance(16)
  expect(order).toEqual(["first"])

  manual.advance(16)
  expect(order).toEqual(["first", "second"])
})

it("cancelAnimationFrame prevents a pending callback from firing", () => {
  const manual = createManualScheduler()
  const { requestAnimationFrame, cancelAnimationFrame } =
    createRequestAnimationFrame(manual.scheduler)
  const callback = vi.fn()

  const handle = requestAnimationFrame(callback)
  cancelAnimationFrame(handle)
  manual.advance(16)

  expect(callback).not.toHaveBeenCalled()
})

it("cancelling an unknown, already-delivered, null or undefined handle is a silent no-op", () => {
  const manual = createManualScheduler()
  const { requestAnimationFrame, cancelAnimationFrame } =
    createRequestAnimationFrame(manual.scheduler)

  expect(() => cancelAnimationFrame(999)).not.toThrow()
  // RN's own declared signature accepts null/undefined too — the shape of
  // `cancelAnimationFrame(handleRef.current)` in a cleanup, where the ref
  // may never have been set.
  expect(() => cancelAnimationFrame(null)).not.toThrow()
  expect(() => cancelAnimationFrame(undefined)).not.toThrow()

  const handle = requestAnimationFrame(() => {})
  manual.advance(16)
  expect(() => cancelAnimationFrame(handle)).not.toThrow()
})

it("delivers a monotonically increasing timestamp, frame over frame", () => {
  const manual = createManualScheduler()
  const { requestAnimationFrame } = createRequestAnimationFrame(
    manual.scheduler,
  )
  const stamps: number[] = []
  const tick = (time: number): void => {
    stamps.push(time)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  manual.advance(16)
  manual.advance(16)
  manual.advance(16)

  expect(stamps).toHaveLength(3)
  expect(stamps[1]).toBeGreaterThan(stamps[0]!)
  expect(stamps[2]).toBeGreaterThan(stamps[1]!)
})

it("one callback throwing does not stop its siblings in the same batch", () => {
  const manual = createManualScheduler()
  const { requestAnimationFrame } = createRequestAnimationFrame(
    manual.scheduler,
  )
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  const order: string[] = []

  requestAnimationFrame(() => {
    order.push("throws")
    throw new Error("boom")
  })
  requestAnimationFrame(() => order.push("still runs"))

  manual.advance(16)

  expect(order).toEqual(["throws", "still runs"])
  expect(errorSpy).toHaveBeenCalledTimes(1)
  errorSpy.mockRestore()
})

it("every request made before the frame fires shares one scheduler booking", () => {
  const manual = createManualScheduler()
  const { requestAnimationFrame } = createRequestAnimationFrame(
    manual.scheduler,
  )

  requestAnimationFrame(() => {})
  requestAnimationFrame(() => {})
  requestAnimationFrame(() => {})

  expect(manual.activeCount()).toBe(1)
})

it("cancelling the only pending callback releases the scheduler booking", () => {
  const manual = createManualScheduler()
  const { requestAnimationFrame, cancelAnimationFrame } =
    createRequestAnimationFrame(manual.scheduler)

  const handle = requestAnimationFrame(() => {})
  expect(manual.activeCount()).toBe(1)

  cancelAnimationFrame(handle)
  expect(manual.activeCount()).toBe(0)
})

it("installGlobalRequestAnimationFrame installs both globals, idempotently", () => {
  const manual = createManualScheduler()

  installGlobalRequestAnimationFrame(manual.scheduler)
  const first = globalThis.requestAnimationFrame
  expect(typeof first).toBe("function")
  expect(typeof globalThis.cancelAnimationFrame).toBe("function")

  // A second install (e.g. the package entry re-evaluated) must not swap in
  // a fresh instance behind whatever the first one has already queued — a
  // second scheduler passed in here must be ignored, not adopted.
  installGlobalRequestAnimationFrame(createManualScheduler().scheduler)
  expect(globalThis.requestAnimationFrame).toBe(first)
})
