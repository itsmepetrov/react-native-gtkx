// The `react-native-gesture-handler` shim: both halves.
//
// Half one — `GestureHandlerRootView` is a real layout box, not a
// passthrough. Upstream renders `<View style={style ?? {flex: 1}}>`, so an
// app leaning on that box to fill the screen must still get it, and an app
// that passes its own style must get exactly that instead (upstream REPLACES
// the default rather than merging with it). Both are asserted against real
// allocated geometry rather than against the props, because the props would
// have passed for a passthrough too.
//
// Half two — every export that is NOT implemented throws where it is used,
// naming itself. That is the whole reason RNGH is aliased at all rather than
// left to fail at resolution: the failure has to stay loud.
// docs/research/gestures.md records what a silent no-op costs. `Pan` and
// `GestureDetector` are implemented and have their own suite next door
// (gesture-detector.gtk.test.tsx); what is asserted here is that implementing
// them did not quieten anything else.
import { act, render, screen } from "@gtkx/testing"
import { expect, it } from "vitest"
import * as entry from "../../../src/gesture-handler-compat/index"
import {
  Directions,
  Gesture,
  GestureHandlerRootView,
  HoverEffect,
  MouseButton,
  PanGestureHandler,
  PointerType,
  RectButton,
  State,
  useFlingGesture,
} from "../../../src/gesture-handler-compat/index"
import type { Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Root, Text, View } from "../../../src/index"

const settle = async (ms = 60): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

const heightOf = (testID: string): number => {
  const widget = screen.getByName(testID) as GtkNs.Widget
  return widget
    .computeBounds(widget.getRoot() as unknown as GtkNs.Widget)[1]
    .getHeight()
}

it("fills its parent by default, the way upstream's flex: 1 root does", async () => {
  await act(async () => {
    await render(
      <Root
        width={400}
        height={300}
      >
        <GestureHandlerRootView testID="root">
          <Text>content</Text>
        </GestureHandlerRootView>
      </Root>,
    )
  })
  await settle()

  // The assertion that separates a real root from a passthrough: rendering
  // only the children would leave the content at its intrinsic height, not
  // the window's.
  expect(heightOf("root")).toBe(300)
})

it("lets an explicit style REPLACE the default, as upstream does", async () => {
  await act(async () => {
    await render(
      <Root
        width={400}
        height={300}
      >
        <View style={{ flex: 1 }}>
          <GestureHandlerRootView
            testID="sized"
            style={{ height: 120 }}
          >
            <Text>content</Text>
          </GestureHandlerRootView>
        </View>
      </Root>,
    )
  })
  await settle()

  // Upstream is `style ?? {flex: 1}`, not `[{flex: 1}, style]` — so a style
  // with a height and no flex gives exactly that height. Merging instead
  // would have stretched this to 300.
  expect(heightOf("sized")).toBe(120)
})

it("renders its children", async () => {
  await act(async () => {
    await render(
      <Root
        width={200}
        height={200}
      >
        <GestureHandlerRootView>
          <Text>inside the root</Text>
        </GestureHandlerRootView>
      </Root>,
    )
  })
  await settle()

  expect(screen.getByText("inside the root")).toBeTruthy()
})

it("throws with the symbol's name when an unsupported export is called", () => {
  // A hook or factory: called directly. `useTapGesture` stood here first,
  // `usePinchGesture` after it, `useFlingGesture` after that and
  // `GestureStateManager` after that (reversed 2026-08-05, docs/api.md); all
  // are implemented now, so the assertion has moved to a symbol that is
  // refused on purpose rather than one waiting to be written.
  // `VirtualGestureDetector` drives a gesture with no view at all, which the
  // tag registry does not change: every recognizer here is still built by a
  // mounted `GestureDetector` wrapping exactly one child.
  expect(() => (entry.VirtualGestureDetector as () => void)()).toThrow(
    /`VirtualGestureDetector` is not supported/,
  )
  expect(useFlingGesture().kind).toBe("fling")
})

