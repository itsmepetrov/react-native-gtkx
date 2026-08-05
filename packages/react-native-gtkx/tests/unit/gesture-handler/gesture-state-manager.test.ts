// ./tag-registry and `GestureStateManager` — the reversed refusal, tested at
// the boundary an app (or react-native-sortables) actually calls: a numeric
// handler tag in, the same machinery `Gesture.Manual()`'s own `onTouches*`
// manager already drives out.
//
// Deliberately built on the same rig shape manual.test.ts uses rather than a
// second one, because the point being tested is that there is only ONE state
// manager per recognizer, reachable two ways — through the local object
// `onTouchesDown` hands over, and through the tag registered for it. A
// bespoke fixture here would not exercise that identity.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GestureStateManager } from "../../../src/gesture-handler-compat/gesture-state-manager"
import { manualDecider } from "../../../src/gesture-handler-compat/manual"
import { createOrchestrator } from "../../../src/gesture-handler-compat/orchestrator"
import {
  createRecognizer,
  type Rect,
} from "../../../src/gesture-handler-compat/recognizer"
import {
  recognizerForTag,
  registerRecognizer,
  unregisterRecognizer,
} from "../../../src/gesture-handler-compat/tag-registry"
import {
  GESTURE_STATE,
  type RecognizerConfig,
} from "../../../src/gesture-handler-compat/types"
import { createResponderSystem } from "../../../src/responder/system"
import type { NativeTouch } from "../../../src/responder/types"

const BOUNDS: Rect = { x: 100, y: 100, width: 400, height: 400 }
const CX = 300
const CY = 300

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

type Node = { name: string }

/**
 * A mounted `Gesture.Manual()`, registered in ./tag-registry exactly the way
 * `GestureDetector`'s own runtime registers one on mount. That registration —
 * not anything built specially for this test — is what `GestureStateManager`
 * is being tested against.
 */
const mount = (config: RecognizerConfig, tag: number) => {
  const view: Node = { name: "view" }
  const root: Node = { name: "root" }
  const parents = new Map<object, object | null>([
    [view, root],
    [root, null],
  ])
  const system = createResponderSystem({
    parentOf: (host) => parents.get(host) ?? null,
    onClaim: vi.fn(),
  })
  const orchestrator = createOrchestrator()
  const recognizer = createRecognizer(tag, manualDecider, () => config, {
    boundsInWindow: () => BOUNDS,
    requestResponder: () => system.requestResponder(view),
    orchestrator,
  })
  system.register(view, () => recognizer.handlers)
  registerRecognizer(tag, recognizer)

  const time = 1000
  return {
    view,
    recognizer,
    press: (x = CX, y = CY) => {
      system.touchStart(view, touchAt(x, y, time))
    },
    holder: () => system.getResponder(),
    /** What `GestureDetector`'s runtime does on unmount: unregister, dispose. */
    dispose: () => {
      unregisterRecognizer(tag)
      recognizer.dispose()
    },
  }
}

const tracer = () => {
  const trace: string[] = []
  const config: RecognizerConfig = {
    onBegin: () => trace.push("begin"),
    onActivate: () => trace.push("activate"),
    onDeactivate: (_event, success) => trace.push(`deactivate(${success})`),
    onFinalize: (_event, success) => trace.push(`finalize(${success})`),
  }
  return { trace, config }
}

beforeEach(() => {
  vi.useFakeTimers()
})

describe("the tag registry", () => {
  it("resolves a tag to the recognizer registered under it, and forgets it once unregistered", () => {
    const { config } = tracer()
    const rig = mount(config, 501)
    expect(recognizerForTag(501)).toBe(rig.recognizer)
    rig.dispose()
    expect(recognizerForTag(501)).toBeUndefined()
  })
})

describe("GestureStateManager, upstream's real v3 shape", () => {
  afterEach(() => {
    // Belt and braces: a failed assertion above must not leak a mounted tag
    // into the next test's registry.
    unregisterRecognizer(777)
    unregisterRecognizer(778)
  })

  it("activate() reaches the SAME machinery Gesture.Manual()'s onTouches* manager drives", () => {
    const { trace, config } = tracer()
    const rig = mount(config, 777)
    rig.press()
    GestureStateManager.activate(777)
    expect(trace).toEqual(["begin", "activate"])
    // It really took the interaction — the same assertion manual.test.ts
    // makes of `.activate()` reached through the local manager.
    expect(rig.holder()).toBe(rig.view)
    rig.dispose()
  })

  it("fail() and deactivate() are .fail() and .end() under upstream's other names", () => {
    const ended: number[] = []
    const rig = mount({ onFinalize: (event) => ended.push(event.state) }, 777)
    rig.press()
    GestureStateManager.fail(777)
    expect(ended).toEqual([GESTURE_STATE.FAILED])
    rig.dispose()

    const otherEnded: number[] = []
    const other = mount(
      { onFinalize: (event) => otherEnded.push(event.state) },
      778,
    )
    other.press()
    GestureStateManager.activate(778)
    GestureStateManager.deactivate(778)
    expect(otherEnded).toEqual([GESTURE_STATE.END])
    other.dispose()
  })

  it("no-ops, rather than throws, for a tag with no mounted recognizer", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(() => GestureStateManager.activate(999_999)).not.toThrow()
    expect(() => GestureStateManager.fail(999_999)).not.toThrow()
    expect(() => GestureStateManager.deactivate(999_999)).not.toThrow()
    expect(warn).toHaveBeenCalledTimes(3)
    warn.mockRestore()
  })

  it("stops resolving once the detector unmounts, exactly like any other stale tag", () => {
    const { trace, config } = tracer()
    const rig = mount(config, 777)
    rig.dispose()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    GestureStateManager.activate(777)
    expect(trace).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
