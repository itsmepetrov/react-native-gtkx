// The `layout` transitions beyond `LinearTransition`: `CurvedTransition`,
// `FadingTransition`, `JumpingTransition`, `SequencedTransition` and
// `EntryExitTransition`.
//
// All five emit the same four properties `LinearTransition` does — `originX`,
// `originY`, `width`, `height` — and differ only in the curve each takes to
// get there, so they need nothing from the runtime that is not already
// wired. The one thing they inherit with that is its documented difference:
// the position animates (as a paint-only translation) and a size change lands
// immediately, because a Yoga pass per frame costs what the TREE costs rather
// than what the value costs (docs/research/animated-colors.md). Where a
// transition's only parameter is a size curve — `CurvedTransition`'s
// `.easingWidth()`/`.easingHeight()` — that parameter is therefore accepted
// and ignored, and the row is in docs/api.md's differences table.
//
// Parameters are upstream's, from react-native-reanimated 4.5.3
// (src/layoutReanimation/defaultTransitions/): the four default easings of a
// curved transition, the 500 ms default of a fading and a sequenced one
// against the 300 ms everything else uses, the out-exp/bounce pair a jump
// arcs through.
import { withDelay, withSequence, withTiming } from "./animation"
import {
  Easing,
  type EasingFunction,
  type EasingFunctionFactory,
} from "./easing"
import {
  AnimationBuilder,
  FadeIn,
  FadeOut,
  type BuiltLayoutAnimation,
  type LayoutAnimationBuilderLike,
  type LayoutAnimationValues,
} from "./layout-animation"

type AnyEasing = EasingFunction | EasingFunctionFactory

/**
 * A builder, or the builder CLASS itself: `.entering(FadeIn)` and
 * `.entering(FadeIn.duration(400))` are both upstream's call surface.
 */
export type LayoutAnimationSource =
  LayoutAnimationBuilderLike | typeof AnimationBuilder

/**
 * The two methods {@link EntryExitTransition} needs off either shape. They
 * exist on both — `AnimationBuilder` declares each one twice, as an instance
 * method and as a static that makes an instance first — but the statics carry
 * a `this` constraint that no structural type can satisfy, so the split is
 * bridged here once rather than at every call.
 */
type ResolvedBuilder = {
  build(): (values: LayoutAnimationValues) => BuiltLayoutAnimation
  getDuration(): number
}

const resolveBuilder = (source: LayoutAnimationSource): ResolvedBuilder =>
  source as unknown as ResolvedBuilder

/**
 * Walks a view to its new rect with a SEPARATE easing per axis, which is what
 * makes the path a curve rather than a straight line: an ease-in on x against
 * an ease-out on y bends the trajectory.
 *
 * `.easingWidth()` and `.easingHeight()` are accepted and ignored — see the
 * header, and docs/api.md.
 */
export class CurvedTransition extends AnimationBuilder {
  easingXV: AnyEasing = Easing.in(Easing.ease)
  easingYV: AnyEasing = Easing.out(Easing.ease)
  easingWidthV: AnyEasing = Easing.in(Easing.exp)
  easingHeightV: AnyEasing = Easing.out(Easing.exp)

  easingX(easing: AnyEasing): this {
    this.easingXV = easing
    return this
  }

  easingY(easing: AnyEasing): this {
    this.easingYV = easing
    return this
  }

  easingWidth(easing: AnyEasing): this {
    this.easingWidthV = easing
    return this
  }

  easingHeight(easing: AnyEasing): this {
    this.easingHeightV = easing
    return this
  }

  static easingX(easing: AnyEasing): CurvedTransition {
    return new CurvedTransition().easingX(easing)
  }

  static easingY(easing: AnyEasing): CurvedTransition {
    return new CurvedTransition().easingY(easing)
  }

  static easingWidth(easing: AnyEasing): CurvedTransition {
    return new CurvedTransition().easingWidth(easing)
  }

  static easingHeight(easing: AnyEasing): CurvedTransition {
    return new CurvedTransition().easingHeight(easing)
  }

