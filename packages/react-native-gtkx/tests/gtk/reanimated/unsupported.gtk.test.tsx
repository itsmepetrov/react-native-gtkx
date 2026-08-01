// The refusals. An unimplemented Reanimated export must fail where it is
// used, naming itself and pointing somewhere — not arrive as `undefined` and
// animate nothing, which is the failure mode docs/research/gestures.md calls
// the worst possible one.
//
// A GTK test rather than a unit test because the module builds the compat
// surface on the platform's Animated, which reaches the bridge on import.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { expect, it } from "vitest"
import { Root, Text } from "../../../src/index"
import Animated, {
  createAnimatedComponent,
  css,
  FadeIn,
  interpolateColor,
  isConfigured,
  isWorkletFunction,
  LinearTransition,
  makeShareableCloneRecursive,
  ReduceMotion,
  runOnJS,
  runOnUI,
  useAnimatedProps,
  useReducedMotion,
} from "../../../src/reanimated-compat/index"

const settle = (ms = 60): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

it("throws with the symbol's name when an unsupported export is called", () => {
  expect(() => (interpolateColor as () => void)()).toThrow(
    /`interpolateColor` is not supported/,
  )
  expect(() => (useAnimatedProps as () => void)()).toThrow(
    /`useAnimatedProps` is not supported/,
  )
  expect(() => (createAnimatedComponent as () => void)()).toThrow(
    /`createAnimatedComponent` is not supported/,
  )
})

it("throws when an unsupported export is read as a namespace", () => {
  // `css.create({...})` and `FadeIn.duration(300)` are how these are actually
  // reached, so the READ has to fail — before anything is built from
  // undefined.
  expect(() => (css as { create: () => void }).create).toThrow(
    /`css` is not supported/,
  )
  expect(() => (FadeIn as { duration: () => void }).duration).toThrow(
    /`FadeIn` is not supported/,
  )
  expect(
    () => (LinearTransition as { springify: () => void }).springify,
  ).toThrow(/`LinearTransition` is not supported/)
})

it("points at what IS implemented rather than only refusing", () => {
  expect(() => (FadeIn as () => void)()).toThrow(/useAnimatedStyle/)
  expect(() => (FadeIn as () => void)()).toThrow(/docs\/api\.md/)
})

it("survives the introspection React and console do before use", () => {
  expect(() => (FadeIn as { $$typeof?: symbol }).$$typeof).not.toThrow()
  expect(() => String(FadeIn.name)).not.toThrow()
})

it("throws when an unsupported animated component is rendered", async () => {
  // The realistic path: an app keeps its <Animated.Text> and finds out here,
  // naming the component, rather than three frames later.
  let error: unknown = null
  try {
    await act(async () => {
      await render(
        <Root
          width={200}
          height={200}
        >
          <Animated.Text>never rendered</Animated.Text>
        </Root>,
      )
    })
  } catch (caught) {
    error = caught
  }
  expect(String(error)).toMatch(/`Animated.Text` is not supported/)
})

it("Animated.View is implemented and renders its children", async () => {
  await render(
    <Root
      width={200}
      height={200}
    >
      <Animated.View style={{ width: 100, height: 100 }}>
        <Text>inside the animated view</Text>
      </Animated.View>
    </Root>,
  )
  await waitFor(() => {
    expect(screen.getByText("inside the animated view")).toBeTruthy()
  })
})

it("answers the presence checks libraries make", () => {
  expect(isConfigured()).toBe(true)
  expect(useReducedMotion()).toBe(false)
  expect(ReduceMotion.System).toBe("system")
  // Nothing leaves the runtime it was made in, so cloning is identity —
  // upstream's own non-native serializer is the same.
  const value = { a: 1 }
  expect(makeShareableCloneRecursive(value)).toBe(value)
  // Without the Babel plugin nothing carries a worklet hash, and nothing here
  // needs one.
  expect(isWorkletFunction(() => undefined)).toBe(false)
})

it("runOnUI and runOnJS schedule rather than call inline", async () => {
  // Upstream's own single-runtime path defers both — a microtask plus a frame
  // for runOnUI, a microtask for runOnJS — and returns void. Code written for
  // Reanimated relies on not being re-entered, so this platform matches it
  // even though it could run them on the spot.
  let uiRan = false
  let jsRan = false

  await act(async () => {
    const result = runOnUI(() => {
      uiRan = true
    })()
    const jsResult = runOnJS(() => {
      jsRan = true
    })()
    expect(result).toBeUndefined()
    expect(jsResult).toBeUndefined()
    expect(uiRan).toBe(false)
    expect(jsRan).toBe(false)
  })

  await settle()
  expect(uiRan).toBe(true)
  expect(jsRan).toBe(true)
})
