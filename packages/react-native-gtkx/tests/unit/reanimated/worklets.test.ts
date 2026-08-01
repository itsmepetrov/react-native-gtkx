// The `react-native-worklets` surface: what it schedules, what it answers and
// what it refuses.
//
// The refusal half is worth as much as the implemented half here. A worklet
// runtime is structural — it is a SECOND JS runtime, and this platform has one
// thread — so the boundary is not a to-do list; upstream's own non-native
// build throws for exactly these names, which is what makes the line
// defensible rather than arbitrary.
import { expect, test, vi } from "vitest"
import {
  createSerializable,
  createShareable,
  createSynchronizable,
  createWorkletRuntime,
  createWorkletsSurface,
  executeOnUIRuntimeSync,
  getDynamicFeatureFlag,
  getRuntimeKind,
  getStaticFeatureFlag,
  isBundleModeEnabled,
  isRNRuntime,
  isSerializableRef,
  isShareable,
  isSynchronizable,
  isUIRuntime,
  isWorkerRuntime,
  isWorkletFunction,
  isWorkletRuntime,
  makeShareableCloneRecursive,
  runOnRuntime,
  runOnUISync,
  RuntimeKind,
  UIRuntimeId,
  WorkletsModule,
} from "../../../src/worklets-compat/surface"
import { createManualScheduler } from "../animated/manual-scheduler"

const flushMicrotasks = (): Promise<void> => Promise.resolve()

test("scheduleOnRN defers to a microtask rather than running inline", async () => {
  const { scheduler } = createManualScheduler()
  const { scheduleOnRN } = createWorkletsSurface(scheduler)
  const seen: number[] = []

  scheduleOnRN((a: number, b: number) => seen.push(a + b), 1, 2)
  expect(seen).toEqual([])

  await flushMicrotasks()
  expect(seen).toEqual([3])
})

test("runOnJS returns a void-returning caller, as upstream", async () => {
  const { scheduler } = createManualScheduler()
  const { runOnJS } = createWorkletsSurface(scheduler)
  const target = vi.fn(() => "a return value nobody gets")

  expect(runOnJS(target)()).toBeUndefined()
  expect(target).not.toHaveBeenCalled()

  await flushMicrotasks()
  expect(target).toHaveBeenCalledTimes(1)
})

test("scheduleOnUI batches a tick's worth of jobs into one frame, in order", async () => {
  const manual = createManualScheduler()
  const { scheduleOnUI } = createWorkletsSurface(manual.scheduler)
  const seen: string[] = []

  scheduleOnUI(() => seen.push("first"))
  scheduleOnUI(() => seen.push("second"))
  await flushMicrotasks()
  expect(seen).toEqual([])

  manual.advance(16)
  expect(seen).toEqual(["first", "second"])
})

test("runOnUIAsync resolves with the worklet's return value on its frame", async () => {
  const manual = createManualScheduler()
  const { runOnUIAsync } = createWorkletsSurface(manual.scheduler)

  const settled = vi.fn()
  const promise = runOnUIAsync((n: number) => n * 2, 21).then(settled)

  await flushMicrotasks()
  expect(settled).not.toHaveBeenCalled()

  manual.advance(16)
  await promise
  expect(settled).toHaveBeenCalledWith(42)
})

test("`react-native-worklets` and `react-native-reanimated` share one queue", async () => {
  // The property that matters and would be invisible if broken: index.ts hands
  // both module surfaces the SAME createThreads instance, so two jobs queued
  // through the two package names land in one batch in one frame, in order.
  // Two instances would still work — just in two frames, which is where a
  // gesture library's ordering assumptions quietly stop holding.
  const manual = createManualScheduler()
  const surface = createWorkletsSurface(manual.scheduler)
  const seen: string[] = []

  surface.scheduleOnUI(() => seen.push("worklets"))
  surface.scheduleOnUI(() => seen.push("reanimated"))
  await flushMicrotasks()
  manual.advance(16)

  expect(seen).toEqual(["worklets", "reanimated"])
})

test("the serializer is identity, because nothing leaves this runtime", () => {
  const value = { nested: { deep: 1 } }
  expect(makeShareableCloneRecursive(value)).toBe(value)
  expect(createSerializable(value)).toBe(value)
  expect(isSerializableRef(value)).toBe(true)
})

test("the runtime-kind checks answer for the one runtime there is", () => {
  expect(getRuntimeKind()).toBe(RuntimeKind.ReactNative)
  expect(isRNRuntime()).toBe(true)
  expect(isUIRuntime()).toBe(false)
  expect(isWorkerRuntime()).toBe(false)
  expect(isWorkletRuntime()).toBe(false)
  expect(UIRuntimeId).toBe(RuntimeKind.UI)
})

test("the structural checks are upstream's, and nothing here is a worklet", () => {
  expect(isShareable({ __shareableRef: true })).toBe(true)
  expect(isShareable({})).toBe(false)
  expect(isSynchronizable({ __synchronizableRef: true })).toBe(true)
  expect(isSynchronizable(null)).toBe(false)

  // The Babel plugin never runs here, so `'worklet'` is an inert directive
  // and no function carries the hash upstream checks for.
  const worklet = (): void => {
    "worklet"
  }
  expect(isWorkletFunction(worklet)).toBe(false)
  expect(isWorkletFunction(Object.assign(() => {}, { __workletHash: 1 }))).toBe(
    true,
  )
})

test("the flags and debug toggles answer as upstream's non-native build does", () => {
  expect(getStaticFeatureFlag("anything")).toBe(false)
  expect(getDynamicFeatureFlag("anything")).toBe(false)
  expect(isBundleModeEnabled()).toBe(false)
})

test("a second runtime refuses by name, everywhere it can be reached", () => {
  for (const [name, symbol] of Object.entries({
    createWorkletRuntime,
    runOnRuntime,
    runOnUISync,
    executeOnUIRuntimeSync,
    createShareable,
    createSynchronizable,
  })) {
    expect(() => symbol()).toThrow(
      new RegExp(`react-native-worklets: \`${name}\``),
    )
  }
  // Reached as a namespace rather than called, which is how a TurboModule is
  // used — the Proxy has to fail on the property read too.
  expect(() => WorkletsModule.installValueUnpacker()).toThrow(/WorkletsModule/)
})