  override build(): (values: LayoutAnimationValues) => BuiltLayoutAnimation {
    const delayMs = this.getDelay()
    const duration = this.getDuration()
    const callback = this.callbackV
    const easingX = this.easingXV
    const easingY = this.easingYV
    const easingWidth = this.easingWidthV
    const easingHeight = this.easingHeightV
    return (values) => ({
      initialValues: {
        originX: values.currentOriginX,
        originY: values.currentOriginY,
        width: values.currentWidth,
        height: values.currentHeight,
      },
      animations: {
        originX: this.delayed(
          delayMs,
          withTiming(values.targetOriginX, { duration, easing: easingX }),
        ),
        originY: this.delayed(
          delayMs,
          withTiming(values.targetOriginY, { duration, easing: easingY }),
        ),
        width: this.delayed(
          delayMs,
          withTiming(values.targetWidth, { duration, easing: easingWidth }),
        ),
        height: this.delayed(
          delayMs,
          withTiming(values.targetHeight, { duration, easing: easingHeight }),
        ),
      },
      callback,
    })
  }
}

/**
 * Fades the view out, moves it while it is invisible, and fades it back in —
 * the transition for a rect change too large to be worth watching. Upstream's
 * default length is 500 ms rather than the 300 ms everything else uses.
 */
export class FadingTransition extends AnimationBuilder {
  /** Upstream's own default for this transition, and only this one. */
  override getDuration(): number {
    return this.durationV ?? 500
  }

  override build(): (values: LayoutAnimationValues) => BuiltLayoutAnimation {
    const delayMs = this.getDelay()
    const halfDuration = this.getDuration() / 2
    const callback = this.callbackV
    // The rect lands at the bottom of the fade, so it is a zero-length timing
    // held behind the first half — not a curve at all.
    const snap = (target: number): number =>
      withDelay(delayMs + halfDuration, withTiming(target, { duration: 0 }))
    return (values) => ({
      initialValues: {
        opacity: 1,
        originX: values.currentOriginX,
        originY: values.currentOriginY,
        width: values.currentWidth,
        height: values.currentHeight,
      },
      animations: {
        opacity: this.delayed(
          delayMs,
          withSequence(
            withTiming(0, { duration: halfDuration }),
            withTiming(1, { duration: halfDuration }),
          ),
        ),
        originX: snap(values.targetOriginX),
        originY: snap(values.targetOriginY),
        width: snap(values.targetWidth),
        height: snap(values.targetHeight),
      },
      callback,
    })
  }
}

/**
 * Arcs the view to its new position: it leaps clear of both the old and the
 * new row on an ease-out-exp, then drops onto the target on a bounce. The
 * height of the leap is the distance travelled, so a short move barely hops.
 */
export class JumpingTransition extends AnimationBuilder {
  override build(): (values: LayoutAnimationValues) => BuiltLayoutAnimation {
    const delayMs = this.getDelay()
    const duration = this.getDuration()
    const halfDuration = duration / 2
    const callback = this.callbackV
    return (values) => {
      const distance = Math.max(
        Math.abs(values.targetOriginX - values.currentOriginX),
        Math.abs(values.targetOriginY - values.currentOriginY),
      )
      return {
        initialValues: {
          originX: values.currentOriginX,
          originY: values.currentOriginY,
          width: values.currentWidth,
          height: values.currentHeight,
        },
        animations: {
          originX: this.delayed(
            delayMs,
            withTiming(values.targetOriginX, { duration }),
          ),
          originY: this.delayed(
            delayMs,
            withSequence(
              withTiming(
                Math.min(values.targetOriginY, values.currentOriginY) -
                  distance,
                { duration: halfDuration, easing: Easing.out(Easing.exp) },
              ),
              withTiming(values.targetOriginY, {
                duration: halfDuration,
                easing: Easing.bounce,
              }),
            ),
          ),
          width: this.delayed(
            delayMs,
            withTiming(values.targetWidth, { duration }),
          ),
          height: this.delayed(
            delayMs,
            withTiming(values.targetHeight, { duration }),
          ),
        },
        callback,
      }
    }
  }
}

