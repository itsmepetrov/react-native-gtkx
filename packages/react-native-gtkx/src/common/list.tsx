// Adwaita's boxed list, for code written in React Native.
//
// WHY this is here rather than in an app. `.boxed-list` is the single most
// recognisable piece of GNOME chrome, and docs/research/react-native-first-showcase.md
// measured what it actually is: a rounded, shadowed card whose rows carry
// hairline separators, a hover tint and a press tint. Every one of those is a
// style — there is no widget BEHAVIOUR in the look at all. So an app can build
// it from `View` and `Pressable`, and `examples/tasks-nav` proves it.
//
// What an app should not have to do is rediscover the numbers. They come from
// libadwaita's own compiled stylesheet, they are not obvious (the frame is a
// three-part `box-shadow`, not a border; the first and last rows carry the
// corner radii, not the container), and they move when libadwaita moves. That
// is a platform's job, which is what this subpath is.
//
// Everything below is portable React Native underneath — no widget is created
// that an app could not have created itself. Compare `Widget`/`SlotContent`
// next door, which exist precisely because they CANNOT be written in RN.
import { type ReactNode } from "react"
import { useColorScheme } from "../apis/index"
import { Pressable } from "../components/pressable"
import { Text } from "../components/text"
import { View } from "../components/view"
import { PlatformColor, StyleSheet } from "../style/index"
import type { StyleProp } from "../contracts"

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
  // percentage), so the computed value is what an app can write. Documented
  // in docs/api.md rather than hidden here.
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
  style?: StyleProp
  testID?: string
}

/**
 * The `.boxed-list` frame: a rounded, shadowed card. Put `ListRow`s in it
 * directly, or a `FlatList` whose `renderItem` returns them.
 *
 * ```tsx
 * <List>
 *   {tasks.map((task, index) => (
 *     <ListRow
 *       key={task.id}
 *       title={task.title}
 *       position={rowPosition(index, tasks.length)}
 *       onPress={() => open(task)}
 *     />
 *   ))}
 * </List>
 * ```
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
  style?: StyleProp
  testID?: string
}

/**
 * One row of a {@link List} — `AdwActionRow`'s layout and states, built from
 * `Pressable`, `View` and `Text`.
 *
 * Hover and press come from `Pressable`'s state callback, so they cost what
 * they cost anywhere else in this platform: the hover path swaps a CSS class
 * on the widget without a React render (see components/pressable.tsx).
 *
 * **Not yet:** keyboard navigation between rows and a focus ring.
 * `GtkListBox` implements those as widget behaviour and RN has no focus model
 * for `View` to hang them on — `Pressable`'s state is `{pressed, hovered}`
 * with no `focused`. The ring itself is now drawable (`outlineWidth` and
 * friends), so what is missing is the state, not the paint.
 */
export const ListRow = ({
  title,
  subtitle,
  prefix,
  suffix,
  onPress,
  position = "middle",
  separator,
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
      style={({ hovered, pressed }) => [
        ...base,
        hovered && { backgroundColor: tints.hover },
        pressed && { backgroundColor: tints.press },
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
