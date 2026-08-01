// A real fling, on real GTK geometry: released with a velocity, decelerating,
// stopping by itself.
//
// The unit tests already pin the step function against a manual clock. What
// they cannot say is that a decay reaches a widget — that the platform's frame
// loop drives it at all, that a shared value with no TARGET still lands in an
// allocation, and that it comes to rest rather than ticking forever off the
// GLib main loop. Every number below is read back out of GTK
// (`computeBounds()` against the stage) rather than out of our own
// bookkeeping, and it is read on a CHILD of the animated view, which only
// moves if the parent's allocation really moved.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { useEffect } from "react"
import { expect, it } from "vitest"
import { Graphene, Gtk } from "../../../src/gtkx/bridge/index"
import { Root, View } from "../../../src/index"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withClamp,
  withDecay,
  withTiming,
  type SharedValue,
} from "../../../src/reanimated-compat/index"

const settle = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const boundsOf = (testID: string): Graphene.Rect => {
  const stage = screen.getByName("stage") as unknown as Gtk.Widget
  const widget = screen.getByName(testID) as unknown as Gtk.Widget
  const [, rect] = widget.computeBounds(stage) as [boolean, Graphene.Rect]
  return rect
}

const xOf = (testID: string): number =>
  Math.round(boundsOf(testID).getX() * 100) / 100

let handle: SharedValue<number>

const Probe = () => {
  const offset = useSharedValue(0)
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }))

  useEffect(() => {
    handle = offset
  })

  return (
    <View
      style={{ width: 400, height: 120 }}
      testID="stage"
    >
      <Animated.View
        style={[
          {
            position: "absolute",
            left: 0,
            top: 0,
            width: 60,
            height: 40,
            backgroundColor: "#62a0ea",
          },
          style,
        ]}
        testID="box"
      >
        <View
          style={{ width: 20, height: 20, backgroundColor: "#f6d32d" }}
          testID="probe"
        />
      </Animated.View>
    </View>
  )
}

const mountProbe = async (): Promise<void> => {
  await render(
    <Root
      width={400}
      height={120}
    >
      <Probe />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("probe").getWidth()).toBeGreaterThan(0)
  })
}

const STILL_SAMPLES = 3

/**
 * Samples the probe's real x every `every` ms until it has not moved for
 * `STILL_SAMPLES` of them, or the budget runs out.
 *
 * Polling to rest rather than for a fixed duration is deliberate. How long a
 * decay takes in WALL CLOCK depends on the frame interval — upstream's step
 * compounds per frame, so a slower clock (a software-rendered VM under load)
 * makes the same fling last longer — and a test that assumed a duration would
 * be measuring the host's speed rather than the animation's rest condition.
 */
const sampleUntilRest = async (
  budgetMs = 6000,
  every = 100,
): Promise<number[]> => {
  const samples: number[] = [xOf("probe")]
  for (let elapsed = 0; elapsed < budgetMs; elapsed += every) {
    await settle(every)
    samples.push(xOf("probe"))
    const tail = samples.slice(-(STILL_SAMPLES + 1))
    if (
      tail.length === STILL_SAMPLES + 1 &&
      tail.every((position) => position === tail[0])
    ) {
      break
    }
  }
  return samples
}

it("flings a widget: it decelerates, and it stops on its own", async () => {
  await mountProbe()
  const startX = xOf("probe")

  await act(async () => {
    handle.value = withDecay({ velocity: 600 })
  })

  const samples = await sampleUntilRest()
  const steps = samples
    .slice(1)
    .map((position, index) => position - samples[index]!)

  // It moved, forwards, in the direction of the velocity.
  expect(samples.at(-1)! - startX).toBeGreaterThan(20)
  for (const step of steps) {
    expect(step).toBeGreaterThanOrEqual(0)
  }

  // It DECELERATED: the last window in which it moved at all covered a small
  // fraction of what the first one did.
  const moving = steps.filter((step) => step > 0)
  expect(moving.length).toBeGreaterThan(2)
  expect(moving[0]!).toBeGreaterThan(moving.at(-1)! * 4)

  // And it STOPPED — a decay has no target, so nothing but its own rest
  // condition can end it, and an animation that never settled would keep the
  // GLib timeout alive and keep moving. The loop exits on stillness rather
  // than on the budget, so a settled tail is the proof.
  expect(steps.slice(-STILL_SAMPLES)).toEqual(Array(STILL_SAMPLES).fill(0))
})

it("stops exactly on a clamp bound instead of coasting past it", async () => {
  await mountProbe()

  await act(async () => {
    handle.value = withDecay({ velocity: 4000, clamp: [0, 120] })
  })
  await settle(900)

  // The bound is a position, so this is the one number worth asserting
  // exactly: the fling had far more than enough velocity to leave the stage.
  expect(xOf("probe")).toBe(120)
  expect(handle.value).toBe(120)
})

it("withClamp confines another animation on the way to the widget", async () => {
  await mountProbe()

  await act(async () => {
    handle.value = withClamp({ max: 80 }, withTiming(300, { duration: 200 }))
  })
  await settle(400)

  expect(xOf("probe")).toBe(80)
})
