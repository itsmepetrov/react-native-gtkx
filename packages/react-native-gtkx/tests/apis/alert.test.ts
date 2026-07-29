import { describe, expect, it, vi } from "vitest"
import { createAlert } from "../../src/apis/alert.js"
import type { HostAlertRequest } from "../../src/apis/host.js"

const createAlertMockHost = () => {
  const requests: HostAlertRequest[] = []
  let resolveResponse: (id: string | null) => void = () => {}
  let rejectResponse: (error: unknown) => void = () => {}
  const host = {
    showAlert: vi.fn((request: HostAlertRequest) => {
      requests.push(request)
      return new Promise<string | null>((resolve, reject) => {
        resolveResponse = resolve
        rejectResponse = reject
      })
    }),
  }
  return {
    host,
    requests,
    respond: (id: string | null) => resolveResponse(id),
    fail: (error: unknown) => rejectResponse(error),
  }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe("Alert", () => {
  it("shows a single OK button when no buttons are given", () => {
    const mock = createAlertMockHost()
    createAlert(mock.host).alert("Title")
    expect(mock.requests).toHaveLength(1)
    expect(mock.requests[0]).toEqual({
      title: "Title",
      message: undefined,
      cancelable: true,
      buttons: [{ id: "0", label: "OK", style: "default", isPreferred: false }],
    })
  })

  it("maps button text, style and isPreferred onto the host request", () => {
    const mock = createAlertMockHost()
    createAlert(mock.host).alert(
      "Delete file?",
      "This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", isPreferred: true },
      ],
      { cancelable: false },
    )
    expect(mock.requests[0]).toEqual({
      title: "Delete file?",
      message: "This cannot be undone.",
      cancelable: false,
      buttons: [
        { id: "0", label: "Cancel", style: "cancel", isPreferred: false },
        { id: "1", label: "Delete", style: "destructive", isPreferred: true },
      ],
    })
  })

  it("invokes only the pressed button's onPress", async () => {
    const mock = createAlertMockHost()
    const onCancel = vi.fn()
    const onDelete = vi.fn()
    const onDismiss = vi.fn()
    createAlert(mock.host).alert(
      "Delete?",
      undefined,
      [
        { text: "Cancel", style: "cancel", onPress: onCancel },
        { text: "Delete", style: "destructive", onPress: onDelete },
      ],
      { onDismiss },
    )
    mock.respond("1")
    await flush()
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it("calls onDismiss when the dialog is dismissed", async () => {
    const mock = createAlertMockHost()
    const onPress = vi.fn()
    const onDismiss = vi.fn()
    createAlert(mock.host).alert("Hi", undefined, [{ text: "OK", onPress }], {
      onDismiss,
    })
    mock.respond(null)
    await flush()
    expect(onPress).not.toHaveBeenCalled()
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("treats an unknown response id as a dismissal", async () => {
    const mock = createAlertMockHost()
    const onDismiss = vi.fn()
    createAlert(mock.host).alert("Hi", undefined, [{ text: "OK" }], {
      onDismiss,
    })
    mock.respond("close")
    await flush()
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("survives buttons without onPress", async () => {
    const mock = createAlertMockHost()
    createAlert(mock.host).alert("Hi")
    mock.respond("0")
    await flush()
  })

  it("logs host failures instead of throwing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const mock = createAlertMockHost()
    createAlert(mock.host).alert("Hi")
    mock.fail(new Error("portal unavailable"))
    await flush()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
