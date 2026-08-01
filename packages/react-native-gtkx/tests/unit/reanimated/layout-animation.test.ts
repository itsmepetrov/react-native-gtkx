// The builders, as data. Everything here is what `build()` produces, without
// a widget in sight — the runtime that turns one of these into GTK writes is
// covered by tests/gtk/reanimated/layout-animation.gtk.test.tsx, which
// asserts on geometry GTK computed rather than on the config below.
import { describe, expect, it } from "vitest"
import { isAnimationSpec } from "../../../src/reanimated-compat/animation"
import { Easing } from "../../../src/reanimated-compat/easing"
import {
  FadeIn,
  FadeOut,
  Keyframe,
  LinearTransition,
  type LayoutAnimationValues,
} from "../../../src/reanimated-compat/layout-animation"

const VALUES: LayoutAnimationValues = {
  targetOriginX: 100,
  targetOriginY: 200,
  targetWidth: 30,
  targetHeight: 40,
  targetGlobalOriginX: 100,
  targetGlobalOriginY: 200,
  currentOriginX: 10,
  currentOriginY: 20,
  currentWidth: 30,
  currentHeight: 40,
  currentGlobalOriginX: 10,
  currentGlobalOriginY: 20,
  windowWidth: 800,
  windowHeight: 600,
}

// The descriptors are opaque by design (upstream types `withTiming(1)` as
// `number`, and this platform mirrors that), so a test reads them back the
// way the runtime does.
type Spec = {
  kind: string
  toValue?: number
  delayMs?: number
  animation?: Spec
  animations?: Spec[]
  config?: Record<string, unknown>
}

const spec = (value: unknown): Spec => {
  expect(isAnimationSpec(value)).toBe(true)
  return value as unknown as Spec
}

describe("FadeIn / FadeOut", () => {
  it("fades from nothing to whole, and back", () => {
    const entering = FadeIn.build()(VALUES)
    expect(entering.initialValues).toEqual({ opacity: 0 })
    expect(spec(entering.animations.opacity).toValue).toBe(1)

    const exiting = FadeOut.build()(VALUES)
    expect(exiting.initialValues).toEqual({ opacity: 1 })
    expect(spec(exiting.animations.opacity).toValue).toBe(0)
  })

  it("is configurable as the class and as an instance, identically", () => {
    // `entering={FadeIn}` and `entering={FadeIn.duration(400)}` are both real
    // call sites, which is why every chainable method exists twice.
    const fromStatic = FadeIn.duration(400).build()(VALUES)
    const fromInstance = new FadeIn().duration(400).build()(VALUES)
    expect(spec(fromStatic.animations.opacity).config?.duration).toBe(400)
    expect(spec(fromInstance.animations.opacity).config?.duration).toBe(400)
  })

  it("carries the easing and wraps a delay around the animation", () => {
    const built = FadeIn.duration(120).delay(50).easing(Easing.linear).build()(
      VALUES,
    )
    const delayed = spec(built.animations.opacity)
    expect(delayed.kind).toBe("delay")
    expect(delayed.delayMs).toBe(50)
    expect(delayed.animation?.toValue).toBe(1)
    expect(delayed.animation?.config?.easing).toBe(Easing.linear)
  })

  it("springifies into a spring rather than a timing", () => {
    const built = FadeOut.springify().damping(20).mass(2).build()(VALUES)
    const animation = spec(built.animations.opacity)
    expect(animation.kind).toBe("spring")
    expect(animation.config).toMatchObject({ damping: 20, mass: 2 })
  })

  it("reports the length that arms the retention fallback", () => {
    expect(FadeOut.getDuration()).toBe(300)
    expect(FadeOut.duration(900).getDuration()).toBe(900)
    expect(FadeOut.delay(120).getDelay()).toBe(120)
    expect(FadeOut.duration(900).delay(120).getMaxDuration()).toBe(1020)
    // `randomDelay` draws a new number on every `getDelay()` — deliberately,
    // so a list staggers — so the bound a retention arms from has to be the
    // UPPER one rather than one of the draws.
    const random = FadeOut.duration(100).randomDelay()
    expect(random.getMaxDuration()).toBe(1100)
    expect(random.getDelay()).toBeLessThan(1000)
  })

  it("lets withInitialValues override where the fade starts", () => {
    const built = FadeIn.withInitialValues({ opacity: 0.5 }).build()(VALUES)
    expect(built.initialValues.opacity).toBe(0.5)
  })

  it("passes the callback through to the built config", () => {
    const callback = (): void => undefined
    expect(FadeOut.withCallback(callback).build()(VALUES).callback).toBe(
      callback,
    )
  })
})

