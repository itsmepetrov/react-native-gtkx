// React Native's StyleSheet API. Pure module — no bridge imports.

import type { FlatStyle, StyleProp } from "../contracts"

// GTK renders in logical pixels (scale factor is applied by the compositor),
// so the thinnest visible line is 1.
export const hairlineWidth = 1

export const absoluteFillObject = {
  position: "absolute",
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
} satisfies FlatStyle

export const absoluteFill: FlatStyle = Object.freeze({ ...absoluteFillObject })

type NamedStyles<T> = { [P in keyof T]: FlatStyle }

/**
 * Registers a map of named styles. Identity function at runtime (like modern
 * React Native); exists for typing and API compatibility.
 */
export const create = <T extends NamedStyles<T>>(
  styles: T & NamedStyles<T>,
): T => styles

const collect = (
  style: StyleProp<FlatStyle>,
  out: Record<string, unknown>,
): void => {
  if (!style) {
    return
  }
  if (Array.isArray(style)) {
    for (const item of style as ReadonlyArray<StyleProp<FlatStyle>>) {
      collect(item, out)
    }
    return
  }
  Object.assign(out, style)
}

/**
 * Flattens a style prop (object, or arbitrarily nested arrays with falsy
 * holes `[a, b, cond && c]`) into a single plain object. Later entries win.
 */
export const flatten = (style: StyleProp<FlatStyle>): FlatStyle => {
  const out: Record<string, unknown> = {}
  collect(style, out)
  return out as FlatStyle
}

/**
 * Combines two style props so that style2 takes precedence. Mirrors React
 * Native: returns the non-null one when the other is null/undefined.
 */
export const compose = (
  style1: StyleProp<FlatStyle>,
  style2: StyleProp<FlatStyle>,
): StyleProp<FlatStyle> => {
  if (style1 != null && style2 != null) {
    return [style1, style2]
  }
  return style1 != null ? style1 : style2
}

export const StyleSheet = {
  absoluteFill,
  absoluteFillObject,
  compose,
  create,
  flatten,
  hairlineWidth,
}
