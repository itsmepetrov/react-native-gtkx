// The layout-animation preset catalogue: `BounceIn*`, `Fade*`, `Pinwheel*`,
// `Roll*`, `Rotate*`, `Slide*`, `Stretch*` and `Zoom*` — sixty builders that
// are all the same builder.
//
// Upstream writes each of them as a class with a hand-written `build()`, and
// every one of those bodies is the same three lines around a different pair of
// numbers: where a property starts, where it ends, and (for the bounces) which
// fractions of the duration the overshoots take. So the numbers are the data
// here and the body is written once — which is not tidiness for its own sake:
// sixty hand-copied bodies are sixty chances to transpose a sign, and the
// table below can be read against upstream's own source line by line.
//
// EVERY PARAMETER IS UPSTREAM'S, from react-native-reanimated 4.5.3
// (src/layoutReanimation/defaultAnimations/). The 25 px of a `FadeInRight`,
// the 0.55/0.15/0.15/0.15 split of a bounce, the 5 radians of a `PinwheelIn`,
// `SlideInUp` starting at `-windowHeight` where `SlideInDown` starts at
// `targetOriginY + windowHeight` (upstream is asymmetric there, and this
// mirrors it rather than tidying it) — all of it is quoted, not invented.
//
// WHAT IS NOT HERE, and why it is refused by name rather than approximated:
// the twelve `Flip*` builders need `perspective` with `rotateX`/`rotateY`, and
// the four `LightSpeed*` need `skewX`. This platform folds a transform array
// into ONE 2D affine matrix (src/style/transform.ts, measured in
// docs/research/transforms.md), which has no third axis to rotate about and
// deliberately omits skew. See the refusals in index.tsx.
import { withSequence, withTiming } from "./animation"
import {
  AnimationBuilder,
  type BuiltLayoutAnimation,
  type LayoutAnimationValues,
} from "./layout-animation"

/** A constant, or a number derived from the rects the builder was handed. */
type Measure = number | ((values: LayoutAnimationValues) => number)

const measure = (value: Measure, values: LayoutAnimationValues): number =>
  typeof value === "function" ? value(values) : value

/**
 * One animated property: where it starts, and where it goes.
 *
 * `to` is animated with the BUILDER's animation, so `.springify()`,
 * `.duration()` and `.easing()` all reach it. `steps` is an explicit timing
 * track — upstream writes the bounce curves as literal `withTiming`
 * sequences, and a spring has no way to express "overshoot to 1.2, settle
 * through 0.9 and 1.1" — where each step is a target plus the fraction of the
 * builder's duration it takes.
 */
type Track = {
  from: Measure
  to?: Measure
  steps?: readonly (readonly [Measure, number])[]
}

/**
 * The transform keys the catalogue uses, which are exactly the keys
 * src/style/transform.ts folds into its matrix. `rotate` is in DEGREES here:
 * upstream spells it `'-90deg'`/`'5rad'`, and a string cannot go through a
 * numeric animation — `parseAngle` reads a bare number as degrees, so the
 * matrix that reaches GTK is the same one either spelling produces.
 */
type TransformKey =
  "translateX" | "translateY" | "scale" | "scaleX" | "scaleY" | "rotate"

type TransformTrack = Track & { key: TransformKey }

type PresetSpec = {
  opacity?: Track
  /** `SlideIn*`/`SlideOut*`: the only presets that move the layout origin. */
  origin?: Track & { axis: "x" | "y" }
  transform?: readonly TransformTrack[]
}

const EMPTY_SPEC: PresetSpec = {}

/**
 * The one preset body. Every entry in the catalogue is an empty subclass of
 * this carrying its own {@link PresetSpec}.
 */
export class LayoutAnimationPreset extends AnimationBuilder {
  /**
   * Replaced by every generated subclass — see `definePreset`. A method
   * rather than a field so the two `.rotate()`-aware presets can compute
   * theirs from builder state that is only settled by the time `build()` runs.
   */
  protected spec(): PresetSpec {
    return EMPTY_SPEC
  }

