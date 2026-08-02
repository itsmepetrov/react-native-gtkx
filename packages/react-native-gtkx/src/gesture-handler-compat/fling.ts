// `Gesture.Fling()` — a directional swipe, which is a VELOCITY predicate and
// a direction predicate over the same machine everything else runs on.
//
// THE THING TO GET RIGHT IS THE VELOCITY, and it is the thing a naive test
// does not catch: a fling is not "the pointer travelled 200px to the right".
// A slow drag travels exactly as far. What tells them apart is how fast the
// pointer was going when it got there, and upstream guards it twice —
// `minVelocity` (700 units per second) as the criterion, and `maxDurationMs`
// (800ms) as a hard deadline that fails the gesture whatever it is doing. A
// leisurely drag across the same distance misses both.
//
// Restated from `src/web/handlers/FlingGestureHandler.ts` at 3.1.0, not
// transcribed. Four details are worth naming because each is load-bearing and
// none of them is obvious:
//
//   - **the decision is made on every MOVE, not on the release.** Upstream
//     calls `tryEndFling()` from `onPointerMove`, so a fling activates the
//     instant the pointer is fast enough and pointed the right way, with the
//     button still down. The release is only the last chance;
//   - **activating IS ending.** `FlingGestureHandler.activate()` is overridden
//     to call `this.end()` immediately, so the progression is
//     BEGAN -> ACTIVE -> END in one synchronous breath and there is never an
//     `onUpdate`. See `RecognizerDecider.endsOnActivate`;
//   - **the direction is a bitmask and the diagonals come free.** A config of
//     `Directions.UP | Directions.RIGHT` sets both bits, so the internal
//     `UP_RIGHT` composite (5) also passes `(composite & config) === composite`
//     and is tested — with a WIDER cone, 60° against the axes' 30°. The two
//     cone widths tile the circle exactly: 4×30 + 4×60 = 360;
//   - **the pointer count is compared for EQUALITY**, against the most
//     pointers the interaction ever had at once. Upstream refuses a mismatch
//     in both directions, so a two-finger fling is not satisfied by one finger
//     and a one-finger fling is not satisfied by two.
//
// WHERE THIS PLATFORM'S VELOCITY DIFFERS FROM UPSTREAM'S, said plainly because
// it is the number the whole gesture turns on. Upstream fits a second-degree
// least-squares polynomial over up to 20 samples inside a 300ms horizon
// (`VelocityTracker`) and takes the linear coefficient. This platform's
// `velocityX`/`velocityY` are the last inter-event delta, which is what
// `Pan().minVelocity()` has always used here and what every payload reports —
// so `Fling` reads the same number its own event carries rather than a second,
// better one nothing else can see. The consequence is that this fling is more
// sensitive to a single long frame than upstream's; the 800ms deadline and the
// alignment cone are unaffected, and docs/api.md records the difference.
import type {
  RecognizerDecider,
  RecognizerTimer,
  RecognizerView,
} from "./recognizer"
import { DIAGONAL_DIRECTIONS, DIRECTIONS, type RecognizerConfig } from "./types"

/** Upstream's `DEFAULT_MAX_DURATION_MS`: past this, the fling has failed. */
export const DEFAULT_MAX_DURATION = 800

/** Upstream's `DEFAULT_MIN_VELOCITY`, in units per second. */
export const DEFAULT_MIN_VELOCITY = 700

/** Upstream's `DEFAULT_DIRECTION`. */
export const DEFAULT_DIRECTION = DIRECTIONS.RIGHT

/** Upstream's `DEFAULT_NUMBER_OF_TOUCHES_REQUIRED`. */
export const DEFAULT_NUMBER_OF_POINTERS = 1

/** Upstream's `DEFAULT_ALIGNMENT_CONE`, in degrees. */
export const ALIGNMENT_CONE_DEGREES = 30

/**
 * `coneToDeviation` from `src/web/utils.ts`: the cosine of HALF the cone, so
 * a 30° cone accepts everything within ±15° of the axis.
 */
const coneToDeviation = (degrees: number): number =>
  Math.cos((degrees / 2) * (Math.PI / 180))

/** cos(15°) — the axial cone. */
export const AXIAL_DEVIATION_COSINE = coneToDeviation(ALIGNMENT_CONE_DEGREES)

/** cos(30°) — the diagonal cone, which is the complement of the axial one. */
export const DIAGONAL_DEVIATION_COSINE = coneToDeviation(
  90 - ALIGNMENT_CONE_DEGREES,
)

/**
 * Upstream's `MINIMAL_RECOGNIZABLE_MAGNITUDE`. Below it a vector has no
 * meaningful direction, and upstream's `Vector` zeroes the unit vector rather
 * than dividing by something near zero.
 */
const MINIMAL_RECOGNIZABLE_MAGNITUDE = 0.1

