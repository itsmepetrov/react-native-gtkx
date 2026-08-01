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
import { createContext, useContext, type ReactNode } from "react"
import { useColorScheme } from "../apis/index"
import { Pressable } from "../components/pressable"
import { Text } from "../components/text"
import { View } from "../components/view"
import { PlatformColor, StyleSheet } from "../style/index"
import type { StyleProp } from "../contracts"
import { Controllers } from "../gtk/controllers"
import {
  Gdk,
  GObject,
  Gtk,
  GtkDragSource,
  GtkDropTarget,
} from "../gtkx/bridge/index"

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

/**
 * Where a row reports a completed drag. Carried through context so an app
 * writes the handler once on the `List` and an id per `ListRow`, instead of
 * threading a callback through whatever component renders its rows.
 */
const ReorderContext = createContext<ListReorderHandler | null>(null)

export type ListReorderHandler = (draggedId: string, targetId: string) => void

export type ListProps = {
  children?: ReactNode
  /**
   * Enables drag-to-reorder for every {@link ListRow} that carries a
   * `reorderId`. Called with the id of the row being dragged and the id of
   * the row it was dropped on; the dragged row belongs in front of that one.
   *
   * Ids, not indices, on purpose: the rows are React children, so a `List`
   * cannot see their order, and an app that reorders by id never has to
   * reconcile an index against a list that filtering or sorting has already
   * changed underneath it.
   */
  onReorder?: ListReorderHandler
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
export const List = ({
  children,
  onReorder,
  style,
  testID,
}: ListProps): ReactNode => (
  <ReorderContext.Provider value={onReorder ?? null}>
    <View
      testID={testID}
      style={[styles.list, style]}
    >
      {children}
    </View>
  </ReorderContext.Provider>
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
  /**
   * Identifies this row for drag-to-reorder, and enables it. Both halves at
   * once: the row becomes a drag SOURCE carrying this id, and a drop TARGET
   * that reports the id it received to the enclosing `List`'s `onReorder`.
   *
   * Without a `List` `onReorder` above it, nothing is attached — an id with
   * no handler cannot mean anything, and the rows of a list that is not
   * reorderable should not offer a drag.
   */
  reorderId?: string
  style?: StyleProp
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
 * The GTK half of drag-to-reorder, kept in one place so a row can stay a
 * `Pressable` with children.
 *
 * WHY GTK's own drag-and-drop and not a JS one. Every RN drag-reorder list
 * (`react-native-draggable-flatlist` and its relatives) is built on
 * react-native-gesture-handler + react-native-reanimated, and this platform
 * implements neither (docs/research/gestures.md). GDK's is right there, and
 * it brings a real drag icon, the correct cursors and content negotiation
 * with other applications for free.
 *
 * The payload is the row id as a plain GObject string, the shape
 * `tests/gtk/bridge/auxiliary-elements.gtk.test.tsx` already exercises.
 * Every row is both a source (of its own id) and a target (put the dragged
 * row in front of me).
 */
const ReorderControllers = ({
  id,
  onReorder,
}: {
  id: string
  onReorder: ListReorderHandler
}): ReactNode => (
  <Controllers>
    <GtkDragSource
      actions={Gdk.DragAction.MOVE}
      onPrepare={(x, y, self) => {
        // The drag icon is a snapshot of the row itself, offset by where
        // inside it the drag began — so the row appears to lift off under
        // the cursor rather than jumping to it.
        const row = self.getWidget()
        if (row) {
          self.setIcon(
            Gtk.WidgetPaintable.new(row),
            Math.round(x),
            Math.round(y),
          )
        }
        return Gdk.ContentProvider.newForValue(
          GObject.buildValue(GObject.TYPE_STRING, (value) =>
            value.setString(id),
          ),
        )
      }}
    />
    <GtkDropTarget
      actions={Gdk.DragAction.MOVE}
      types={[GObject.TYPE_STRING]}
      onDrop={(value) => {
        const draggedId = value.getString()
        // A row dropped on itself is a no-op, not a reorder — GTK will
        // happily deliver one.
        if (draggedId && draggedId !== id) {
          onReorder(draggedId, id)
        }
        return true
      }}
    />
  </Controllers>
)

/**
 * One row of a {@link List} — `AdwActionRow`'s layout and states, built from
 * `Pressable`, `View` and `Text`.
 *
 * Hover and press come from `Pressable`'s state callback, so they cost what
 * they cost anywhere else in this platform: the hover path swaps a CSS class
 * on the widget without a React render (see components/pressable.tsx).
 *
 * An activatable row is **focusable** — Tab and the arrow keys move between
 * rows through GTK's own keynav, Enter and Space activate the focused one,
 * and the focus ring is Adwaita's (`outline`, 2px, inset by 2). That is the
 * `GtkListBox` behaviour a hand-built list used to have to give up.
 *
 * **Drag-to-reorder** arrives with `reorderId` plus the enclosing `List`'s
 * `onReorder`, using GDK's real drag-and-drop under the covers — and doing
 * so through `Controllers` from `react-native-gtkx/gtk`, the same public
 * door an app would use for a controller this component does not offer.
 */
export const ListRow = ({
  title,
  subtitle,
  prefix,
  suffix,
  onPress,
  position = "middle",
  separator,
  reorderId,
  style,
  testID,
}: ListRowProps): ReactNode => {
  const scheme = useColorScheme() === "dark" ? "dark" : "light"
  const tints = TINTS[scheme]
  const isFirst = position === "first" || position === "only"
  const isLast = position === "last" || position === "only"
  const drawSeparator = separator ?? !isLast
  const onReorder = useContext(ReorderContext)
  const reorder =
    reorderId !== undefined && onReorder !== null ? (
      <ReorderControllers
        id={reorderId}
        onReorder={onReorder}
      />
    ) : null

  const body = (
    <>
      {reorder}
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