  override build(): (values: LayoutAnimationValues) => BuiltLayoutAnimation {
    const spec = this.spec()
    const animate = this.animation()
    const delayMs = this.getDelay()
    const totalDuration = this.getDuration()
    const callback = this.callbackV
    const extra = this.initialValuesV

    const run = (track: Track, values: LayoutAnimationValues): unknown => {
      if (track.steps) {
        const specs = track.steps.map(([target, fraction]) =>
          withTiming(measure(target, values), {
            duration: totalDuration * fraction,
          }),
        )
        return this.delayed(
          delayMs,
          specs.length === 1 ? specs[0]! : withSequence(...specs),
        )
      }
      return this.delayed(
        delayMs,
        animate(measure(track.to ?? track.from, values)),
      )
    }

    return (values) => {
      const initialValues: Record<string, unknown> = {}
      const animations: Record<string, unknown> = {}

      if (spec.opacity) {
        initialValues.opacity = measure(spec.opacity.from, values)
        animations.opacity = run(spec.opacity, values)
      }
      if (spec.origin) {
        const key = spec.origin.axis === "x" ? "originX" : "originY"
        initialValues[key] = measure(spec.origin.from, values)
        animations[key] = run(spec.origin, values)
      }
      if (spec.transform) {
        // Both arrays are built from the same list in the same order, so a
        // slot's initial value and its animation always line up by index —
        // which is what the runtime's transform channel keys on.
        initialValues.transform = spec.transform.map((track) => ({
          [track.key]: measure(track.from, values),
        }))
        animations.transform = spec.transform.map((track) => ({
          [track.key]: run(track, values),
        }))
      }

      return {
        initialValues: { ...initialValues, ...extra },
        animations,
        callback,
      }
    }
  }
}

/**
 * Mints one catalogue entry. The class is empty apart from its spec, so
 * `entering={ZoomIn}` (the class) and `entering={ZoomIn.duration(400)}` (an
 * instance) both work through `AnimationBuilder`'s existing statics.
 */
const definePreset = (
  name: string,
  spec: PresetSpec,
): typeof LayoutAnimationPreset => {
  const Preset = class extends LayoutAnimationPreset {
    protected override spec(): PresetSpec {
      return spec
    }
  }
  // So a stack trace, a devtools inspector and `Preset.name` all say
  // `ZoomInRotate` rather than the anonymous class expression above.
  Object.defineProperty(Preset, "name", { value: name })
  return Preset
}

// --- the numbers ---------------------------------------------------------

const windowWidth = (values: LayoutAnimationValues): number =>
  values.windowWidth
const negWindowWidth = (values: LayoutAnimationValues): number =>
  -values.windowWidth
const windowHeight = (values: LayoutAnimationValues): number =>
  values.windowHeight
const negWindowHeight = (values: LayoutAnimationValues): number =>
  -values.windowHeight

/** Degrees, from upstream's radians. `'5rad'` is 286.479°. */
const rad = (turns: number): number => (turns * 180) / Math.PI

// The distance a quarter-turn about the CENTRE moves a corner, which is what
// `Rotate*` translates by so the view appears to pivot on that corner.
const targetPivot = (values: LayoutAnimationValues): number =>
  values.targetWidth / 2 - values.targetHeight / 2
const negTargetPivot = (values: LayoutAnimationValues): number =>
  -targetPivot(values)
const currentPivot = (values: LayoutAnimationValues): number =>
  values.currentWidth / 2 - values.currentHeight / 2
const negCurrentPivot = (values: LayoutAnimationValues): number =>
  -currentPivot(values)

const targetHeight = (values: LayoutAnimationValues): number =>
  values.targetHeight
const negTargetHeight = (values: LayoutAnimationValues): number =>
  -values.targetHeight
const currentHeight = (values: LayoutAnimationValues): number =>
  values.currentHeight
const negCurrentHeight = (values: LayoutAnimationValues): number =>
  -values.currentHeight

const fadeIn: Track = { from: 0, to: 1 }
const fadeOut: Track = { from: 1, to: 0 }

// Upstream's bounce curve: a long overshoot, then two small corrections, then
// the target — 55 % / 15 % / 15 % / 15 % of the duration. Entering runs it
// forwards, exiting runs the corrections first and leaves last.
const bounceIn = (
  overshoot: number,
  back: number,
  settle: number,
  from: Measure,
  to: Measure = 0,
): Track => ({
  from,
  steps: [
    [overshoot, 0.55],
    [back, 0.15],
    [settle, 0.15],
    [to, 0.15],
  ],
})

const bounceOut = (
  first: number,
  second: number,
  third: number,
  to: Measure,
  from: Measure = 0,
): Track => ({
  from,
  steps: [
    [first, 0.15],
    [second, 0.15],
    [third, 0.15],
    [to, 0.55],
  ],
})

// --- Fade ----------------------------------------------------------------

