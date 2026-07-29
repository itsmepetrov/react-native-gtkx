# Styles: supported properties

Pipeline: `StyleSheet.flatten` → `splitStyle` (layout / visual) → `visualStyleToCss` → memoized
`CssRegistry` (`css` from the bridge) → class in the widget's `cssClasses`. The layout part goes to Yoga via
`LayoutNodeApi.setStyle` (task 004) and never reaches CSS.

Statuses: **supported** — works fully; **partial** — works with the caveat from the note;
**ignored** — the property is outside the frozen contract, `console.warn` once per key.

## Layout (→ Yoga, task 004)

All `LayoutStyle` keys from `contracts.ts` are classified into `layout` unchanged:
`alignContent`, `alignItems`, `alignSelf`, `aspectRatio`, `bottom`, `columnGap`, `direction`,
`display`, `flex`, `flexBasis`, `flexDirection`, `flexGrow`, `flexShrink`, `flexWrap`, `gap`,
`height`, `justifyContent`, `left`, `margin`, `marginBottom`, `marginHorizontal`, `marginLeft`,
`marginRight`, `marginTop`, `marginVertical`, `maxHeight`, `maxWidth`, `minHeight`, `minWidth`,
`overflow`, `padding`, `paddingBottom`, `paddingHorizontal`, `paddingLeft`, `paddingRight`,
`paddingTop`, `paddingVertical`, `position`, `right`, `rowGap`, `top`, `width` — **supported**
(actual behavior is defined by the layout engine).

## Visual (→ GTK CSS)

| Property                                                                                              | Status    | GTK CSS / note                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backgroundColor`                                                                                     | supported | `background-color`                                                                                                                                                                 |
| `opacity`                                                                                             | supported | `opacity` (clamped to [0, 1])                                                                                                                                                      |
| `borderWidth`                                                                                         | supported | `border-width`; auto `border-style: solid` if ANY border width > 0 and `borderStyle` is not set (GTK defaults to `border-style: none`)                                              |
| `borderTopWidth` / `borderRightWidth` / `borderBottomWidth` / `borderLeftWidth`                       | supported | per-side `border-*-width`, emitted after the shorthand and overriding it; also trigger auto-solid when the width is > 0                                                             |
| `borderColor`                                                                                         | supported | `border-color`; without a width the border is invisible (as in RN: the default width is 0)                                                                                         |
| `borderTopColor` / `borderRightColor` / `borderBottomColor` / `borderLeftColor`                       | supported | per-side `border-*-color`, emitted after the shorthand and overriding it                                                                                                           |
| `borderStyle`                                                                                         | supported | `border-style` (`solid` / `dotted` / `dashed` — available in GTK4 CSS); an explicit value wins over auto-solid                                                                      |
| `borderRadius`                                                                                        | supported | `border-radius`                                                                                                                                                                    |
| `borderTopLeftRadius` / `borderTopRightRadius` / `borderBottomRightRadius` / `borderBottomLeftRadius` | supported | per-corner `border-*-radius`, emitted after the shorthand and overriding it                                                                                                        |
| `color`                                                                                               | supported | `color`                                                                                                                                                                            |
| `fontFamily`                                                                                          | supported | `font-family` (names with spaces are quoted)                                                                                                                                       |
| `fontSize`                                                                                            | supported | `font-size` in px                                                                                                                                                                  |
| `fontStyle`                                                                                           | supported | `font-style`                                                                                                                                                                       |
| `fontWeight`                                                                                          | supported | `font-weight` (keywords and numeric strings "100"–"900")                                                                                                                           |
| `letterSpacing`                                                                                       | supported | `letter-spacing` in px                                                                                                                                                             |
| `lineHeight`                                                                                          | partial   | `line-height` in px (GTK ≥ 4.6); the RN "line height in pt" semantics matches, RN multipliers are not supported                                                                    |
| `textAlign`                                                                                           | partial   | applied by the `Text` component, not CSS (GTK4 CSS has no `text-align`): the pure helper `textAlignToLabelProps` from `style/text-align.ts` yields `{ xalign, justification }` for GtkLabel |
| `transform`                                                                                           | partial   | classified into `visual.transform` as-is; applied by the layout engine via `Fixed.Child` matrices, never reaches CSS                                                                |

## Colors

| Format                                     | Status    | Note                                                                                                                                             |
| ------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| named colors (CSS Color 4), `transparent`  | supported | normalized to `rgb()`/`rgba()`                                                                                                                   |
| `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa` | supported | normalized to `rgb()`/`rgba()`                                                                                                                   |
| `rgb()` / `rgba()`                         | supported | comma and space syntax (`rgb(255 0 0 / 0.5)`), channels as numbers or in %                                                                       |
| `hsl()` / `hsla()`                         | supported | hue as a number or with `deg`, s/l strictly in %; converted to `rgb()`/`rgba()`                                                                  |
| `PlatformColor("accent-bg-color", ...)`    | supported | → `var(--accent-bg-color, ...)`; Adwaita variables (libadwaita ≥ 1.6), names with `@` are legacy GTK named colors, terminal in the fallback chain |
| `var(--...)` / `@name` as a string         | supported | passthrough without normalization                                                                                                                |
| invalid string                             | ignored   | `parseColor` → `null`; in `visualStyleToCss` the declaration is dropped with a warn once per value                                               |

## Ignored (outside the frozen contract)

Any key not present in `LayoutStyle`/`VisualStyle` (`boxShadow`, `elevation`, `zIndex`,
`textDecorationLine`, `textTransform`, `tintColor`, …) — `console.warn` once per key,
the value is dropped. Extending the set is done only by changing `contracts.ts` via the orchestrator.
