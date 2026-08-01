// Pan's two predicates, and the defaults that decide when they are consulted.
//
// The arithmetic is restated from upstream's BEHAVIOUR, not transcribed from
// its source: activation when the translation crosses an `activeOffset*`
// bound, or exceeds a velocity floor, or covers `minDistance`; failure when
// it crosses a `failOffset*` bound; and, with `activateAfterLongPress` set,
// movement past the default minimum before the timer fires is a failure,
// because that press was a drag and not a hold.
import type { RecognizerDecider, RecognizerView } from "./recognizer"
import type { OffsetBound, PanRecognizerConfig } from "./types"

/** Upstream's default minimum travel before an unconfigured pan activates. */
export const DEFAULT_MIN_DISTANCE = 10

/**
 * A bound in its two spellings, normalised to `[low, high]`.
 *
 * The single-number form is DIRECTIONAL and the direction is the sign:
 * `activeOffsetX(20)` bounds the positive side and leaves the negative side
 * open, `activeOffsetX(-20)` the reverse. Reading it as a symmetric ±20 turns
 * a one-way drawer into a two-way one, and does it silently.
 */
export const asRange = (value: OffsetBound): [number, number] => {
  if (typeof value !== "number") {
    return [value[0], value[1]]
  }
  return value < 0
    ? [value, Number.POSITIVE_INFINITY]
    : [Number.NEGATIVE_INFINITY, value]
}

const crosses = (value: number, bound: OffsetBound | undefined): boolean => {
  if (bound === undefined) {
    return false
  }
  const [low, high] = asRange(bound)
  return value < low || value > high
}

/**
 * Whether the config names its own activation criteria.
 *
 * `failOffset*` is deliberately NOT in this set, and that is a correction to
 * the spike this module grew out of. A pan configured with only
 * `failOffsetY([-5, 5])` still activates on ordinary distance upstream;
 * treating a failure bound as an activation criterion would pin `minDistance`
 * at infinity and the gesture could never start at all.
 */
const hasCustomActivationCriteria = (config: PanRecognizerConfig): boolean =>
  config.activeOffsetX !== undefined ||
  config.activeOffsetY !== undefined ||
  config.minVelocity !== undefined ||
  config.minVelocityX !== undefined ||
  config.minVelocityY !== undefined

/**
 * The distance that activates an otherwise unconfigured pan.
 *
 * An explicit `minDistance` always wins. Otherwise a config that names its
 * own activation criteria opts OUT of the distance rule entirely — the
 * offsets are the criteria, and a 10px fallback underneath them would
 * activate diagonal drags neither offset asked for.
 */
export const effectiveMinDistance = (config: PanRecognizerConfig): number => {
  if (config.minDistance !== undefined) {
    return config.minDistance
  }
  return hasCustomActivationCriteria(config)
    ? Number.POSITIVE_INFINITY
    : DEFAULT_MIN_DISTANCE
}

const exceeds = (value: number, floor: number | undefined): boolean =>
  floor !== undefined && Math.abs(value) >= floor

export const panDecider: RecognizerDecider = {
  shouldFail: (view: RecognizerView, config: PanRecognizerConfig): boolean => {
    if (config.activateAfterLongPress !== undefined && !view.longPressElapsed) {
      // Before the timer, travelling further than the default minimum says
      // this was a drag rather than a hold, and the gesture is done. Past the
      // timer the press has matured and the ordinary bounds take over.
      return (
        Math.hypot(view.translationX, view.translationY) > DEFAULT_MIN_DISTANCE
      )
    }
    return (
      crosses(view.translationX, config.failOffsetX) ||
      crosses(view.translationY, config.failOffsetY)
    )
  },

  shouldActivate: (
    view: RecognizerView,
    config: PanRecognizerConfig,
  ): boolean => {
    // The timer is an activation criterion in its own right, and the only one
    // that does not come from the pointer. Checked first because the pointer
    // has not necessarily moved at all when it fires.
    if (view.longPressElapsed) {
      return true
    }
    if (
      crosses(view.translationX, config.activeOffsetX) ||
      crosses(view.translationY, config.activeOffsetY)
    ) {
      return true
    }
    if (
      exceeds(view.velocityX, config.minVelocityX) ||
      exceeds(view.velocityY, config.minVelocityY) ||
      exceeds(Math.hypot(view.velocityX, view.velocityY), config.minVelocity)
    ) {
      return true
    }
    const minDistance = effectiveMinDistance(config)
    if (!Number.isFinite(minDistance)) {
      return false
    }
    // Non-strict, where the failure test above is strict: a translation
    // sitting exactly on a bound activates rather than fails. That asymmetry
    // is upstream's.
    return Math.hypot(view.translationX, view.translationY) >= minDistance
  },
}