export const FadeInRight = definePreset("FadeInRight", {
  opacity: fadeIn,
  transform: [{ key: "translateX", from: 25, to: 0 }],
})
export const FadeInLeft = definePreset("FadeInLeft", {
  opacity: fadeIn,
  transform: [{ key: "translateX", from: -25, to: 0 }],
})
export const FadeInUp = definePreset("FadeInUp", {
  opacity: fadeIn,
  transform: [{ key: "translateY", from: -25, to: 0 }],
})
export const FadeInDown = definePreset("FadeInDown", {
  opacity: fadeIn,
  transform: [{ key: "translateY", from: 25, to: 0 }],
})
export const FadeOutRight = definePreset("FadeOutRight", {
  opacity: fadeOut,
  transform: [{ key: "translateX", from: 0, to: 25 }],
})
export const FadeOutLeft = definePreset("FadeOutLeft", {
  opacity: fadeOut,
  transform: [{ key: "translateX", from: 0, to: -25 }],
})
export const FadeOutUp = definePreset("FadeOutUp", {
  opacity: fadeOut,
  transform: [{ key: "translateY", from: 0, to: -25 }],
})
export const FadeOutDown = definePreset("FadeOutDown", {
  opacity: fadeOut,
  transform: [{ key: "translateY", from: 0, to: 25 }],
})

// --- Bounce --------------------------------------------------------------

export const BounceIn = definePreset("BounceIn", {
  transform: [{ key: "scale", ...bounceIn(1.2, 0.9, 1.1, 0, 1) }],
})
export const BounceInDown = definePreset("BounceInDown", {
  transform: [{ key: "translateY", ...bounceIn(-20, 10, -10, windowHeight) }],
})
export const BounceInUp = definePreset("BounceInUp", {
  transform: [{ key: "translateY", ...bounceIn(20, -10, 10, negWindowHeight) }],
})
export const BounceInLeft = definePreset("BounceInLeft", {
  transform: [{ key: "translateX", ...bounceIn(20, -10, 10, negWindowWidth) }],
})
export const BounceInRight = definePreset("BounceInRight", {
  transform: [{ key: "translateX", ...bounceIn(-20, 10, -10, windowWidth) }],
})
export const BounceOut = definePreset("BounceOut", {
  transform: [{ key: "scale", ...bounceOut(1.1, 0.9, 1.2, 0, 1) }],
})
export const BounceOutDown = definePreset("BounceOutDown", {
  transform: [{ key: "translateY", ...bounceOut(-10, 10, -20, windowHeight) }],
})
export const BounceOutUp = definePreset("BounceOutUp", {
  transform: [
    { key: "translateY", ...bounceOut(10, -10, 20, negWindowHeight) },
  ],
})
export const BounceOutLeft = definePreset("BounceOutLeft", {
  transform: [{ key: "translateX", ...bounceOut(10, -10, 20, negWindowWidth) }],
})
export const BounceOutRight = definePreset("BounceOutRight", {
  transform: [{ key: "translateX", ...bounceOut(-10, 10, -20, windowWidth) }],
})

// --- Pinwheel ------------------------------------------------------------

export const PinwheelIn = definePreset("PinwheelIn", {
  opacity: fadeIn,
  transform: [
    { key: "scale", from: 0, to: 1 },
    { key: "rotate", from: rad(5), to: 0 },
  ],
})
export const PinwheelOut = definePreset("PinwheelOut", {
  opacity: fadeOut,
  transform: [
    { key: "scale", from: 1, to: 0 },
    { key: "rotate", from: 0, to: rad(5) },
  ],
})

// --- Roll ----------------------------------------------------------------

export const RollInLeft = definePreset("RollInLeft", {
  transform: [
    { key: "translateX", from: negWindowWidth, to: 0 },
    { key: "rotate", from: -180, to: 0 },
  ],
})
export const RollInRight = definePreset("RollInRight", {
  transform: [
    { key: "translateX", from: windowWidth, to: 0 },
    { key: "rotate", from: 180, to: 0 },
  ],
})
export const RollOutLeft = definePreset("RollOutLeft", {
  transform: [
    { key: "translateX", from: 0, to: negWindowWidth },
    { key: "rotate", from: 0, to: -180 },
  ],
})
export const RollOutRight = definePreset("RollOutRight", {
  transform: [
    { key: "translateX", from: 0, to: windowWidth },
    { key: "rotate", from: 0, to: 180 },
  ],
})

// --- Rotate --------------------------------------------------------------

