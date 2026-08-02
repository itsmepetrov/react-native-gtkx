// The catalogue as data: what the table actually produces.
//
// The GTK tests next door prove that a handful of these reach a widget. This
// one is the other half of the guard and the reason the presets are a table
// at all — it walks EVERY entry and checks the shape, so a transposed sign or
// a slot that quietly stopped being animated cannot hide behind the fifty-odd
// entries nobody rendered. The spot-checks below quote upstream's own numbers
// (react-native-reanimated 4.5.3, src/layoutReanimation/defaultAnimations/).
import { describe, expect, it } from "vitest"
import {
  FadeIn,
  FadeOut,
  type BuiltLayoutAnimation,
  type LayoutAnimationValues,
} from "../../../src/reanimated-compat/layout-animation"
import * as presets from "../../../src/reanimated-compat/layout-animation-presets"
import {
  EntryExitTransition,
  SequencedTransition,
} from "../../../src/reanimated-compat/layout-transitions"

// A 120x40 row at (0, 40) in an 800x600 window — the shape every geometric
// parameter in the catalogue is expressed against.
const VALUES: LayoutAnimationValues = {
  targetOriginX: 0,
  targetOriginY: 40,
  targetWidth: 120,
  targetHeight: 40,
  targetGlobalOriginX: 0,
  targetGlobalOriginY: 40,
  currentOriginX: 0,
  currentOriginY: 40,
  currentWidth: 120,
  currentHeight: 40,
  currentGlobalOriginX: 0,
  currentGlobalOriginY: 40,
  windowWidth: 800,
  windowHeight: 600,
}

type PresetClass = typeof presets.LayoutAnimationPreset

const catalogue = Object.entries(presets).filter(
  ([name, value]) =>
    name !== "LayoutAnimationPreset" && typeof value === "function",
) as [string, PresetClass][]

const buildOf = (Preset: PresetClass): BuiltLayoutAnimation =>
  new Preset().build()(VALUES)

const transformOf = (
  config: BuiltLayoutAnimation,
  which: "initialValues" | "animations",
): Record<string, unknown>[] =>
  (config[which].transform ?? []) as Record<string, unknown>[]

/** The one slot of an initial transform array, by key. */
const initialTransform = (
  config: BuiltLayoutAnimation,
  key: string,
): unknown => {
  for (const slot of transformOf(config, "initialValues")) {
    if (key in slot) {
      return slot[key]
    }
  }
  return undefined
}