it("GestureStateManager is a real object of three functions, not a throwing stand-in", () => {
  // The reversal itself, asserted at the export an app (and
  // react-native-sortables' v3 gesture-handler adapter) actually imports —
  // not at ./gesture-state-manager directly, so a regression that broke only
  // the re-export would still be caught here. Behaviour against a mounted
  // recognizer is gesture-state-manager.test.ts's job, and the real drag is
  // the headless probe.
  expect(entry.GestureStateManager.activate).toBeTypeOf("function")
  expect(entry.GestureStateManager.fail).toBeTypeOf("function")
  expect(entry.GestureStateManager.deactivate).toBeTypeOf("function")
  // Upstream's own shape: unlike the legacy `.create(tag)` factory, calling a
  // method with a tag that names nothing must not throw — it is a no-op, the
  // same way `Gesture.Manual()`'s own `.activate()` no-ops on a state that
  // does not allow the transition.
  expect(() => entry.GestureStateManager.activate(-1)).not.toThrow()
})

it("keeps the hook spelling exactly as wide as upstream's", () => {
  // Nine hooks, not ten: `src/v3/hooks/gestures/` upstream has nine
  // directories and no `forceTouch`, `SingleGesture` omits ForceTouch, and
  // `useForceTouchGesture` exists nowhere in 3.1.0. `Gesture.ForceTouch()` is
  // the whole API upstream offers for it, so it is the whole API here — the
  // alternative would be the one kind whose second spelling this platform
  // invented.
  expect(entry.useFlingGesture).toBeTypeOf("function")
  expect(entry.useManualGesture).toBeTypeOf("function")
  expect(entry.useHoverGesture).toBeTypeOf("function")
  expect(
    (entry as unknown as Record<string, unknown>).useForceTouchGesture,
  ).toBeUndefined()
})

it("still refuses the 1.x component API, the buttons and the view-less detectors", () => {
  // The refusals that REMAIN, now that all ten recognizers ship and
  // `GestureStateManager` has been reversed. Each carries its reason in
  // src/gesture-handler-compat/index.tsx and in docs/api.md rather than being
  // a bare `unsupported()`, and this pins the list so that "still refused"
  // stays a decision rather than drift.
  for (const name of [
    // the RNGH 1.x COMPONENT API — a second public surface over the same
    // recognizers, deprecated upstream before the builder was
    "PanGestureHandler",
    "TapGestureHandler",
    "FlingGestureHandler",
    "ForceTouchGestureHandler",
    "legacy_createNativeWrapper",
    // native button views with an Android ripple and no GTK counterpart
    "RawButton",
    "BaseButton",
    "RectButton",
    "BorderlessButton",
    "TouchableNativeFeedback",
    "Touchable",
    "RefreshControl",
    // the two experimental detectors: one needs an irrevocable claim this
    // platform cannot take back, the other a gesture mounted with no view —
    // the tag registry answers "which recognizer", not "mint one with nothing"
    "VirtualGestureDetector",
    "InterceptingGestureDetector",
    // 2.x aliases for components whose 3.x spelling is implemented or refused
    "LegacyRectButton",
    "LegacyScrollView",
    "LegacyDrawerLayoutAndroid",
  ]) {
    const symbol = (entry as unknown as Record<string, unknown>)[name]
    expect(symbol, `${name} should still be exported`).toBeDefined()
    expect(() => (symbol as () => void)(), name).toThrow(
      new RegExp(`\`${name}\` is not supported`),
    )
  }
})

it("builds every recognizer in the namespace, none of which throws now", () => {
  // This assertion has been inverted twice and that history is the point: it
  // began as "the namespace throws", became "each unimplemented static throws
  // by name", and is now "there are none". All ten build.
  expect(Gesture.Pan()).toBeTruthy()
  expect(Gesture.Tap()).toBeTruthy()
  expect(Gesture.LongPress()).toBeTruthy()
  expect(Gesture.Native()).toBeTruthy()
  // The three composers stopped throwing when the relation maps landed; they
  // are list-builders over those maps and needed nothing else.
  expect(Gesture.Simultaneous(Gesture.Pan(), Gesture.Tap())).toBeTruthy()
  expect(Gesture.Exclusive(Gesture.Tap(), Gesture.Tap())).toBeTruthy()
  expect(Gesture.Race(Gesture.Pan(), Gesture.LongPress())).toBeTruthy()
  // Driven by GtkGestureZoom/GtkGestureRotate rather than by the pointer, so
  // they build here and only DO anything on a machine with a touchpad.
  expect(Gesture.Pinch()).toBeTruthy()
  expect(Gesture.Rotation()).toBeTruthy()
  // And the last four. `Fling` and `Manual` run off the pointer like `Pan`
  // does; `Hover` runs off GtkEventControllerMotion, which a plain mouse
  // drives; `ForceTouch` runs off GtkGestureStylus and needs a tablet tool.
  expect(Gesture.Fling().kind).toBe("fling")
  expect(Gesture.Manual().kind).toBe("manual")
  expect(Gesture.Hover().kind).toBe("hover")
  expect(Gesture.ForceTouch().kind).toBe("forceTouch")
})

