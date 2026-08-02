// `useAnimatedScrollHandler`, tested through the core the hook is two refs
// around (this repo's unit project has no React renderer — see
// tests/unit/apis/hooks.test.ts for the same split).
//
// Three things carry it: the event shape is FLATTENED (Reanimated's, not RN's
// `nativeEvent` envelope), the context object is one object for the life of
// the handler, and the handlers are read per event so a re-render is picked
// up without a new function.
//
// The fourth reads like an omission and is a platform fact:
// `onBeginDrag`/`onEndDrag`/`onMomentumBegin`/`onMomentumEnd` are accepted and
// never called, because a wheel-driven desktop scroller has no drag or
// momentum phase and this platform's ScrollView has no prop to report one.
// The test pins that, so the day a source appears this fails and says so.
import { describe, expect, it, test, vi } from "vitest"
import type { ScrollEvent } from "../../../src/components/scroll-view"
import {
  createScrollHandler,
  scrollTo,
} from "../../../src/reanimated-compat/scroll-handler"

const scrollEvent = (y: number): ScrollEvent => ({
  nativeEvent: {
    contentOffset: { x: 0, y },
    contentSize: { width: 100, height: 1000 },
    layoutMeasurement: { width: 100, height: 200 },
  },
})

describe("useAnimatedScrollHandler", () => {
  it("hands the handler a flattened event, not RN's nativeEvent envelope", () => {
    const onScroll = vi.fn()
    createScrollHandler(() => ({ onScroll }))(scrollEvent(42))
    expect(onScroll).toHaveBeenCalledTimes(1)
    const event = onScroll.mock.calls[0]![0]
    expect(event.contentOffset).toEqual({ x: 0, y: 42 })
    expect(event.layoutMeasurement).toEqual({ width: 100, height: 200 })
    expect(event.eventName).toBe("onScroll")
    expect("nativeEvent" in event).toBe(false)
  })

  it("accepts a bare function as the onScroll handler, as upstream does", () => {
    const onScroll = vi.fn()
    createScrollHandler(() => onScroll)(scrollEvent(7))
    expect(onScroll.mock.calls[0]![0].contentOffset.y).toBe(7)
  })

  it("gives every call the same context object", () => {
    const seen: unknown[] = []
    const handle = createScrollHandler(() => ({
      onScroll: (_event, context) => {
        seen.push(context)
      },
    }))
    handle(scrollEvent(1))
    handle(scrollEvent(2))
    expect(seen).toHaveLength(2)
    expect(seen[0]).toBe(seen[1])
  })

  it("reads the handlers per event, so a re-render needs no new function", () => {
    const first = vi.fn()
    const second = vi.fn()
    let onScroll = first
    const handle = createScrollHandler(() => ({ onScroll }))
    onScroll = second
    handle(scrollEvent(3))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it("survives a scrollable with no handlers at all", () => {
    expect(() => {
      createScrollHandler(() => undefined)(scrollEvent(1))
    }).not.toThrow()
  })

  it("never calls the drag and momentum handlers — no phase exists to report", () => {
    const onBeginDrag = vi.fn()
    const onEndDrag = vi.fn()
    const onMomentumBegin = vi.fn()
    const onMomentumEnd = vi.fn()
    const handle = createScrollHandler(() => ({
      onScroll: vi.fn(),
      onBeginDrag,
      onEndDrag,
      onMomentumBegin,
      onMomentumEnd,
    }))
    handle(scrollEvent(1))
    handle(scrollEvent(2))
    expect(onBeginDrag).not.toHaveBeenCalled()
    expect(onEndDrag).not.toHaveBeenCalled()
    expect(onMomentumBegin).not.toHaveBeenCalled()
    expect(onMomentumEnd).not.toHaveBeenCalled()
  })
})

// `scrollTo` — the write half. `react-native-reanimated-dnd`'s
// `useSortableList` reads the offset through the handler above and pushes one
// back through this, inside a `useAnimatedReaction`; both shapes of ref it
// can be handed are covered here.
test("scrollTo scrolls through a plain ref object", () => {
  const handle = { scrollTo: vi.fn() }
  scrollTo({ current: handle }, 0, 120, false)
  expect(handle.scrollTo).toHaveBeenCalledWith({
    x: 0,
    y: 120,
    animated: false,
  })
})

// `useAnimatedRef` returns a ref that is also callable and reads back through
// a call with no argument — see reanimated-compat/animated-ref.ts.
test("scrollTo scrolls through a callable animated ref", () => {
  const handle = { scrollTo: vi.fn() }
  scrollTo(() => handle, 40, 0, true)
  expect(handle.scrollTo).toHaveBeenCalledWith({ x: 40, y: 0, animated: true })
})

test("scrollTo ignores a ref pointing at nothing, or at a non-scrollable", () => {
  expect(() => scrollTo({ current: null }, 0, 10, false)).not.toThrow()
  expect(() => scrollTo(() => null, 0, 10, false)).not.toThrow()
  expect(() => scrollTo(null, 0, 10, false)).not.toThrow()
  expect(() => scrollTo(undefined, 0, 10, false)).not.toThrow()
  expect(() => scrollTo({ current: {} }, 0, 10, false)).not.toThrow()
})
