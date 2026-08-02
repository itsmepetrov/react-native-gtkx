// The wired `react-native-worklets` module — the one both presets alias the
// package name onto.
//
// surface.ts is unit-tested on its own; what only this project can check is
// the wiring: that the module loads at all with GTK underneath it, that a UI
// hop really runs inside a live GLib main loop, and that the functions reached
// through this package name are the SAME ones the Reanimated surface exports.
// The last of those is the property a second `createThreads` would silently
// break — two queues behind two names still work, just a hop apart, which is
// where a gesture library's ordering assumptions stop holding.
import { expect, it } from "vitest"
import { glibScheduler } from "../../../src/components/frame-scheduler"
import {
  runOnJS as reanimatedRunOnJS,
  runOnUI as reanimatedRunOnUI,
  scheduleOnRN as reanimatedScheduleOnRN,
  scheduleOnUI as reanimatedScheduleOnUI,
} from "../../../src/reanimated-compat/index"
import {
  runOnJS,
  runOnUI,
  runOnUIAsync,
  scheduleOnRN,
  scheduleOnUI,
} from "../../../src/worklets-compat/index"

const settle = (ms = 80): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

it("is the same thread surface the Reanimated module exports", () => {
  expect(scheduleOnUI).toBe(reanimatedScheduleOnUI)
  expect(scheduleOnRN).toBe(reanimatedScheduleOnRN)
  expect(runOnUI).toBe(reanimatedRunOnUI)
  expect(runOnJS).toBe(reanimatedRunOnJS)
})

it("scheduleOnRN defers to a microtask and then runs", async () => {
  const seen: number[] = []
  scheduleOnRN((value: number) => seen.push(value), 7)
  expect(seen).toEqual([])
  await settle(0)
  expect(seen).toEqual([7])
})

it("scheduleOnUI runs a batch inside the real main loop, in order", async () => {
  const seen: string[] = []
  scheduleOnUI(() => seen.push("first"))
  scheduleOnUI(() => seen.push("second"))
  expect(seen).toEqual([])
  await settle()
  expect(seen).toEqual(["first", "second"])
})

it("a whole UI -> RN round trip lands before the next frame", async () => {
  // The regression this guards, on the real loop rather than a fake clock:
  // `scheduleOnUI(measure)` handing its answer back with `scheduleOnRN` used
  // to cost a whole frame, because the UI hop waited for one. A drop-zone
  // registry rebuilt through that round trip lost the race against the next
  // pointer event every time (docs/research/dnd-hover-flicker.md).
  //
  // Asserted as an ORDER against this platform's own frame driver rather than
  // as a duration, so a loaded machine slows both sides and the comparison
  // still means what it says.
  const order: string[] = []
  glibScheduler.schedule(() => order.push("frame"))
  scheduleOnUI(() => {
    scheduleOnRN(() => order.push("round-trip"))
  })
  await settle()
  expect(order).toEqual(["round-trip", "frame"])
})

it("runOnUIAsync resolves with the value the worklet returned", async () => {
  await expect(runOnUIAsync((n: number) => n * 2, 21)).resolves.toBe(42)
})
