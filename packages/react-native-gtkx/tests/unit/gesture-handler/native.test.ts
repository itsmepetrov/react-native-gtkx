// `Gesture.Native()` — the recognizer that reports the widget underneath it
// instead of competing with it.
//
// Driven through the REAL responder system, as the other recognizer tests
// are, because the single most important claim about this gesture is a claim
// about the responder: it must never take it. A mocked system could be made
// to agree with any implementation; this one is the shipped
// `createResponderSystem` over a fake host tree, and `onClaim` is the exact
// callback that, on GTK, declares `CLAIMED` and switches every enclosing
// scrolled window's kinetics off.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Gesture } from "../../../src/gesture-handler-compat/builder"
import { useNativeGesture } from "../../../src/gesture-handler-compat/hooks"
import {
  NATIVE_TOUCH_SLOP,
  nativeDecider,
} from "../../../src/gesture-handler-compat/native"
import {
  createRecognizer,
  type Rect,
} from "../../../src/gesture-handler-compat/recognizer"
import { GESTURE_STATE } from "../../../src/gesture-handler-compat/types"
import type { RecognizerConfig } from "../../../src/gesture-handler-compat/types"
import { createResponderSystem } from "../../../src/responder/system"
import type { NativeTouch } from "../../../src/responder/types"

type Node = { name: string }

const touchAt = (x: number, y: number, timestamp: number): NativeTouch => ({
  identifier: 0,
  target: 1,
  locationX: x,
  locationY: y,
  pageX: x,
  pageY: y,
  timestamp,
  force: 0,
})

const BOUNDS: Rect = { x: 100, y: 100, width: 200, height: 200 }
const CX = 200
const CY = 200

