import { afterEach, describe, expect, it, vi } from "vitest"
import {
  InteractionManager,
  resetInteractionManager,
} from "../../src/apis/interaction-manager"

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve))

describe("InteractionManager", () => {
  afterEach(() => {
    resetInteractionManager()
  })

  it("runs a task immediately when nothing is in progress", async () => {
    const task = vi.fn()
    InteractionManager.runAfterInteractions(task)
    await tick()
    expect(task).toHaveBeenCalledTimes(1)
  })

  it("defers a task until every handle is cleared", async () => {
    const handle = InteractionManager.createInteractionHandle()
    const task = vi.fn()
    InteractionManager.runAfterInteractions(task)
    await tick()
    expect(task).not.toHaveBeenCalled()
    InteractionManager.clearInteractionHandle(handle)
    await tick()
    expect(task).toHaveBeenCalledTimes(1)
  })

  it("waits for the LAST of several overlapping handles", async () => {
    const a = InteractionManager.createInteractionHandle()
    const b = InteractionManager.createInteractionHandle()
    const task = vi.fn()
    InteractionManager.runAfterInteractions(task)
    InteractionManager.clearInteractionHandle(a)
    await tick()
    expect(task).not.toHaveBeenCalled()
    InteractionManager.clearInteractionHandle(b)
    await tick()
    expect(task).toHaveBeenCalledTimes(1)
  })

  it("resolves the returned promise and supports cancel", async () => {
    const handle = InteractionManager.createInteractionHandle()
    const done = vi.fn()
    const cancelled = vi.fn()
    InteractionManager.runAfterInteractions().done(done)
    const promise = InteractionManager.runAfterInteractions(cancelled)
    promise.cancel()
    InteractionManager.clearInteractionHandle(handle)
    await tick()
    await tick()
    expect(done).toHaveBeenCalledTimes(1)
    expect(cancelled).not.toHaveBeenCalled()
  })

  it("fires interactionStart/Complete around the handle window", async () => {
    const start = vi.fn()
    const complete = vi.fn()
    InteractionManager.addListener("interactionStart", start)
    InteractionManager.addListener("interactionComplete", complete)
    const handle = InteractionManager.createInteractionHandle()
    expect(start).toHaveBeenCalledTimes(1)
    expect(complete).not.toHaveBeenCalled()
    InteractionManager.clearInteractionHandle(handle)
    expect(complete).toHaveBeenCalledTimes(1)
  })
})