export const RotateInDownLeft = definePreset("RotateInDownLeft", {
  opacity: fadeIn,
  transform: [
    { key: "rotate", from: -90, to: 0 },
    { key: "translateX", from: targetPivot, to: 0 },
    { key: "translateY", from: negTargetPivot, to: 0 },
  ],
})
export const RotateInDownRight = definePreset("RotateInDownRight", {
  opacity: fadeIn,
  transform: [
    { key: "rotate", from: 90, to: 0 },
    { key: "translateX", from: negTargetPivot, to: 0 },
    { key: "translateY", from: negTargetPivot, to: 0 },
  ],
})
export const RotateInUpLeft = definePreset("RotateInUpLeft", {
  opacity: fadeIn,
  transform: [
    { key: "rotate", from: 90, to: 0 },
    { key: "translateX", from: targetPivot, to: 0 },
    { key: "translateY", from: targetPivot, to: 0 },
  ],
})
export const RotateInUpRight = definePreset("RotateInUpRight", {
  opacity: fadeIn,
  transform: [
    { key: "rotate", from: -90, to: 0 },
    { key: "translateX", from: negTargetPivot, to: 0 },
    { key: "translateY", from: targetPivot, to: 0 },
  ],
})
export const RotateOutDownLeft = definePreset("RotateOutDownLeft", {
  opacity: fadeOut,
  transform: [
    { key: "rotate", from: 0, to: 90 },
    { key: "translateX", from: 0, to: currentPivot },
    { key: "translateY", from: 0, to: currentPivot },
  ],
})
export const RotateOutDownRight = definePreset("RotateOutDownRight", {
  opacity: fadeOut,
  transform: [
    { key: "rotate", from: 0, to: -90 },
    { key: "translateX", from: 0, to: negCurrentPivot },
    { key: "translateY", from: 0, to: currentPivot },
  ],
})
export const RotateOutUpLeft = definePreset("RotateOutUpLeft", {
  opacity: fadeOut,
  transform: [
    { key: "rotate", from: 0, to: -90 },
    { key: "translateX", from: 0, to: currentPivot },
    { key: "translateY", from: 0, to: negCurrentPivot },
  ],
})
export const RotateOutUpRight = definePreset("RotateOutUpRight", {
  opacity: fadeOut,
  transform: [
    { key: "rotate", from: 0, to: 90 },
    { key: "translateX", from: 0, to: negCurrentPivot },
    { key: "translateY", from: 0, to: negCurrentPivot },
  ],
})

// --- Slide ---------------------------------------------------------------
//
// The only presets that animate the layout ORIGIN rather than a transform,
// and the runtime turns that into the same paint-only translation
// `LinearTransition` gets. Upstream's own asymmetries are kept: `SlideInUp`
// starts at `-windowHeight` flat while `SlideInDown` starts a window below
// where the view landed, and the `SlideOut*` targets are clamped so a view
// that already sits off-screen still leaves.

export const SlideInRight = definePreset("SlideInRight", {
  origin: {
    axis: "x",
    from: (values) => values.targetOriginX + values.windowWidth,
    to: (values) => values.targetOriginX,
  },
})
export const SlideInLeft = definePreset("SlideInLeft", {
  origin: {
    axis: "x",
    from: (values) => values.targetOriginX - values.windowWidth,
    to: (values) => values.targetOriginX,
  },
})
export const SlideOutRight = definePreset("SlideOutRight", {
  origin: {
    axis: "x",
    from: (values) => values.currentOriginX,
    to: (values) =>
      Math.max(values.currentOriginX + values.windowWidth, values.windowWidth),
  },
})
export const SlideOutLeft = definePreset("SlideOutLeft", {
  origin: {
    axis: "x",
    from: (values) => values.currentOriginX,
    to: (values) =>
      Math.min(values.currentOriginX - values.windowWidth, -values.windowWidth),
  },
})
export const SlideInUp = definePreset("SlideInUp", {
  origin: {
    axis: "y",
    from: negWindowHeight,
    to: (values) => values.targetOriginY,
  },
})
export const SlideInDown = definePreset("SlideInDown", {
  origin: {
    axis: "y",
    from: (values) => values.targetOriginY + values.windowHeight,
    to: (values) => values.targetOriginY,
  },
})
export const SlideOutUp = definePreset("SlideOutUp", {
  origin: {
    axis: "y",
    from: (values) => values.currentOriginY,
    to: (values) =>
      Math.min(
        values.currentOriginY - values.windowHeight,
        -values.windowHeight,
      ),
  },
})
export const SlideOutDown = definePreset("SlideOutDown", {
  origin: {
    axis: "y",
    from: (values) => values.currentOriginY,
    to: (values) =>
      Math.max(
        values.currentOriginY + values.windowHeight,
        values.windowHeight,
      ),
  },
})