describe("LinearTransition", () => {
  it("walks the origin from where the child was to where the engine put it", () => {
    const built = LinearTransition.build()(VALUES)
    expect(built.initialValues).toEqual({
      originX: 10,
      originY: 20,
      width: 30,
      height: 40,
    })
    expect(spec(built.animations.originX).toValue).toBe(100)
    expect(spec(built.animations.originY).toValue).toBe(200)
  })

  it("still emits width and height, which the runtime applies rather than drives", () => {
    // Upstream's own four properties, produced faithfully: the decision to
    // not animate a size is the runtime's, and it is a measured one.
    const built = LinearTransition.build()(VALUES)
    expect(Object.keys(built.animations).sort()).toEqual([
      "height",
      "originX",
      "originY",
      "width",
    ])
  })
})

describe("Keyframe", () => {
  it("compiles each property into a sequence whose steps are the gaps", () => {
    const built = new Keyframe({
      0: { opacity: 0 },
      25: { opacity: 1 },
      100: { opacity: 0.5 },
    })
      .duration(1000)
      .build()(VALUES)

    expect(built.initialValues.opacity).toBe(0)
    const sequence = spec(built.animations.opacity)
    expect(sequence.kind).toBe("sequence")
    expect(sequence.animations?.map((step) => step.toValue)).toEqual([1, 0.5])
    expect(sequence.animations?.map((step) => step.config?.duration)).toEqual([
      250, 750,
    ])
  })

  it("accepts `from` and `to` as the 0 and 100 offsets", () => {
    const built = new Keyframe({
      from: { opacity: 0 },
      to: { opacity: 1 },
    }).build()(VALUES)
    expect(built.initialValues.opacity).toBe(0)
    expect(spec(built.animations.opacity).toValue).toBe(1)
  })

  it("keeps a transform entry in its slot in the composition order", () => {
    const built = new Keyframe({
      0: { transform: [{ translateX: 0 }, { scale: 0.5 }] },
      100: { transform: [{ translateX: 40 }, { scale: 1 }] },
    })
      .duration(200)
      .build()(VALUES)

    expect(built.initialValues.transform).toEqual([
      { translateX: 0 },
      { scale: 0.5 },
    ])
    const parts = built.animations.transform as Record<string, unknown>[]
    expect(spec(parts[0]!.translateX).toValue).toBe(40)
    expect(spec(parts[1]!.scale).toValue).toBe(1)
  })

  it("applies a per-keyframe easing to the step that ends there, as CSS does", () => {
    const built = new Keyframe({
      0: { opacity: 0 },
      100: { opacity: 1, easing: Easing.linear },
    }).build()(VALUES)
    expect(spec(built.animations.opacity).config?.easing).toBe(Easing.linear)
  })

  it("hands a value it cannot interpolate through as a plain initial value", () => {
    // Not dropped: it reaches the built config, where the runtime names the
    // property in a warning rather than animating nothing quietly.
    const built = new Keyframe({
      0: { opacity: 0, backgroundColor: "#ff0000" },
      100: { opacity: 1, backgroundColor: "#00ff00" },
    }).build()(VALUES)
    expect(built.initialValues.backgroundColor).toBe("#ff0000")
    expect(built.animations.backgroundColor).toBeUndefined()
    expect(spec(built.animations.opacity).toValue).toBe(1)
  })

  it("refuses a track with no start, a bad offset, and a spring", () => {
    expect(() => new Keyframe({ 100: { opacity: 1 } }).build()).toThrow(
      /`0` \(or `from`\)/,
    )
    expect(() =>
      new Keyframe({ 0: { opacity: 0 }, half: { opacity: 1 } }).build(),
    ).toThrow(/percentages/)
    expect(() => new Keyframe({ 0: { opacity: 0 } }).springify()).toThrow(
      /cannot be springified/,
    )
  })
})
