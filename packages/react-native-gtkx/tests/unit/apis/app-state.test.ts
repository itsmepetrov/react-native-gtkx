import { describe, expect, it, vi } from "vitest"
import { createAppState } from "../../../src/apis/app-state"
import { createAppStateMockHost } from "./mock-host"

describe("AppState", () => {
  it("computes currentState from the host", () => {
    const mock = createAppStateMockHost(true)
    const appState = createAppState(mock.host)
    expect(appState.currentState).toBe("active")
    mock.setActive(false)
    expect(appState.currentState).toBe("background")
    expect(appState.isAvailable).toBe(true)
  })

  it("emits change events with the next state", () => {
    const mock = createAppStateMockHost(true)
    const appState = createAppState(mock.host)
    const handler = vi.fn()
    appState.addEventListener("change", handler)
    mock.setActive(false)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith("background")
    mock.setActive(true)
    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenLastCalledWith("active")
  })

  it("does not emit when the host notifies without a transition", () => {
    const mock = createAppStateMockHost(true)
    const appState = createAppState(mock.host)
    const handler = vi.fn()
    appState.addEventListener("change", handler)
    mock.notifier.fire()
    expect(handler).not.toHaveBeenCalled()
  })

  it("emits focus only on transitions to active", () => {
    const mock = createAppStateMockHost(true)
    const appState = createAppState(mock.host)
    const focus = vi.fn()
    appState.addEventListener("focus", focus)
    mock.setActive(false)
    expect(focus).not.toHaveBeenCalled()
    mock.setActive(true)
    expect(focus).toHaveBeenCalledTimes(1)
    expect(focus).toHaveBeenCalledWith("active")
  })

  it("emits blur only on transitions to background", () => {
    const mock = createAppStateMockHost(true)
    const appState = createAppState(mock.host)
    const blur = vi.fn()
    appState.addEventListener("blur", blur)
    mock.setActive(false)
    expect(blur).toHaveBeenCalledTimes(1)
    expect(blur).toHaveBeenCalledWith("background")
    mock.setActive(true)
    expect(blur).toHaveBeenCalledTimes(1)
  })

  it("keeps currentState in sync while subscribed", () => {
    const mock = createAppStateMockHost(true)
    const appState = createAppState(mock.host)
    appState.addEventListener("change", vi.fn())
    mock.setActive(false)
    expect(appState.currentState).toBe("background")
  })

  it("stops calling handlers after remove(), idempotently", () => {
    const mock = createAppStateMockHost(true)
    const appState = createAppState(mock.host)
    const handler = vi.fn()
    const subscription = appState.addEventListener("change", handler)
    subscription.remove()
    subscription.remove()
    mock.setActive(false)
    expect(handler).not.toHaveBeenCalled()
  })

  it("holds a single host subscription only while listeners exist", () => {
    const mock = createAppStateMockHost()
    const appState = createAppState(mock.host)
    expect(mock.notifier.count()).toBe(0)
    const change = appState.addEventListener("change", vi.fn())
    const focus = appState.addEventListener("focus", vi.fn())
    expect(mock.notifier.count()).toBe(1)
    change.remove()
    focus.remove()
    expect(mock.notifier.count()).toBe(0)
  })

  it("rejects unsupported event types", () => {
    const appState = createAppState(createAppStateMockHost().host)
    expect(() =>
      appState.addEventListener("memoryWarning" as never, vi.fn()),
    ).toThrow(/unsupported event type/)
  })
})