// --- Stretch -------------------------------------------------------------

export const StretchInX = definePreset("StretchInX", {
  transform: [{ key: "scaleX", from: 0, to: 1 }],
})
export const StretchInY = definePreset("StretchInY", {
  transform: [{ key: "scaleY", from: 0, to: 1 }],
})
export const StretchOutX = definePreset("StretchOutX", {
  transform: [{ key: "scaleX", from: 1, to: 0 }],
})
export const StretchOutY = definePreset("StretchOutY", {
  transform: [{ key: "scaleY", from: 1, to: 0 }],
})

// --- Zoom ----------------------------------------------------------------

export const ZoomIn = definePreset("ZoomIn", {
  transform: [{ key: "scale", from: 0, to: 1 }],
})
export const ZoomInLeft = definePreset("ZoomInLeft", {
  transform: [
    { key: "translateX", from: negWindowWidth, to: 0 },
    { key: "scale", from: 0, to: 1 },
  ],
})
export const ZoomInRight = definePreset("ZoomInRight", {
  transform: [
    { key: "translateX", from: windowWidth, to: 0 },
    { key: "scale", from: 0, to: 1 },
  ],
})
export const ZoomInUp = definePreset("ZoomInUp", {
  transform: [
    { key: "translateY", from: negWindowHeight, to: 0 },
    { key: "scale", from: 0, to: 1 },
  ],
})
export const ZoomInDown = definePreset("ZoomInDown", {
  transform: [
    { key: "translateY", from: windowHeight, to: 0 },
    { key: "scale", from: 0, to: 1 },
  ],
})
export const ZoomInEasyUp = definePreset("ZoomInEasyUp", {
  transform: [
    { key: "translateY", from: negTargetHeight, to: 0 },
    { key: "scale", from: 0, to: 1 },
  ],
})
export const ZoomInEasyDown = definePreset("ZoomInEasyDown", {
  transform: [
    { key: "translateY", from: targetHeight, to: 0 },
    { key: "scale", from: 0, to: 1 },
  ],
})
export const ZoomOut = definePreset("ZoomOut", {
  transform: [{ key: "scale", from: 1, to: 0 }],
})
export const ZoomOutLeft = definePreset("ZoomOutLeft", {
  transform: [
    { key: "translateX", from: 0, to: negWindowWidth },
    { key: "scale", from: 1, to: 0 },
  ],
})
export const ZoomOutRight = definePreset("ZoomOutRight", {
  transform: [
    { key: "translateX", from: 0, to: windowWidth },
    { key: "scale", from: 1, to: 0 },
  ],
})
export const ZoomOutUp = definePreset("ZoomOutUp", {
  transform: [
    { key: "translateY", from: 0, to: negWindowHeight },
    { key: "scale", from: 1, to: 0 },
  ],
})
export const ZoomOutDown = definePreset("ZoomOutDown", {
  transform: [
    { key: "translateY", from: 0, to: windowHeight },
    { key: "scale", from: 1, to: 0 },
  ],
})
export const ZoomOutEasyUp = definePreset("ZoomOutEasyUp", {
  transform: [
    { key: "translateY", from: 0, to: negCurrentHeight },
    { key: "scale", from: 1, to: 0 },
  ],
})
export const ZoomOutEasyDown = definePreset("ZoomOutEasyDown", {
  transform: [
    { key: "translateY", from: 0, to: currentHeight },
    { key: "scale", from: 1, to: 0 },
  ],
})

// The two that read `.rotate()`, which is why they are classes of their own
// rather than table entries: the angle is a builder parameter, so the spec
// cannot be frozen at definition time.

/** `ZoomIn` with a spin. `.rotate()` sets the angle; upstream's default is 0.3 rad. */
export class ZoomInRotate extends LayoutAnimationPreset {
  protected override spec(): PresetSpec {
    return {
      transform: [
        { key: "scale", from: 0, to: 1 },
        { key: "rotate", from: this.getRotationDegrees(rad(0.3)), to: 0 },
      ],
    }
  }
}

/** `ZoomOut` with a spin. `.rotate()` sets the angle; upstream's default is 0.3 rad. */
export class ZoomOutRotate extends LayoutAnimationPreset {
  protected override spec(): PresetSpec {
    return {
      transform: [
        { key: "scale", from: 1, to: 0 },
        { key: "rotate", from: 0, to: this.getRotationDegrees(rad(0.3)) },
      ],
    }
  }
}
