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
import {
  Directions,
  Gesture,
  GestureHandlerRootView,
  PanGestureHandler,
  RectButton,
  State,
  useTapGesture,
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
  // A hook or factory: called directly.
  expect(() => (useTapGesture as () => void)()).toThrow(
    /`useTapGesture` is not supported/,
  )
})

it("throws per unimplemented recognizer rather than for the namespace", () => {
  // `Gesture` itself is real now — `Gesture.Pan()` is implemented — so the
  // refusal moved down one level. Each of the other eleven statics names
  // ITSELF, which is strictly more useful than the old whole-namespace throw:
  // an app calling `Gesture.Pinch()` is told about Pinch, not about Gesture.
  expect(Gesture.Pan()).toBeTruthy()
  expect(() => (Gesture.Pinch as () => void)()).toThrow(
    /`Gesture\.Pinch` is not supported/,
  )
  expect(() => (Gesture.Simultaneous as () => void)()).toThrow(
    /`Gesture\.Simultaneous` is not supported/,
  )
  // And an enum comparison, which is the other way these symbols get reached.
  // `Directions` has no handler that could produce one, so it still refuses.
  expect(() => (Directions as { LEFT: number }).LEFT).toThrow(
    /`Directions` is not supported/,
  )
})

it("gives State real numbers, because Pan now produces events worth comparing", () => {
  // It threw until this slice, on the reasoning that the enum is only
  // meaningful against an event from a handler that could not run here. Pan
  // runs here now and its payloads carry `state`, so the reasoning expired.
  // react-native-drawer-layout re-exports this as `GestureState`, seeds a
  // shared value with UNDETERMINED and tests `=== ACTIVE`; those six numbers
  // were the last runtime symbol standing between it and this platform.
  expect(State.UNDETERMINED).toBe(0)
  expect(State.FAILED).toBe(1)
  expect(State.BEGAN).toBe(2)
  expect(State.CANCELLED).toBe(3)
  expect(State.ACTIVE).toBe(4)
  expect(State.END).toBe(5)
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
