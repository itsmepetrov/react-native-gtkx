// Adwaita's boxed list, written in React Native — an APP component.
//
// This used to be `List`/`ListRow`/`ListSeparator` in
// `react-native-gtkx/common`, and the argument for it being platform surface
// was that a screen shared with iOS and Android could not import
// `react-native-gtkx/adw`. That argument is wrong, and the reason is worth
// keeping here rather than in a changelog: **`react-native-gtkx/common` does
// not resolve on iOS or Android either.** Either import needs a
// `.linux.tsx` split or a `Platform` check, so this bought a consumer
// nothing over reaching for `AdwActionRow` directly — while costing a
// hand-maintained copy of Adwaita's own metrics that drifts every time
// libadwaita moves. It had exactly one consumer: this app.
//
// So the rule is now the simple one:
//
//   want a native list  → `AdwActionRow` etc. from `react-native-gtkx/adw`,
//                         which brings GTK's real keynav, focus and
//                         accessibility and takes its metrics from the
//                         system theme;
//   want THIS look in    → copy this file. It is 200 lines of `View`,
//   React Native            `Pressable`, `Text` and `StyleSheet`, and that
//                           is the whole point of it.
//
// What survives from the change that introduced it (#47) is the part that
// mattered and is still platform surface: `boxShadow`, `outline*` and
// `textDecorationLine` in the style layer. Those are what make an
// Adwaita-looking list expressible in `StyleSheet` at all. The components
// built on top of them are an app's business.
//
// Reordering is NOT here any more either. It used to be `List`'s
// `onReorder` plus `ListRow`'s `reorderId` — a second, id-keyed entry point
// into the same drag-and-drop module `Draggable`/`Sortable` come from, and
// two ways to do one thing. `screens/content-screen.tsx` now uses
// `react-native-gtkx/dnd` directly, which is the API an RN developer
// already knows.
import { type ReactNode } from "react"
import {
  PlatformColor,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native"

/**
 * Where a row sits in its list, which is what decides its corner radii and
 * whether it draws a separator under itself.
 *
 * RN has no `:first-child`, so this is explicit. From a `FlatList` it is
 * `rowPosition(index, data.length)`; from a static list it is the same
 * expression over the array.
 */
export type ListRowPosition = "first" | "middle" | "last" | "only"

/** The usual derivation, so no call site has to get the one-row case wrong. */
export const rowPosition = (index: number, count: number): ListRowPosition => {
  const first = index === 0
  const last = index === count - 1
  if (first && last) {
    return "only"
  }
  return first ? "first" : last ? "last" : "middle"
}

// libadwaita 1.9, /org/gnome/Adwaita/styles/gtk.css:
//   list.boxed-list { background-color: var(--card-bg-color); border-radius: 12px;
//                     box-shadow: 0 0 0 1px RGB(0 0 6/3%),
//                                 0 1px 3px 1px RGB(0 0 6/7%),
//                                 0 2px 6px 2px RGB(0 0 6/3%); }
const RADIUS = 12

const styles = StyleSheet.create({
  list: {
    backgroundColor: PlatformColor("card-bg-color"),
    borderRadius: RADIUS,
    // The frame is a shadow, not a border, and that distinction is load
    // bearing: a border would consume the box and inset every row by a pixel,
    // and no border draws the two soft drops underneath.
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 0,
        spreadDistance: 1,
        color: "rgba(0, 0, 6, 0.03)",
      },
      {
        offsetX: 0,
        offsetY: 1,
        blurRadius: 3,
        spreadDistance: 1,
        color: "rgba(0, 0, 6, 0.07)",
      },
      {
        offsetX: 0,
        offsetY: 2,
        blurRadius: 6,
        spreadDistance: 2,
        color: "rgba(0, 0, 6, 0.03)",
      },
    ],
  },
  // `list > row { padding: 2px }` plus
  // `row > box.header { margin: 0 12px; border-spacing: 6px; min-height: 50px }`
  // — 2 + 50 + 2 + the 1px separator is the 55px row pitch measured off the
  // widget's own screenshot.
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 54,
    paddingVertical: 2,
    paddingHorizontal: 14,
    gap: 6,
  },
  separatorUnder: {
    borderBottomWidth: 1,
    borderBottomColor: PlatformColor("card-shade-color"),
  },
  firstRow: { borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS },
  lastRow: {
    borderBottomLeftRadius: RADIUS,
    borderBottomRightRadius: RADIUS,
  },
  // `row > box.header > box.title { margin: 6px 0; border-spacing: 3px }`
  titleBox: { flex: 1, marginVertical: 6, gap: 3 },
  // The theme font is `Adwaita Sans 11`, i.e. 11pt = 14.67px, and Adwaita sets
  // the subtitle to `font-size: smaller` — Pango's one-step-down, 1/1.2. RN's
  // fontSize is numeric only (there is no `smaller`, no em, no inherited
  // percentage), so the computed value is what an app can write.
  title: { fontSize: 14.7 },
  // `row label.subtitle { opacity: var(--dim-opacity) }`, 55% in the light
  // Adwaita palette.
  subtitle: { fontSize: 12.2, opacity: 0.55 },
  separator: {
    height: 1,
    backgroundColor: PlatformColor("card-shade-color"),
  },
})

