import { describe, expect, it, vi } from "vitest"
import { createBackHandler } from "../../../src/apis/back-handler"

const createHost = () => ({
  exitApp: vi.fn(),
})

describe("BackHandler", () => {
  it("exitApp delegates to the host", () => {
    const host = createHost()
    createBackHandler(host).exitApp()
    expect(host.exitApp).toHaveBeenCalledTimes(1)
  })

  it("runs handlers last-registered-first and stops at the first true", () => {
    const host = createHost()
    const backHandler = createBackHandler(host)
    const calls: string[] = []
    backHandler.addEventListener("hardwareBackPress", () => {
      calls.push("first")
      return true
    })
    backHandler.addEventListener("hardwareBackPress", () => {
      calls.push("second")
      return true
    })
    expect(backHandler.dispatchBackPress()).toBe(true)
    expect(calls).toEqual(["second"])
    expect(host.exitApp).not.toHaveBeenCalled()
  })

  it("falls through to exitApp when nothing consumes the press", () => {
    const host = createHost()
    const backHandler = createBackHandler(host)
    backHandler.addEventListener("hardwareBackPress", () => false)
    expect(backHandler.dispatchBackPress()).toBe(false)
    expect(host.exitApp).toHaveBeenCalledTimes(1)
  })

  it("removed subscriptions no longer run", () => {
    const host = createHost()
    const backHandler = createBackHandler(host)
    const handler = vi.fn(() => true)
    const subscription = backHandler.addEventListener(
      "hardwareBackPress",
      handler,
    )
    subscription.remove()
    backHandler.dispatchBackPress()
    expect(handler).not.toHaveBeenCalled()
    expect(host.exitApp).toHaveBeenCalledTimes(1)
  })
})