/** The unit vector each direction bit stands for, in SCREEN coordinates. */
const DIRECTION_VECTORS: readonly (readonly [number, number, number])[] = [
  // [bit, x, y] — note that UP is negative Y, which is upstream's mapping and
  // the screen's rather than the maths convention.
  [DIRECTIONS.LEFT, -1, 0],
  [DIRECTIONS.RIGHT, 1, 0],
  [DIRECTIONS.UP, 0, -1],
  [DIRECTIONS.DOWN, 0, 1],
]

const DIAGONAL_VECTORS: readonly (readonly [number, number, number])[] = [
  [DIAGONAL_DIRECTIONS.UP_RIGHT, 1, -1],
  [DIAGONAL_DIRECTIONS.DOWN_RIGHT, 1, 1],
  [DIAGONAL_DIRECTIONS.UP_LEFT, -1, -1],
  [DIAGONAL_DIRECTIONS.DOWN_LEFT, -1, 1],
]

/**
 * Whether the velocity points along any direction the config asked for.
 *
 * The similarity is a dot product of UNIT vectors, so it is the cosine of the
 * angle between them, and the comparison is strict — upstream's
 * `Vector.isSimilar` uses `>` rather than `>=`.
 */
export const isAligned = (
  velocityX: number,
  velocityY: number,
  direction: number,
): boolean => {
  const magnitude = Math.hypot(velocityX, velocityY)
  if (magnitude <= MINIMAL_RECOGNIZABLE_MAGNITUDE) {
    // Upstream zeroes the unit vector here, which makes every dot product 0
    // and every alignment false. Stated directly rather than reproduced
    // through a zeroed vector, because a division by a near-zero magnitude is
    // the thing being avoided and this says so.
    return false
  }
  const unitX = velocityX / magnitude
  const unitY = velocityY / magnitude

  const alignedWith = (
    candidates: readonly (readonly [number, number, number])[],
    threshold: number,
  ): boolean =>
    candidates.some(([bit, x, y]) => {
      // Every bit of the candidate must be set in the config. For an axis that
      // is one bit; for a diagonal it is two, which is why `UP | RIGHT` opts
      // into the diagonal and `UP` alone does not.
      if ((bit & direction) !== bit) {
        return false
      }
      const length = Math.hypot(x, y)
      return unitX * (x / length) + unitY * (y / length) > threshold
    })

  return (
    alignedWith(DIRECTION_VECTORS, AXIAL_DEVIATION_COSINE) ||
    alignedWith(DIAGONAL_VECTORS, DIAGONAL_DEVIATION_COSINE)
  )
}

export const flingDecider: RecognizerDecider = {
  kind: "fling",

  // Activating a fling is finishing it. Upstream overrides `activate()` to
  // call `end()`; this is that, without a subclass to hang it on.
  endsOnActivate: true,

  /**
   * The deadline. Unlike `Tap`'s it is not a "too slow to be a tap" rule about
   * the press — it is the window inside which a fling has to happen at all,
   * and it is the second of the two guards that keep a slow drag from ever
   * qualifying.
   */
  timer: (): RecognizerTimer => ({
    delay: DEFAULT_MAX_DURATION,
    elapsed: "fail",
  }),

  /**
   * Never from movement. Upstream's fling has no failure predicate over
   * travel: a pointer wandering the wrong way has simply not flung yet, and it
   * may still turn and fling before the deadline. What fails it is the timer,
   * or lifting without having qualified (the `onRelease` below).
   */
  shouldFail: (): boolean => false,

  shouldActivate: (view: RecognizerView, config: RecognizerConfig): boolean => {
    // EXACT equality, in both directions, and against the high-water mark
    // rather than the count right now — a fling is a statement about how many
    // fingers made it.
    if (
      view.maxPointerCount !==
      (config.numberOfPointers ?? DEFAULT_NUMBER_OF_POINTERS)
    ) {
      return false
    }
    if (Math.hypot(view.velocityX, view.velocityY) <= DEFAULT_MIN_VELOCITY) {
      // Strict, as upstream's `magnitude > this.minVelocity` is. This is the
      // whole difference between a fling and a drag.
      return false
    }
    return isAligned(
      view.velocityX,
      view.velocityY,
      config.direction ?? DEFAULT_DIRECTION,
    )
  },

  /**
   * The last chance, and then it is over.
   *
   * Upstream's `onUp` runs `tryEndFling()` one final time and calls `fail()`
   * if it still does not qualify — so the release asks exactly the question a
   * move would have asked, and the answer decides between END and FAILED. The
   * velocity it reads is the last move's, which is upstream's too: neither
   * platform re-measures anything at the moment a button comes up.
   */
  onRelease: (view: RecognizerView, config: RecognizerConfig) =>
    flingDecider.shouldActivate(view, config)
      ? ({ kind: "activate" } as const)
      : ({ kind: "fail" } as const),
}