// Adwaita tints the hover and press states with a fraction of the FOREGROUND
// colour (`color-mix(in srgb, currentColor 4%, transparent)`), so one literal
// cannot serve both themes and CSS colour functions are not part of RN's
// colour contract. Two literals plus the scheme is what an RN app writes on
// every platform, and it is what this does.
const TINTS = {
  light: { hover: "rgba(0, 0, 0, 0.04)", press: "rgba(0, 0, 0, 0.08)" },
  dark: {
    hover: "rgba(255, 255, 255, 0.04)",
    press: "rgba(255, 255, 255, 0.08)",
  },
} as const

export type ListProps = {
  children?: ReactNode
  style?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * The `.boxed-list` frame: a rounded, shadowed card. Put `ListRow`s in it
 * directly, or a `FlatList` whose `renderItem` returns them.
 */
export const List = ({ children, style, testID }: ListProps): ReactNode => (
  <View
    testID={testID}
    style={[styles.list, style]}
  >
    {children}
  </View>
)

export type ListRowProps = {
  /** Primary line. A string renders with the row's own typography; a node is
   *  rendered as given, for a title that needs its own styling. */
  title?: ReactNode
  /** Second, dimmed line. Omitted rows are single-line, as `AdwActionRow`'s
   *  are. */
  subtitle?: ReactNode
  /** Leading content — a checkbox, an icon, a colour swatch. */
  prefix?: ReactNode
  /** Trailing content — buttons, a value, a chevron. */
  suffix?: ReactNode
  /** Makes the row activatable: it gains the hover and press tints and calls
   *  this. Without it the row is inert, like a non-`activatable`
   *  `AdwActionRow`. */
  onPress?: () => void
  /** Position in the list, for the corner radii and the separator. Defaults
   *  to `"middle"`, which is right for a row that is neither. */
  position?: ListRowPosition
  /** Draw the hairline under this row. Default true for every position except
   *  the last — set it false when the list supplies its own separators (a
   *  `FlatList`'s `ItemSeparatorComponent`, say). */
  separator?: boolean
  /** Content rendered inside the row before everything else — where the
   *  drag-and-drop controllers go now that the row does not own them. */
  children?: ReactNode
  style?: StyleProp<ViewStyle>
  testID?: string
}

// libadwaita 1.9: `row:focus:focus-visible { outline-color: color-mix(in
// srgb, var(--accent-color) 50%, transparent); outline-width: 2px;
// outline-offset: -2px }`. An outline takes no layout space, so drawing it
// only while focused never moves anything — the reason `outline*` is the
// right prop for a focus ring and `border*` is not.
//
// The 50% mix is the one part not reproduced: RN's colour contract has no
// `color-mix`, and adding one would be inventing non-RN surface (the same
// call already made for the hover tint above). The ring reads slightly
// stronger than Adwaita's own as a result.
const focusRing = {
  outlineWidth: 2,
  outlineOffset: -2,
  outlineColor: PlatformColor("accent-color"),
} as const

/**
 * One row of a {@link List} — `AdwActionRow`'s layout and states, built from
 * `Pressable`, `View` and `Text`.
 *
 * Hover and press come from `Pressable`'s state callback, so they cost what
 * they cost anywhere else in this platform: the hover path swaps a CSS class
 * on the widget without a React render.
 *
 * An activatable row is **focusable** — Tab and the arrow keys move between
 * rows through GTK's own keynav, Enter and Space activate the focused one,
 * and the focus ring is Adwaita's (`outline`, 2px, inset by 2).
 */
export const ListRow = ({
  title,
  subtitle,
  prefix,
  suffix,
  onPress,
  position = "middle",
  separator,
  children,
  style,
  testID,
}: ListRowProps): ReactNode => {
  const scheme = useColorScheme() === "dark" ? "dark" : "light"
  const tints = TINTS[scheme]
  const isFirst = position === "first" || position === "only"
  const isLast = position === "last" || position === "only"
  const drawSeparator = separator ?? !isLast

  const body = (
    <>
      {children}
      {prefix}
      <View style={styles.titleBox}>
        {typeof title === "string" ? (
          <Text style={styles.title}>{title}</Text>
        ) : (
          title
        )}
        {typeof subtitle === "string" ? (
          <Text style={styles.subtitle}>{subtitle}</Text>
        ) : (
          subtitle
        )}
      </View>
      {suffix}
    </>
  )

  const base = [
    styles.row,
    isFirst && styles.firstRow,
    isLast && styles.lastRow,
    drawSeparator && styles.separatorUnder,
    style,
  ]

  if (!onPress) {
    return (
      <View
        testID={testID}
        style={base}
      >
        {body}
      </View>
    )
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      // The tint goes on the ROW, which is why the corner radii above have to
      // be on the row too: a hovered first row must round its own top corners
      // or the highlight paints square over the card's rounded ones.
      style={({ hovered, pressed, focused }) => [
        ...base,
        hovered && { backgroundColor: tints.hover },
        pressed && { backgroundColor: tints.press },
        focused && focusRing,
      ]}
    >
      {body}
    </Pressable>
  )
}

/**
 * The hairline between two rows, for lists that draw their own separators —
 * a `FlatList`'s `ItemSeparatorComponent` is exactly this, and using it means
 * the rows themselves stay position-agnostic apart from their corners.
 */
export const ListSeparator = (): ReactNode => <View style={styles.separator} />
