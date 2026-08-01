// `interpolate`, `Extrapolation` and `clamp` — pure functions over numbers,
// portable from upstream as-is (nothing in them touches a runtime, a thread
// or the DOM).
//
// Not `src/animated/interpolate.ts`: that one COMPILES an
// InterpolationConfig into a node-to-node mapping for `Animated.Value`, takes
// a single `extrapolate` for both edges and produces suffixed strings.
// Reanimated's is a plain `number → number` call taken inside a mapper, with
// independently configurable left and right extrapolation. Different shape,
// different call site; the two do not fold into one.

/** Behaviour for inputs outside `inputRange`. */
export enum Extrapolation {
  IDENTITY = "identity",
  CLAMP = "clamp",
  EXTEND = "extend",
}

export type ExtrapolationConfig = {
  extrapolateLeft?: Extrapolation | string
  extrapolateRight?: Extrapolation | string
}

export type ExtrapolationType =
  | ExtrapolationConfig
  | Extrapolation
  | "identity"
  | "clamp"
  | "extend"
  | undefined

type ResolvedExtrapolation = {
  extrapolateLeft: Extrapolation
  extrapolateRight: Extrapolation
}

type Segment = {
  leftEdgeInput: number
  rightEdgeInput: number
  leftEdgeOutput: number
  rightEdgeOutput: number
}

const SUPPORTED =
  'Supported values: "extend", "clamp", "identity", Extrapolation.CLAMP, ' +
  "Extrapolation.EXTEND, Extrapolation.IDENTITY"

const isExtrapolation = (value: string): value is Extrapolation =>
  value === Extrapolation.EXTEND ||
  value === Extrapolation.CLAMP ||
  value === Extrapolation.IDENTITY

const resolveExtrapolation = (
  type: ExtrapolationType,
): ResolvedExtrapolation => {
  const resolved: ResolvedExtrapolation = {
    extrapolateLeft: Extrapolation.EXTEND,
    extrapolateRight: Extrapolation.EXTEND,
  }
  if (!type) {
    return resolved
  }
  if (typeof type === "string") {
    if (!isExtrapolation(type)) {
      throw new Error(
        `react-native-reanimated: unsupported extrapolation "${type}" for interpolate(). ${SUPPORTED}`,
      )
    }
    resolved.extrapolateLeft = type
    resolved.extrapolateRight = type
    return resolved
  }
  const { extrapolateLeft, extrapolateRight } = type
  if (
    (extrapolateLeft && !isExtrapolation(extrapolateLeft)) ||
    (extrapolateRight && !isExtrapolation(extrapolateRight))
  ) {
    throw new Error(
      `react-native-reanimated: unsupported extrapolation for interpolate(). ${SUPPORTED}`,
    )
  }
  if (extrapolateLeft) {
    resolved.extrapolateLeft = extrapolateLeft as Extrapolation
  }
  if (extrapolateRight) {
    resolved.extrapolateRight = extrapolateRight as Extrapolation
  }
  return resolved
}

const extrapolated = (
  type: Extrapolation,
  direction: number,
  value: number,
  leftEdgeOutput: number,
  rightEdgeOutput: number,
  input: number,
): number => {
  switch (type) {
    case Extrapolation.IDENTITY:
      return input
    case Extrapolation.CLAMP:
      return direction * value < direction * leftEdgeOutput
        ? leftEdgeOutput
        : rightEdgeOutput
    default:
      return value
  }
}

const interpolateSegment = (
  input: number,
  segment: Segment,
  config: ResolvedExtrapolation,
): number => {
  const { leftEdgeInput, rightEdgeInput, leftEdgeOutput, rightEdgeOutput } =
    segment
  if (rightEdgeInput - leftEdgeInput === 0) {
    return leftEdgeOutput
  }
  const progress = (input - leftEdgeInput) / (rightEdgeInput - leftEdgeInput)
  const value = leftEdgeOutput + progress * (rightEdgeOutput - leftEdgeOutput)
  // Which way the output range runs, so "past the left edge" is a comparison
  // that works for a descending outputRange too.
  const direction = rightEdgeOutput >= leftEdgeOutput ? 1 : -1

  if (direction * value < direction * leftEdgeOutput) {
    return extrapolated(
      config.extrapolateLeft,
      direction,
      value,
      leftEdgeOutput,
      rightEdgeOutput,
      input,
    )
  }
  if (direction * value > direction * rightEdgeOutput) {
    return extrapolated(
      config.extrapolateRight,
      direction,
      value,
      leftEdgeOutput,
      rightEdgeOutput,
      input,
    )
  }
  return value
}

/**
 * Maps `value` from `inputRange` onto `outputRange` with linear
 * interpolation between the two enclosing stops.
 */
export const interpolate = (
  value: number,
  inputRange: readonly number[],
  outputRange: readonly number[],
  type?: ExtrapolationType,
): number => {
  if (inputRange.length < 2 || outputRange.length < 2) {
    throw new Error(
      "react-native-reanimated: interpolate() input and output ranges must contain at least two values",
    )
  }
  const config = resolveExtrapolation(type)
  const length = inputRange.length

  if (value > inputRange[length - 1]!) {
    return interpolateSegment(
      value,
      {
        leftEdgeInput: inputRange[length - 2]!,
        rightEdgeInput: inputRange[length - 1]!,
        leftEdgeOutput: outputRange[length - 2]!,
        rightEdgeOutput: outputRange[length - 1]!,
      },
      config,
    )
  }

  // Binary search for the first stop at or above the value: an interpolation
  // taken per frame over a long keyframe list should not be linear in it.
  let left = 1
  let right = length - 1
  while (left < right) {
    const middle = Math.floor((left + right) / 2)
    if (value <= inputRange[middle]!) {
      right = middle
    } else {
      left = middle + 1
    }
  }

  return interpolateSegment(
    value,
    {
      leftEdgeInput: inputRange[left - 1]!,
      rightEdgeInput: inputRange[left]!,
      leftEdgeOutput: outputRange[left - 1]!,
      rightEdgeOutput: outputRange[left]!,
    },
    config,
  )
}

/** Constrains `value` to `[min, max]`. */
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)
