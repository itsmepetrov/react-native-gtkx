// The wired `react-native-worklets` module — the one both presets alias the
// package name onto.
//
// surface.ts is unit-tested against a manual clock; what only this project can
// check is the wiring: that the module loads at all with GTK underneath it,
// that `scheduleOnUI` reaches the real GLib frame loop, and that the functions
// reached through this package name are the SAME ones the Reanimated surface
// exports. The last of those is the property a second `createThreads` would
// silently break — two queues behind two names still work, just a frame apart,
// which is where a gesture library's ordering assumptions stop holding.
import { expect, it } from "vitest"
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

it("scheduleOnUI runs a batch on a real GLib frame, in order", async () => {
  const seen: string[] = []
  scheduleOnUI(() => seen.push("first"))
  scheduleOnUI(() => seen.push("second"))
  expect(seen).toEqual([])
  await settle()
  expect(seen).toEqual(["first", "second"])
})

it("runOnUIAsync resolves with the value the worklet returned", async () => {
  await expect(runOnUIAsync((n: number) => n * 2, 21)).resolves.toBe(42)
})
