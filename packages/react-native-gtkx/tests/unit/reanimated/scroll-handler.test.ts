// `useAnimatedScrollHandler`, tested through the core the hook is two refs
// around (this repo's unit project has no React renderer — see
// tests/unit/apis/hooks.test.ts for the same split).
//
// Three things carry it: the event shape is FLATTENED (Reanimated's, not RN's
// `nativeEvent` envelope), the context object is one object for the life of
// the handler, and the handlers are read per event so a re-render is picked
// up without a new function.
//
// The fourth used to pin that `onBeginDrag`/`onEndDrag`/`onMomentumBegin`/
// `onMomentumEnd` were accepted and NEVER CALLED — "a wheel-driven desktop
// scroller has no drag or momentum phase and this platform's ScrollView has
// no prop to report one" — with the note that the day a source appeared the
// test would fail and say so.
//
// A source appeared, and the test says so. Half of the old claim survived
// measurement and half did not: a wheel really does have no phase (GTK emits
// `::scroll` per detent and nothing else), but a TOUCHPAD GLIDE emits
// `::scroll-begin`, `::scroll-end` and a real kinetic deceleration after it.
// The claim was about the wheel, not about the platform —
// docs/research/scroll-phases.md has the traces. The four handlers are called
// now, and what pins the wheel half is the GTK test beside this one, where a
// real wheel produces `onScroll` and no phase at all.
//
// Here the phase half is pinned where it can be: the ROUTING. One handler
// object, five callbacks, one shared context — and no phase sink offered at
// all when the caller asked for no phase, which is what lets a `ScrollView`
// install nothing.
import { describe, expect, it, test, vi } from "vitest"
import { scrollPhaseSink } from "../../../src/components/scroll-phase"
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

  it("routes each phase to its own handler, under upstream's event name", () => {
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
    const sink = scrollPhaseSink(handle)!
    expect(sink).toBeTruthy()

    sink.deliver("beginDrag", scrollEvent(10))
    sink.deliver("endDrag", scrollEvent(20))
    sink.deliver("momentumBegin", scrollEvent(30))
    sink.deliver("momentumEnd", scrollEvent(40))

    expect(onBeginDrag.mock.calls[0]![0]).toMatchObject({
      contentOffset: { x: 0, y: 10 },
      eventName: "onScrollBeginDrag",
    })
    expect(onEndDrag.mock.calls[0]![0].eventName).toBe("onScrollEndDrag")
    expect(onMomentumBegin.mock.calls[0]![0].eventName).toBe(
      "onMomentumScrollBegin",
    )
    expect(onMomentumEnd.mock.calls[0]![0].eventName).toBe(
      "onMomentumScrollEnd",
    )
    // The phase event is flattened exactly as `onScroll`'s is.
    expect("nativeEvent" in onEndDrag.mock.calls[0]![0]).toBe(false)
  })

  // The lock `@gorhom/bottom-sheet` performs is this and nothing more:
  // `onBeginDrag` records where the drag started, `onScroll` reads it back
  // and scrolls to it. One context object across both is the contract that
  // makes it possible.
  it("shares one context object between onScroll and the phases", () => {
    const seen: unknown[] = []
    const record = (
      _event: unknown,
      context: Record<string, unknown>,
    ): void => {
      seen.push(context)
    }
    const handle = createScrollHandler(() => ({
      onScroll: record,
      onBeginDrag: record,
      onMomentumEnd: record,
    }))
    const sink = scrollPhaseSink(handle)!
    sink.deliver("beginDrag", scrollEvent(1))
    handle(scrollEvent(2))
    sink.deliver("momentumEnd", scrollEvent(3))
    expect(seen).toHaveLength(3)
    expect(seen[0]).toBe(seen[1])
    expect(seen[1]).toBe(seen[2])
  })

  // The cost bar: a handler that asked for no phase must not make a
  // ScrollView install a GTK controller, a signal or a tick callback. The
  // sink exists (one object per handler, built once) and reports that it
  // wants nothing, which is what ScrollView reads.
  it("asks for no phase when the caller registered none", () => {
    const onlyScroll = createScrollHandler(() => ({ onScroll: vi.fn() }))
    expect(scrollPhaseSink(onlyScroll)!.wants()).toBe(false)

    const bareFunction = createScrollHandler(() => vi.fn())
    expect(scrollPhaseSink(bareFunction)!.wants()).toBe(false)

    let handlers: Record<string, unknown> = { onScroll: vi.fn() }
    const grows = createScrollHandler(() => handlers)
    expect(scrollPhaseSink(grows)!.wants()).toBe(false)
    // Asked per render rather than once, so a component that grows a phase
    // handler later gets the machinery then.
    handlers = { onScroll: vi.fn(), onEndDrag: vi.fn() }
    expect(scrollPhaseSink(grows)!.wants()).toBe(true)
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
