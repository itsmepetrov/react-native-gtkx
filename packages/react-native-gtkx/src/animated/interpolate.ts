// Pure interpolation compiler: turns an InterpolationConfig into a
// number → number|string mapping. Supports multi-segment input ranges,
// "extend"/"clamp"/"identity" extrapolation (both sides) and suffixed string
// outputs ("45deg", "3.14rad"): the numeric part is interpolated, the shared
// suffix is preserved.

import type { InterpolationConfig } from "./types"

const NUMBER_WITH_SUFFIX = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(.*)$/

type ParsedOutputRange = { values: number[]; suffix: string }

const parseOutputRange = (
  outputRange: readonly (number | string)[],
): ParsedOutputRange => {
  const values: number[] = []
  let suffix: string | null = null
  for (const entry of outputRange) {
    if (typeof entry === "number") {
      if (suffix !== null && suffix !== "") {
        throw new Error("interpolate: outputRange mixes numbers and strings")
      }
      suffix = ""
      values.push(entry)
      continue
    }
    const match = NUMBER_WITH_SUFFIX.exec(entry)
    if (!match) {
      throw new Error(`interpolate: cannot parse output value "${entry}"`)
    }
    const entrySuffix = match[2] ?? ""
    if (suffix === null) {
      suffix = entrySuffix
    } else if (suffix !== entrySuffix) {
      throw new Error(
        `interpolate: outputRange mixes units ("${suffix}" vs "${entrySuffix}")`,
      )
    }
    values.push(parseFloat(match[1]!))
  }
  return { values, suffix: suffix ?? "" }
}

const validate = (config: InterpolationConfig): void => {
  const { inputRange, outputRange } = config
  if (inputRange.length < 2) {
    throw new Error("interpolate: inputRange must have at least 2 elements")
  }
  if (outputRange.length !== inputRange.length) {
    throw new Error(
      "interpolate: inputRange and outputRange must have the same length",
    )
  }
  for (let i = 1; i < inputRange.length; i++) {
    if (inputRange[i]! < inputRange[i - 1]!) {
      throw new Error(
        "interpolate: inputRange must be monotonically non-decreasing",
      )
    }
  }
}

// Largest segment whose start is at or below the input (RN's findRange):
// inputs left of the range use the first segment, inputs right of it the
// last one, which is what "extend" extrapolation builds on.
const findSegment = (input: number, inputRange: number[]): number => {
  let i = 1
  for (; i < inputRange.length - 1; i++) {
    if (inputRange[i]! >= input) {
      break
    }
  }
  return i - 1
}

export const createInterpolator = (
  config: InterpolationConfig,
): ((input: number) => number | string) => {
  validate(config)
  const inputRange = [...config.inputRange]
  const extrapolate = config.extrapolate ?? "extend"
  const { values: outputValues, suffix } = parseOutputRange(config.outputRange)
  const first = inputRange[0]!
  const last = inputRange[inputRange.length - 1]!

  const interpolateNumber = (rawInput: number): number => {
    const input =
      extrapolate === "clamp"
        ? Math.min(Math.max(rawInput, first), last)
        : rawInput
    const i = findSegment(input, inputRange)
    const inMin = inputRange[i]!
    const inMax = inputRange[i + 1]!
    const outMin = outputValues[i]!
    const outMax = outputValues[i + 1]!
    if (inMin === inMax) {
      return input <= inMin ? outMin : outMax
    }
    const progress = (input - inMin) / (inMax - inMin)
    return outMin + progress * (outMax - outMin)
  }

  return (input: number): number | string => {
    const outOfRange = input < first || input > last
    const result =
      extrapolate === "identity" && outOfRange
        ? input
        : interpolateNumber(input)
    return suffix === "" ? result : `${result}${suffix}`
  }
}