/**
 * Moves one axis at a time: x first and then y, or the reverse with
 * `.reverse()`. Upstream's default length is 500 ms, split evenly.
 */
export class SequencedTransition extends AnimationBuilder {
  reversed = false

  reverse(): this {
    this.reversed = !this.reversed
    return this
  }

  static reverse(): SequencedTransition {
    return new SequencedTransition().reverse()
  }

  /** Upstream's own default for this transition. */
  override getDuration(): number {
    return this.durationV ?? 500
  }

  override build(): (values: LayoutAnimationValues) => BuiltLayoutAnimation {
    const delayMs = this.getDelay()
    const config = { duration: this.getDuration() / 2 }
    const callback = this.callbackV
    const reverse = this.reversed
    // Each property runs two halves; the one that moves in the FIRST half is
    // the one whose intermediate target is already the destination.
    const twoStep = (first: number, target: number): number =>
      this.delayed(
        delayMs,
        withSequence(withTiming(first, config), withTiming(target, config)),
      )
    return (values) => ({
      initialValues: {
        originX: values.currentOriginX,
        originY: values.currentOriginY,
        width: values.currentWidth,
        height: values.currentHeight,
      },
      animations: {
        originX: twoStep(
          reverse ? values.currentOriginX : values.targetOriginX,
          values.targetOriginX,
        ),
        originY: twoStep(
          reverse ? values.targetOriginY : values.currentOriginY,
          values.targetOriginY,
        ),
        width: twoStep(
          reverse ? values.currentWidth : values.targetWidth,
          values.targetWidth,
        ),
        height: twoStep(
          reverse ? values.targetHeight : values.currentHeight,
          values.targetHeight,
        ),
      },
      callback,
    })
  }
}

// The value a transform slot returns to between an exit and an entry, decided
// from the KEY. Upstream reads it off the animation object's `current`, which
// is a field of ITS animation representation; the descriptors here are plain
// data with no running value, and the key answers the same question — a
// translate rests at 0, a scale at 1, an angle at 0.
const neutralTransformValue = (key: string): number =>
  key.startsWith("scale") ? 1 : 0

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

/**
 * Plays a full exit animation and then a full entry animation on the SAME
 * view when its layout changes — the transition for a view whose content
 * changed so much that moving it would read as the wrong thing moving.
 *
 * `.entering()` and `.exiting()` take any builder (or builder class); the
 * defaults are `FadeIn` and `FadeOut`. The two built configs are composed
 * here rather than run one after the other, so the whole thing is still one
 * animation with one callback.
 */
export class EntryExitTransition extends AnimationBuilder {
  enteringV: LayoutAnimationSource = FadeIn
  exitingV: LayoutAnimationSource = FadeOut

  entering(animation: LayoutAnimationSource): this {
    this.enteringV = animation
    return this
  }

  exiting(animation: LayoutAnimationSource): this {
    this.exitingV = animation
    return this
  }

  static entering(animation: LayoutAnimationSource): EntryExitTransition {
    return new EntryExitTransition().entering(animation)
  }

  static exiting(animation: LayoutAnimationSource): EntryExitTransition {
    return new EntryExitTransition().exiting(animation)
  }

