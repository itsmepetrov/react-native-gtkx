// `Keyboard` honours a subscription and never fires it, because a desktop has
// no software keyboard to report. What is worth testing is the half that is
// NOT "nothing happens": a subscription that pairs with its `remove()`, and a
// `remove()` that survives being called twice — the crash a fake subscription
// object would produce on unmount is the whole reason the module exists
// rather than being left out.
import { describe, expect, it, vi } from "vitest"
import { Keyboard } from "../../../src/apis/keyboard"

describe("Keyboard", () => {
  it("returns a subscription whose remove() is real and idempotent", () => {
    const subscription = Keyboard.addListener("keyboardDidShow", vi.fn())
    expect(typeof subscription.remove).toBe("function")
    subscription.remove()
    expect(() => subscription.remove()).not.toThrow()
  })

  it("never calls a listener — nothing on this platform can emit one", () => {
    const handler = vi.fn()
    Keyboard.addListener("keyboardWillShow", handler)
    Keyboard.addListener("keyboardDidHide", handler)
    // There is no `emit` to call: the module has no event source at all,
    // which is the claim. A listener that could be triggered from anywhere
    // would mean this file was lying about the platform.
    expect(handler).not.toHaveBeenCalled()
    Keyboard.removeAllListeners()
  })

  it("reports the keyboard as never visible and never occluding anything", () => {
    expect(Keyboard.isVisible()).toBe(false)
    expect(Keyboard.metrics()).toBeUndefined()
  })

  it("dismiss() does not blur, unlike RN's — see the note in keyboard.ts", () => {
    // The assertion that matters is that it is inert: RN reaches for the
    // focused TextInput here, and doing that on a desktop would make a
    // library's gesture steal focus from a form.
    expect(() => {
      Keyboard.dismiss()
    }).not.toThrow()
  })
})