it("gives the four enums upstream's numbers, under the names an app imports", () => {
  // `Directions` used to refuse, on the reasoning that an enum is meaningless
  // without a handler that could produce one. That reasoning expired the
  // moment `Gesture.Fling()` shipped — and this enum is not merely harmless
  // now, it is REQUIRED: `.direction()` takes these bits, so a refusal would
  // make the recognizer unusable in its documented spelling.
  //
  // A wrong bit is the quiet kind of wrong, exactly like a wrong `State`
  // number: `direction === Directions.LEFT` goes on compiling, goes on
  // running, and answers false. Transcribed from 3.1.0's `src/Directions.ts`,
  // `src/PointerType.ts`, `handlers/gestureHandlerCommon.ts` and
  // `handlers/gestures/hoverGesture.ts`.
  expect(Directions).toEqual({ RIGHT: 1, LEFT: 2, UP: 4, DOWN: 8 })
  expect(HoverEffect).toEqual({ NONE: 0, LIFT: 1, HIGHLIGHT: 2 })
  expect(MouseButton).toEqual({
    LEFT: 1,
    RIGHT: 2,
    MIDDLE: 4,
    BUTTON_4: 8,
    BUTTON_5: 16,
    ALL: 31,
  })
  expect(PointerType).toEqual({
    TOUCH: 0,
    STYLUS: 1,
    MOUSE: 2,
    KEY: 3,
    OTHER: 4,
  })
})

it("gives State upstream's six numbers, under the name an app imports", () => {
  // It threw until the recognizers landed, on the reasoning that the enum is
  // only meaningful against an event from a handler that could not run here.
  // All three run now and their payloads carry `state`, so the reasoning
  // expired. react-native-drawer-layout re-exports this as `GestureState`,
  // seeds a shared value with UNDETERMINED and tests `=== ACTIVE`.
  //
  // THIS is the pin, and it is deliberately by whole-object equality rather
  // than member by member: a silently different number is the failure mode
  // and nothing about it is loud — `state === State.ACTIVE` goes on compiling,
  // goes on running, and quietly answers false. Transcribed from
  // react-native-gesture-handler 3.1.0's `src/State.ts`, which is that file
  // in its entirety.
  expect(State).toEqual({
    UNDETERMINED: 0,
    FAILED: 1,
    BEGAN: 2,
    CANCELLED: 3,
    ACTIVE: 4,
    END: 5,
  })
  // `toEqual` alone would still pass if a member were dropped and the
  // expectation edited to match, so the count is pinned separately.
  expect(Object.keys(State)).toHaveLength(6)
})

it("throws when an unsupported handler component is rendered", async () => {
  // React calls the component, so the stand-in's call trap is what fires.
  // Rendering it is the realistic path: an app ports its screen, keeps its
  // <PanGestureHandler>, and finds out here rather than three frames later.
  let error: unknown = null
  try {
    await act(async () => {
      await render(
        <Root
          width={200}
          height={200}
        >
          <PanGestureHandler>
            <Text>never rendered</Text>
          </PanGestureHandler>
        </Root>,
      )
    })
  } catch (caught) {
    error = caught
  }
  expect(String(error)).toMatch(/`PanGestureHandler` is not supported/)
})

it("points at the replacement rather than only refusing", () => {
  // A refusal that does not say what to use instead is half an answer, and
  // the explanation now leads with what IS implemented.
  expect(() => (RectButton as () => void)()).toThrow(/`RectButton` is not/)
  expect(() => (RectButton as () => void)()).toThrow(
    /Gesture\.Pan\(\)` and `usePanGesture\(\)/,
  )
})

it("survives the introspection React and console do before use", () => {
  // The trap that would otherwise replace a precise message with a confusing
  // one from inside React: reading `$$typeof` must NOT throw.
  expect(
    () => (PanGestureHandler as { $$typeof?: symbol }).$$typeof,
  ).not.toThrow()
  expect(() => String(PanGestureHandler.name)).not.toThrow()
})
