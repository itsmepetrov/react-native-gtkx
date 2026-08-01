// Which visual style properties this platform can write to a MOUNTED widget
// without going through React, and how they are rendered for the per-widget
// CSS provider that carries them (../gtkx/bridge/widget-css.ts).
//
// WHY THIS IS A SEPARATE LIST FROM VisualStyle. The ordinary path compiles a
// whole VisualStyle into one CSS declaration block and memoises it by that
// block's text (./registry.ts), which is exactly right for a style that
// changes when React re-renders and exactly wrong for one that changes sixty
// times a second: the cache key is the value, so a driven colour mints a new
// class per frame, appends a rule to the ONE global stylesheet, and makes GTK
// re-parse the whole document. Measured, that is 0.8 ms for the first frame
// and 6.8 ms by frame 600 — a cost that grows for as long as the animation
// runs (docs/research/animated-colors.md).
//
// A per-widget provider has no cache and no document: one rule, replaced in
// place. So the properties listed here are the ones a running animation may
// write, and they are colours because a colour is the only thing that both
// changes per frame in real UI and reaches GTK purely through CSS. Radii,
// borders and shadows would work identically through the same door; layout
// properties would NOT, because they need a Yoga pass whose cost is
// proportional to the tree rather than to the number of animated values (the
// same doc measures that too, and refuses them on the strength of it).

import type { VisualStyle } from "../contracts"
import { visualStyleToCss } from "./visual-css"

/**
 * The colour properties an animation may drive imperatively. Every one of
 * them is a plain GTK4 CSS declaration with no layout consequence, which is
 * what makes writing it mid-animation safe.
 */
export const DRIVEABLE_COLOR_PROPERTIES = [
  "backgroundColor",
  "borderBottomColor",
  "borderColor",
  "borderLeftColor",
  "borderRightColor",
  "borderTopColor",
  "color",
  "outlineColor",
] as const

export type DriveableColorProperty = (typeof DRIVEABLE_COLOR_PROPERTIES)[number]

const DRIVEABLE = new Set<string>(DRIVEABLE_COLOR_PROPERTIES)

export const isDriveableColorProperty = (
  property: string,
): property is DriveableColorProperty => DRIVEABLE.has(property)

/**
 * Renders driven colour values as a GTK CSS declaration body (no selector,
 * no braces), through the SAME generator the static path uses — so a colour
 * written per frame is normalised, validated and warned about exactly like
 * one written in a stylesheet, instead of growing a second dialect.
 *
 * Values are ordinary React Native colour strings. An unparseable one is
 * dropped with the generator's own one-per-session warning; a property whose
 * value is not a string is skipped, because a driven leaf that has stopped
 * being a colour must not be able to emit `background-color: 12;` into a
 * document GTK then rejects wholesale.
 */
export const driveableColorsToCss = (
  values: Readonly<Record<string, unknown>>,
): string => {
  const visual: Record<string, string> = {}
  for (const property of DRIVEABLE_COLOR_PROPERTIES) {
    const value = values[property]
    if (typeof value === "string") {
      visual[property] = value
    }
  }
  return visualStyleToCss(visual as VisualStyle)
}