  override build(): (values: LayoutAnimationValues) => BuiltLayoutAnimation {
    const delayMs = this.getDelay()
    const callback = this.callbackV
    const enteringBuild = resolveBuilder(this.enteringV).build()
    const exitingBuild = resolveBuilder(this.exitingV).build()
    const exitingDuration = resolveBuilder(this.exitingV).getDuration()

    return (values) => {
      const entering = enteringBuild(values)
      const exiting = exitingBuild(values)
      const animations: Record<string, unknown> = {}
      const transform: Record<string, unknown>[] = []

      const eachTransform = (
        source: unknown,
        visit: (index: number, key: string, value: unknown) => void,
      ): void => {
        if (!Array.isArray(source)) {
          return
        }
        source.forEach((entry, index) => {
          if (typeof entry === "object" && entry !== null) {
            for (const [key, value] of Object.entries(entry)) {
              visit(index, key, value)
            }
          }
        })
      }

      const initialTransformValue = (
        config: BuiltLayoutAnimation,
        index: number,
        key: string,
      ): number => {
        const slots = config.initialValues.transform
        const slot = Array.isArray(slots)
          ? (slots[index] as Record<string, unknown> | undefined)
          : undefined
        const value = slot?.[key]
        return isFiniteNumber(value) ? value : 0
      }

      // The exit runs first, and every property it touched is snapped back to
      // where the ENTRY wants to begin before the entry plays.
      eachTransform(exiting.animations.transform, (index, key, value) => {
        transform.push({
          [key]: this.delayed(
            delayMs,
            withSequence(
              value as number,
              withTiming(initialTransformValue(exiting, index, key), {
                duration: 0,
              }),
            ),
          ),
        })
      })
      for (const [property, value] of Object.entries(exiting.animations)) {
        if (property === "transform") {
          continue
        }
        const enteringAnimation = entering.animations[property]
        const bridgeTo =
          enteringAnimation !== undefined
            ? entering.initialValues[property]
            : (values[property as keyof LayoutAnimationValues] ??
              exiting.initialValues[property])
        const steps: unknown[] = [
          value,
          withTiming(isFiniteNumber(bridgeTo) ? bridgeTo : 0, { duration: 0 }),
        ]
        if (enteringAnimation !== undefined) {
          steps.push(enteringAnimation)
        }
        animations[property] = this.delayed(
          delayMs,
          withSequence(...(steps as number[])),
        )
      }

      // …then the entry, held back by the length of the exit.
      eachTransform(entering.animations.transform, (index, key, value) => {
        transform.push({
          [key]: this.delayed(
            delayMs + exitingDuration,
            withSequence(
              withTiming(initialTransformValue(entering, index, key), {
                duration: exitingDuration,
              }),
              value as number,
            ),
          ),
        })
      })
      for (const [property, value] of Object.entries(entering.animations)) {
        if (property === "transform" || animations[property] !== undefined) {
          continue
        }
        const initial = entering.initialValues[property]
        animations[property] = this.delayed(
          delayMs,
          withSequence(
            withTiming(isFiniteNumber(initial) ? initial : 0, { duration: 0 }),
            value as number,
          ),
        )
      }

      const initialTransform = [
        ...(Array.isArray(exiting.initialValues.transform)
          ? (exiting.initialValues.transform as Record<string, unknown>[])
          : []),
        ...(Array.isArray(entering.animations.transform)
          ? (entering.animations.transform as Record<string, unknown>[]).map(
              (slot) => {
                const key = Object.keys(slot)[0]
                return key === undefined
                  ? slot
                  : { [key]: neutralTransformValue(key) }
              },
            )
          : []),
      ]

      return {
        initialValues: {
          ...exiting.initialValues,
          originX: values.currentOriginX,
          originY: values.currentOriginY,
          width: values.currentWidth,
          height: values.currentHeight,
          transform: initialTransform,
        },
        animations: {
          originX: withDelay(
            delayMs + exitingDuration,
            withTiming(values.targetOriginX, { duration: exitingDuration }),
          ),
          originY: withDelay(
            delayMs + exitingDuration,
            withTiming(values.targetOriginY, { duration: exitingDuration }),
          ),
          width: withDelay(
            delayMs + exitingDuration,
            withTiming(values.targetWidth, { duration: exitingDuration }),
          ),
          height: withDelay(
            delayMs + exitingDuration,
            withTiming(values.targetHeight, { duration: exitingDuration }),
          ),
          ...animations,
          ...(transform.length > 0 ? { transform } : {}),
        },
        callback,
      }
    }
  }

  /** The exit and the entry run one after the other, so the lengths add. */
  override getMaxDuration(): number {
    return super.getMaxDuration() + resolveBuilder(this.exitingV).getDuration()
  }
}
