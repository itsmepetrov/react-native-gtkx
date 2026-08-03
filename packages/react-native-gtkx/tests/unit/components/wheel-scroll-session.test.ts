import { describe, expect, it } from "vitest"
import { createWheelScrollSession } from "../../../src/components/wheel-scroll-session"

type Timer = { callback: () => void; ms: number; cancelled: boolean }

const harness = () => {
  const events: string[] = []
  const timers: Timer[] = []
  const session = createWheelScrollSession(
    () => events.push("begin"),
    () => events.push("end"),
    (callback, ms) => {
      const timer = { callback, ms, cancelled: false }
      timers.push(timer)
      return timer as unknown as ReturnType<typeof setTimeout>
    },
    (timer) => {
      ;(timer as unknown as Timer).cancelled = true
    },
  )
  const fireLatest = (): void => {
    const timer = timers.at(-1)
    if (timer && !timer.cancelled) {
      timer.callback()
    }
  }
  return { session, events, timers, fireLatest }
}

describe("wheel scroll sessions", () => {
  it("begins before the first detent's scroll work and ends after idle", () => {
    const { session, events, timers, fireLatest } = harness()
    session.detent()
    events.push("scroll")

    expect(events).toEqual(["begin", "scroll"])
    expect(timers[0]?.ms).toBe(120)

    fireLatest()
    expect(events).toEqual(["begin", "scroll", "end"])
  })

  it("deduplicates a burst and extends its idle boundary", () => {
    const { session, events, timers, fireLatest } = harness()
    session.detent()
    session.detent()
    session.detent()

    expect(events).toEqual(["begin"])
    expect(timers).toHaveLength(3)
    expect(timers.slice(0, -1).every((timer) => timer.cancelled)).toBe(true)

    fireLatest()
    expect(events).toEqual(["begin", "end"])
  })

  it("starts a new session after the prior one ends", () => {
    const { session, events, fireLatest } = harness()
    session.detent()
    fireLatest()
    session.detent()
    fireLatest()
    expect(events).toEqual(["begin", "end", "begin", "end"])
  })

  it("cancels the pending end when its owner unmounts", () => {
    const { session, events, timers, fireLatest } = harness()
    session.detent()
    session.dispose()
    expect(timers[0]?.cancelled).toBe(true)
    fireLatest()
    expect(events).toEqual(["begin"])
  })

  // A touchpad glide can start while a wheel burst is still waiting out its
  // idle timer. The native sequence brackets itself, so the wheel session has
  // to close FIRST — a consumer that sees two `begin`s before an `end` has no
  // way to tell which one its captured state belongs to.
  it("ends immediately when another device takes over, and only once", () => {
    const { session, events, timers, fireLatest } = harness()
    session.detent()
    session.finish()

    expect(events).toEqual(["begin", "end"])
    expect(timers[0]?.cancelled).toBe(true)

    // The already-queued callback must not end the session a second time.
    timers[0]!.callback()
    expect(events).toEqual(["begin", "end"])

    // Idle: nothing to close, so nothing is reported.
    session.finish()
    expect(events).toEqual(["begin", "end"])

    // And the next burst is a fresh session.
    session.detent()
    fireLatest()
    expect(events).toEqual(["begin", "end", "begin", "end"])
  })

  it("does not end twice if a stale timer fires", () => {
    const { session, events, timers } = harness()
    session.detent()
    session.detent()
    timers[0]!.callback()
    timers[1]!.callback()
    expect(events).toEqual(["begin", "end"])
  })
})