describe("the layout-animation preset catalogue", () => {
  it("ships the sixty builders the mechanism can drive", () => {
    // 76 presets in upstream's catalogue; the 16 that are not here are the
    // twelve `Flip*` (3D perspective rotation) and the four `LightSpeed*`
    // (skew), both refused by name in reanimated-compat/index.tsx.
    expect(catalogue).toHaveLength(60)
    const names = catalogue.map(([name]) => name)
    expect(names.filter((name) => name.startsWith("Flip"))).toEqual([])
    expect(names.filter((name) => name.startsWith("LightSpeed"))).toEqual([])
  })

  it("gives every entry a name of its own", () => {
    for (const [name, Preset] of catalogue) {
      expect(Preset.name).toBe(name)
    }
  })

  it("builds a finite config for every entry, on both call shapes", () => {
    for (const [name, Preset] of catalogue) {
      for (const config of [
        buildOf(Preset),
        // The bare class, which is how `entering={ZoomIn}` reaches us.
        (
          Preset.build() as (
            values: LayoutAnimationValues,
          ) => BuiltLayoutAnimation
        )(VALUES),
      ]) {
        const initial = Object.entries(config.initialValues)
        expect(initial.length, name).toBeGreaterThan(0)
        expect(Object.keys(config.animations).length, name).toBeGreaterThan(0)
        for (const [property, value] of initial) {
          if (property === "transform") {
            for (const slot of transformOf(config, "initialValues")) {
              for (const [key, entry] of Object.entries(slot)) {
                expect(Number.isFinite(entry), `${name}.${key}`).toBe(true)
              }
            }
            continue
          }
          expect(Number.isFinite(value), `${name}.${property}`).toBe(true)
        }
        // Every animated slot lines up with an initial one, which is what the
        // runtime's transform channel keys on.
        expect(
          transformOf(config, "animations").length,
          `${name} transform slots`,
        ).toBe(transformOf(config, "initialValues").length)
      }
    }
  })

  it("keeps upstream's own numbers", () => {
    // Fade*: 25 px of travel, in the direction the name says.
    expect(initialTransform(buildOf(presets.FadeInRight), "translateX")).toBe(
      25,
    )
    expect(initialTransform(buildOf(presets.FadeInLeft), "translateX")).toBe(
      -25,
    )
    expect(initialTransform(buildOf(presets.FadeInUp), "translateY")).toBe(-25)
    expect(initialTransform(buildOf(presets.FadeInDown), "translateY")).toBe(25)
    expect(buildOf(presets.FadeInDown).initialValues.opacity).toBe(0)
    expect(buildOf(presets.FadeOutDown).initialValues.opacity).toBe(1)
    expect(initialTransform(buildOf(presets.FadeOutDown), "translateY")).toBe(0)

    // Slide*: a WINDOW away, with upstream's own asymmetry between
    // `SlideInUp` (a flat -windowHeight) and `SlideInDown` (a window below
    // wherever the engine put the view).
    expect(buildOf(presets.SlideInUp).initialValues.originY).toBe(-600)
    expect(buildOf(presets.SlideInDown).initialValues.originY).toBe(40 + 600)
    expect(buildOf(presets.SlideInLeft).initialValues.originX).toBe(-800)
    expect(buildOf(presets.SlideInRight).initialValues.originX).toBe(800)

    // Bounce*: off-screen, and a scale that starts at nothing.
    expect(initialTransform(buildOf(presets.BounceInDown), "translateY")).toBe(
      600,
    )
    expect(initialTransform(buildOf(presets.BounceIn), "scale")).toBe(0)
    expect(initialTransform(buildOf(presets.BounceOut), "scale")).toBe(1)

    // Rotate*: a quarter turn, plus the corner offset that makes it pivot
    // there — (120/2 - 40/2) = 40.
    const rotateIn = buildOf(presets.RotateInDownLeft)
    expect(initialTransform(rotateIn, "rotate")).toBe(-90)
    expect(initialTransform(rotateIn, "translateX")).toBe(40)
    expect(initialTransform(rotateIn, "translateY")).toBe(-40)

    // Pinwheel: upstream's '5rad', in the degrees the matrix takes.
    expect(initialTransform(buildOf(presets.PinwheelIn), "rotate")).toBeCloseTo(
      (5 * 180) / Math.PI,
      10,
    )
    // Roll: half a turn, and the sign follows the side it rolls from.
    expect(initialTransform(buildOf(presets.RollInLeft), "rotate")).toBe(-180)
    expect(initialTransform(buildOf(presets.RollInRight), "rotate")).toBe(180)

    // Zoom*Easy* measure against the view, not the window.
    expect(initialTransform(buildOf(presets.ZoomInEasyUp), "translateY")).toBe(
      -40,
    )
    expect(initialTransform(buildOf(presets.ZoomInUp), "translateY")).toBe(-600)
  })

  it("takes the fluent chain on every entry", () => {
    for (const [name, Preset] of catalogue) {
      const configured = Preset.duration(500).delay(100)
      expect(configured.getDuration(), name).toBe(500)
      expect(configured.getDelay(), name).toBe(100)
      expect(configured.getMaxDuration(), name).toBe(600)
      // …and a springified one reports the length it was given, which is what
      // arms the retention that keeps an exiting widget on screen.
      expect(Preset.springify(700).getMaxDuration(), name).toBe(700)
    }
  })

  it("lets ZoomInRotate be given its own angle", () => {
    // Upstream's default is the bare number 0.3, in radians.
    expect(
      initialTransform(buildOf(presets.ZoomInRotate), "rotate"),
    ).toBeCloseTo((0.3 * 180) / Math.PI, 10)
    expect(
      initialTransform(
        presets.ZoomInRotate.rotate("1").build()(VALUES),
        "rotate",
      ),
    ).toBeCloseTo(180 / Math.PI, 10)
    // A united angle is parsed rather than concatenated into '90degrad',
    // which is what upstream's template literal makes of it.
    expect(
      initialTransform(
        presets.ZoomInRotate.rotate("90deg").build()(VALUES),
        "rotate",
      ),
    ).toBe(90)
  })

  it("honours withInitialValues, as upstream's builders do", () => {
    const config = presets.ZoomIn.withInitialValues({
      transform: [{ scale: 0.5 }],
    }).build()(VALUES)
    expect(initialTransform(config, "scale")).toBe(0.5)
  })
})

describe("EntryExitTransition", () => {
  // The one transition that is a COMPOSITION rather than a curve: it plays a
  // whole exit and then a whole entry on the same view. Its merge logic has
  // no geometry of its own to assert on, so the guard is the built config —
  // the shape upstream produces, keyed by property.
  const built = (): BuiltLayoutAnimation =>
    new EntryExitTransition().entering(FadeIn).exiting(FadeOut).build()(VALUES)

  it("defaults to fading out and back in, over the moved rect", () => {
    const config = built()
    // Both halves on one property means one sequence, not two animations
    // fighting over the same slot.
    expect(config.animations.opacity).toBeTruthy()
    expect(config.initialValues.opacity).toBe(1)
    // …and the rect still lands, held back by the length of the exit.
    for (const property of ["originX", "originY", "width", "height"]) {
      expect(config.animations[property], property).toBeTruthy()
    }
    expect(config.initialValues.originY).toBe(VALUES.currentOriginY)
  })

  it("adds the two lengths, so a retention outlives both", () => {
    // FadeOut declares 300 ms; the transition's own 300 runs after it.
    expect(new EntryExitTransition().getMaxDuration()).toBe(600)
    expect(
      new EntryExitTransition().exiting(FadeOut.duration(500)).getMaxDuration(),
    ).toBe(800)
  })

  it("takes a preset from the catalogue on either side", () => {
    const config = new EntryExitTransition()
      .entering(presets.ZoomIn)
      .exiting(presets.ZoomOut)
      .build()(VALUES)
    // Both sides animate `scale`, so the merged array carries a slot for each
    // rather than one overwriting the other.
    const transform = config.animations.transform as Record<string, unknown>[]
    expect(transform.filter((slot) => "scale" in slot)).toHaveLength(2)
  })
})

describe("SequencedTransition", () => {
  it("reverses which axis moves first, and nothing else", () => {
    const forward = new SequencedTransition().build()(VALUES)
    const reversed = SequencedTransition.reverse().build()(VALUES)
    for (const property of ["originX", "originY", "width", "height"]) {
      expect(forward.initialValues[property], property).toBe(
        reversed.initialValues[property],
      )
    }
    // Upstream's default for this transition is 500 ms, not the usual 300.
    expect(new SequencedTransition().getDuration()).toBe(500)
    expect(new SequencedTransition().duration(200).getDuration()).toBe(200)
  })
})
