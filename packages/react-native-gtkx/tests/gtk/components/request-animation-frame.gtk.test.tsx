// The global requestAnimationFrame, proven to ride the platform's real frame
// clock rather than a same-tick shim: `withReanimatedTimer` takes over the
// exact driver src/components/frame-scheduler.ts's glibScheduler calls
// through (the one clock Animated and Reanimated already share — see that
// file's header for why nothing gets a second one), so a callback that only
// runs once `advanceAnimationByTime()` ticks it is a callback that was
// really scheduled on THIS platform's frame clock, not on a microtask or an
// effect flush of its own.
import { act, render, screen } from "@gtkx/testing"
import { useEffect, useState } from "react"
import { expect, it } from "vitest"
import { Root, Text } from "../../../src/index"
import {
  advanceAnimationByTime,
  withReanimatedTimer,
} from "../../../src/reanimated-compat/index"

const Probe = () => {
  const [label, setLabel] = useState("before")
  useEffect(() => {
    const handle = requestAnimationFrame(() => setLabel("after"))
    return () => cancelAnimationFrame(handle)
  }, [])
  return <Text>{label}</Text>
}

it("a requestAnimationFrame-driven update lands on the frame clock", async () => {
  await withReanimatedTimer(async () => {
    await render(
      <Root
        width={100}
        height={100}
      >
        <Probe />
      </Root>,
    )

    // Mounted under a test clock that has not ticked yet — if the callback
    // ran off mount itself, a microtask, or anything other than a real
    // frame, this would already read "after".
    expect(screen.getByText("before")).toBeTruthy()

    await act(async () => {
      advanceAnimationByTime()
    })
    expect(screen.getByText("after")).toBeTruthy()
  })
})
