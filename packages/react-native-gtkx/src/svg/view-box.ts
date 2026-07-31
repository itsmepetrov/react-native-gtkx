// Pure viewBox / preserveAspectRatio math (SVG 1.1 §7.11). No gtkx imports —
// the bridge feeds the result into Gtk.Snapshot.scale()/translate(), but the
// arithmetic itself has nothing to do with GTK and is fully unit-testable.

export type ViewBox = {
  minX: number
  minY: number
  width: number
  height: number
}

// "minX minY width height", comma or whitespace separated (SVG allows
// either). Returns null for anything that doesn't parse to exactly 4
// numbers or has a non-positive size — callers fall back to the identity
// transform, same as SVG does when viewBox is absent.
export const parseViewBox = (value: string | undefined): ViewBox | null => {
  if (!value) {
    return null
  }
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return null
  }
  const [minX, minY, width, height] = parts as [number, number, number, number]
  if (width <= 0 || height <= 0) {
    return null
  }
  return { minX, minY, width, height }
}

export type AlignX = "min" | "mid" | "max"
export type AlignY = "min" | "mid" | "max"
export type MeetOrSlice = "meet" | "slice"

export type PreserveAspectRatio = {
  align: "none" | { x: AlignX; y: AlignY }
  meetOrSlice: MeetOrSlice
}

const ALIGN_PATTERN = /^x(Min|Mid|Max)Y(Min|Mid|Max)$/

export const DEFAULT_PRESERVE_ASPECT_RATIO: PreserveAspectRatio = {
  align: { x: "mid", y: "mid" },
  meetOrSlice: "meet",
}

// Tolerant like the transform-string parser: unrecognized tokens fall back
// to the SVG default (xMidYMid meet) rather than throwing.
export const parsePreserveAspectRatio = (
  value: string | undefined,
): PreserveAspectRatio => {
  if (!value) {
    return DEFAULT_PRESERVE_ASPECT_RATIO
  }
  const tokens = value.trim().split(/\s+/)
  const alignToken = tokens[0] ?? ""
  const meetOrSlice: MeetOrSlice = tokens[1] === "slice" ? "slice" : "meet"
  if (alignToken === "none") {
    return { align: "none", meetOrSlice }
  }
  const match = ALIGN_PATTERN.exec(alignToken)
  if (!match) {
    return DEFAULT_PRESERVE_ASPECT_RATIO
  }
  const x = match[1]!.toLowerCase() as AlignX
  const y = match[2]!.toLowerCase() as AlignY
  return { align: { x, y }, meetOrSlice }
}

export type ViewBoxTransform = {
  scaleX: number
  scaleY: number
  translateX: number
  translateY: number
}

const IDENTITY: ViewBoxTransform = {
  scaleX: 1,
  scaleY: 1,
  translateX: 0,
  translateY: 0,
}

/**
 * Maps viewBox user-space coordinates onto a `viewportWidth` x
 * `viewportHeight` box: `screen = user * scale + translate`. Mirrors the SVG
 * algorithm exactly (see spec §7.11) — "none" stretches independently per
 * axis, "meet" fits the whole viewBox inside the viewport (letterboxing),
 * "slice" fills the viewport and overflows the viewBox (the bridge clips to
 * the viewport bounds, same as a real SVG renderer).
 */
export const resolveViewBoxTransform = (
  viewBox: ViewBox | null,
  viewportWidth: number,
  viewportHeight: number,
  preserveAspectRatio: PreserveAspectRatio = DEFAULT_PRESERVE_ASPECT_RATIO,
): ViewBoxTransform => {
  if (!viewBox || viewportWidth <= 0 || viewportHeight <= 0) {
    return IDENTITY
  }
  const rawScaleX = viewportWidth / viewBox.width
  const rawScaleY = viewportHeight / viewBox.height

  let scaleX: number
  let scaleY: number
  if (preserveAspectRatio.align === "none") {
    scaleX = rawScaleX
    scaleY = rawScaleY
  } else {
    const scale =
      preserveAspectRatio.meetOrSlice === "meet"
        ? Math.min(rawScaleX, rawScaleY)
        : Math.max(rawScaleX, rawScaleY)
    scaleX = scale
    scaleY = scale
  }

  let alignOffsetX = 0
  let alignOffsetY = 0
  if (preserveAspectRatio.align !== "none") {
    const extraX = viewportWidth - viewBox.width * scaleX
    const extraY = viewportHeight - viewBox.height * scaleY
    if (preserveAspectRatio.align.x === "mid") {
      alignOffsetX = extraX / 2
    } else if (preserveAspectRatio.align.x === "max") {
      alignOffsetX = extraX
    }
    if (preserveAspectRatio.align.y === "mid") {
      alignOffsetY = extraY / 2
    } else if (preserveAspectRatio.align.y === "max") {
      alignOffsetY = extraY
    }
  }

  return {
    scaleX,
    scaleY,
    translateX: alignOffsetX - viewBox.minX * scaleX,
    translateY: alignOffsetY - viewBox.minY * scaleY,
  }
}