const mount = (config: RecognizerConfig) => {
  const view: Node = { name: "view" }
  const root: Node = { name: "root" }
  const parents = new Map<object, object | null>([
    [view, root],
    [root, null],
  ])
  const onClaim = vi.fn()
  const system = createResponderSystem({
    parentOf: (host) => parents.get(host) ?? null,
    onClaim,
  })

  const requestResponder = vi.fn(() => system.requestResponder(view))
  const recognizer = createRecognizer(7, nativeDecider, () => config, {
    boundsInWindow: () => BOUNDS,
    requestResponder,
  })
  system.register(view, () => recognizer.handlers)

  let time = 1000
  const at = (x: number, y: number) => touchAt(x, y, time)

  return {
    view,
    system,
    onClaim,
    requestResponder,
    press: (x: number, y: number) => {
      system.touchStart(view, at(x, y))
    },
    moveTo: (x: number, y: number, stepMs = 16) => {
      time += stepMs
      system.touchMove(view, at(x, y))
    },
    release: (x: number, y: number) => {
      time += 16
      system.touchEnd(view, at(x, y))
    },
    /**
     * What a STOLEN sequence produces. On GTK this is reached from
     * `drag-end` on a sequence that went `->DENIED` — a native ancestor took
     * the interaction — which `responder/use-responder.ts` routes to
     * `touchCancel` precisely so that it does not look like a release.
     */
    cancel: (x: number, y: number) => {
      time += 16
      system.touchCancel(view, at(x, y))
    },
    holder: () => system.getResponder(),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

describe("Gesture.Native()", () => {
  it("is a real gesture in both spellings, not a stand-in", () => {
    expect(Gesture.Native().kind).toBe("native")
    expect(useNativeGesture().kind).toBe("native")
    // Upstream's `NativeViewGestureHandler.init` sets it, so both spellings
    // must — a press that wanders off a native scrollable is not on it.
    expect(Gesture.Native().config.shouldCancelWhenOutside).toBe(true)
    expect(useNativeGesture().config.shouldCancelWhenOutside).toBe(true)
  })

  it("activates once the pointer travels the touch slop, and not before", () => {
    const onActivate = vi.fn()
    const gesture = mount({ onActivate })

    gesture.press(CX, CY)
    gesture.moveTo(CX, CY + NATIVE_TOUCH_SLOP - 1)
    expect(onActivate).not.toHaveBeenCalled()

    gesture.moveTo(CX, CY + NATIVE_TOUCH_SLOP)
    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(onActivate.mock.calls[0]![0].state).toBe(GESTURE_STATE.ACTIVE)
  })

  it("activates on the press itself with shouldActivateOnStart", () => {
    const onActivate = vi.fn()
    const gesture = mount({ shouldActivateOnStart: true, onActivate })
    gesture.press(CX, CY)
    // Upstream's shape for a native view that is a BUTTON rather than a
    // scrollable: it takes the press at once instead of waiting to see
    // whether the pointer is going to travel.
    expect(onActivate).toHaveBeenCalledTimes(1)
    // And still without the lock, which is the invariant that does not bend.
    expect(gesture.onClaim).not.toHaveBeenCalled()
  })

  // THE CLAIM THIS GESTURE EXISTS TO MAKE. Winning the responder is what
  // makes the platform declare `CLAIMED` on the GTK sequence and call
  // `setKineticScrolling(false)` on every enclosing `GtkScrolledWindow`. A
  // gesture that means "the native scroller is handling this" cannot be the
  // thing that turns the native scroller off.
  it("never takes the responder, so nothing is ever claimed", () => {
    const gesture = mount({})

    gesture.press(CX, CY)
    for (let offset = 5; offset <= 80; offset += 5) {
      gesture.moveTo(CX, CY + offset)
    }
    gesture.release(CX, CY + 80)

    expect(gesture.holder()).toBeNull()
    expect(gesture.onClaim).not.toHaveBeenCalled()
    expect(gesture.requestResponder).not.toHaveBeenCalled()
  })

  it("reports travel from the touch props, which fire without the lock", () => {
    const onUpdate = vi.fn()
    const gesture = mount({ onUpdate })

    gesture.press(CX, CY)
    gesture.moveTo(CX, CY + 20)
    gesture.moveTo(CX, CY + 40)

    // Translation is measured from the ACTIVATION point (the 20px move that
    // crossed the slop), not from the press — the same rule every other kind
    // follows, and the reason a scroller does not jump by the slop.
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0]![0].translationY).toBe(20)
  })

  it("ends successfully when the pointer lifts", () => {
    const onDeactivate = vi.fn()
    const onFinalize = vi.fn()
    const gesture = mount({ onDeactivate, onFinalize })

    gesture.press(CX, CY)
    gesture.moveTo(CX, CY + 40)
    gesture.release(CX, CY + 40)

    expect(onDeactivate).toHaveBeenCalledWith(expect.anything(), true)
    expect(onFinalize).toHaveBeenCalledWith(expect.anything(), true)
    expect(onFinalize.mock.calls[0]![0].state).toBe(GESTURE_STATE.END)
  })

  // THE ->DENIED PATH, from this end. `responder/use-responder.ts` is what
  // turns a stolen sequence into a cancel rather than an end; this is the
  // half that proves the two are then distinguishable in the callbacks a
  // library actually reads.
  it("a stolen sequence is a cancellation, not a clean ending", () => {
    const onDeactivate = vi.fn()
    const onFinalize = vi.fn()
    const gesture = mount({ onDeactivate, onFinalize })

    gesture.press(CX, CY)
    gesture.moveTo(CX, CY + 40)
    gesture.cancel(CX, CY + 40)

    expect(onDeactivate).toHaveBeenCalledWith(expect.anything(), false)
    expect(onFinalize).toHaveBeenCalledWith(expect.anything(), false)
    expect(onFinalize.mock.calls[0]![0].state).toBe(GESTURE_STATE.CANCELLED)
  })

  it("fails rather than ends when the pointer lifts before the slop", () => {
    const onDeactivate = vi.fn()
    const onFinalize = vi.fn()
    const gesture = mount({ onDeactivate, onFinalize })

    gesture.press(CX, CY)
    gesture.moveTo(CX, CY + 3)
    gesture.release(CX, CY + 3)

    // Never activated, so there is no deactivation to report — which is what
    // lets a consumer tell a scroll that happened from one that did not.
    expect(onDeactivate).not.toHaveBeenCalled()
    expect(onFinalize).toHaveBeenCalledWith(expect.anything(), false)
  })

  it("cancels when the pointer leaves the view, as upstream's does", () => {
    const onFinalize = vi.fn()
    const gesture = mount({ shouldCancelWhenOutside: true, onFinalize })

    gesture.press(CX, CY)
    gesture.moveTo(CX, CY + 40)
    gesture.moveTo(CX, BOUNDS.y + BOUNDS.height + 50)

    expect(onFinalize).toHaveBeenCalledWith(expect.anything(), false)
  })
})
