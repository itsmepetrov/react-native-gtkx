// The REAL `react-native-reanimated-dnd`, reordering things: a list, a grid
// and a horizontal strip, all three of them upstream's own `Sortable` family.
//
// Same setup as the drop-zones section next door — the published npm tarball
// (2.0.0), un-aliased for this project only by
// `aliases: { "react-native-reanimated-dnd": false }` in `vite.config.ts`,
// with everything it imports still answered by react-native-gtkx.
//
// The grid and the horizontal list are the two surfaces
// `react-native-gtkx/dnd` deliberately does NOT mirror
// (docs/research/drag-and-drop.md, "Deliberately not implemented"). Whether
// the REAL package could supply them on this platform was an open question no
// reading could settle, so it is asked here, where the real package runs —
// see docs/research/dnd-differential.md. All three reorder.
//
// This section does NOT scroll (see src/index.tsx): the rows are dragged
// vertically and the tags horizontally, and an enclosing ScrollView would be
// arbitrating against both. That is what the `CardGrid` is for — the cases
// visible in one go, wrapping with the window instead of scrolling.
//
// Nothing here is styled by the library: `Sortable`, `SortableItem` and
// `SortableGrid` all take a plain RN `style`, so the screen is in the
// gallery's own palette and follows the theme toggle like every other
// section.
import { useCallback, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import {
  Sortable,
  SortableDirection,
  SortableGrid,
  SortableGridItem,
  SortableItem,
  type SortableGridRenderItemProps,
  type SortableRenderItemProps,
} from "react-native-reanimated-dnd"
import { Caption, CardGrid, DemoCard, palette, Section, Status } from "../ui"

type Task = { id: string; title: string }

const TASKS: Task[] = [
  { id: "task-1", title: "Measure the real package" },
  { id: "task-2", title: "Run it in a real window" },
  { id: "task-3", title: "Drag it with a real pointer" },
  { id: "task-4", title: "Write down what broke" },
]

const ROW_HEIGHT = 56

type Tile = { id: string; label: string }

const TILES: Tile[] = [
  { id: "tile-1", label: "One" },
  { id: "tile-2", label: "Two" },
  { id: "tile-3", label: "Three" },
  { id: "tile-4", label: "Four" },
  { id: "tile-5", label: "Five" },
  { id: "tile-6", label: "Six" },
]

const TILE = 74
const GRID_GAP = 8
const GRID_COLUMNS = 3

type Tag = { id: string; label: string }

const TAGS: Tag[] = [
  { id: "tag-1", label: "React" },
  { id: "tag-2", label: "GTK" },
  { id: "tag-3", label: "Yoga" },
  { id: "tag-4", label: "Wayland" },
]

const TAG_WIDTH = 110

const styles = StyleSheet.create({
  root: { flex: 1 },
  sortableBox: {
    height: ROW_HEIGHT * 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.cardAlt,
    backgroundColor: palette.card,
    overflow: "hidden",
  },
  sortable: { flex: 1 },
  taskRow: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.cardAlt,
  },
  taskHandle: { color: palette.textDim, fontSize: 16 },
  taskTitle: { color: palette.text, fontSize: 14, flex: 1 },
  gridBox: {
    height: TILE * 2 + GRID_GAP,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.cardAlt,
    backgroundColor: palette.card,
    overflow: "hidden",
  },
  grid: { flex: 1 },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 10,
    backgroundColor: palette.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  tileText: { color: palette.text, fontWeight: "600" },
  tagBox: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.cardAlt,
    backgroundColor: palette.card,
    overflow: "hidden",
  },
  tag: {
    width: TAG_WIDTH,
    height: 36,
    borderRadius: 999,
    backgroundColor: palette.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  tagText: { color: palette.text, fontWeight: "600" },
})

export const UpstreamSortablesSection = () => {
  const [moved, setMoved] = useState("no rows reordered yet")
  const [gridMoved, setGridMoved] = useState("no tiles reordered yet")
  const [tagMoved, setTagMoved] = useState("no tags reordered yet")

  // Upstream's contract is that `Sortable` owns the order and the app must
  // NOT write it back from `onMove`; the callback is a notification. So this
  // only renders what it was told, which is also the cheapest way to see
  // whether the worklet that computes the target index ran at all.
  const onMove = useCallback((id: string, from: number, to: number) => {
    setMoved(`${id}: ${from} → ${to}`)
  }, [])

  // Upstream's documented call pattern, unchanged: destructure `item`, `id`
  // and `positions`, and forward the rest of the opaque plumbing into
  // `SortableItem`.
  const renderTask = useCallback(
    (props: SortableRenderItemProps<Task>) => {
      const { item, id, positions, ...rest } = props
      return (
        <SortableItem<Task>
          key={id}
          id={id}
          data={item}
          positions={positions}
          onMove={onMove}
          {...rest}
        >
          <View style={styles.taskRow}>
            <Text style={styles.taskHandle}>⠿</Text>
            <Text style={styles.taskTitle}>{item.title}</Text>
          </View>
        </SortableItem>
      )
    },
    [onMove],
  )

  const renderTile = useCallback((props: SortableGridRenderItemProps<Tile>) => {
    const { item, id, ...rest } = props
    return (
      <SortableGridItem<Tile>
        key={id}
        id={id}
        data={item}
        onMove={(movedId, from, to) =>
          setGridMoved(`${movedId}: ${from} → ${to}`)
        }
        {...rest}
      >
        <View style={styles.tile}>
          <Text style={styles.tileText}>{item.label}</Text>
        </View>
      </SortableGridItem>
    )
  }, [])

  const renderTag = useCallback((props: SortableRenderItemProps<Tag>) => {
    const { item, id, positions, ...rest } = props
    return (
      <SortableItem<Tag>
        key={id}
        id={id}
        data={item}
        positions={positions}
        onMove={(movedId, from, to) =>
          setTagMoved(`${movedId}: ${from} → ${to}`)
        }
        {...rest}
      >
        <View style={styles.tag}>
          <Text style={styles.tagText}>{item.label}</Text>
        </View>
      </SortableItem>
    )
  }, [])

  return (
    // Upstream's own quick start for this library wraps the app in this. On
    // this platform it is the one RNGH symbol that is implemented rather than
    // refused — see src/gesture-handler-compat/index.tsx.
    <GestureHandlerRootView style={styles.root}>
      <Section
        title="Upstream sortables"
        subtitle="react-native-reanimated-dnd 2.0.0, straight from npm and un-aliased: the vertical list, plus the grid and the horizontal strip that react-native-gtkx/dnd deliberately does not mirror."
      >
        <CardGrid>
          <DemoCard
            grid
            title="Sortable"
            hint="Hold a row still for 200ms, then drag it past its neighbour."
          >
            <View style={styles.sortableBox}>
              <Sortable
                data={TASKS}
                renderItem={renderTask}
                itemHeight={ROW_HEIGHT}
                itemKeyExtractor={(task) => task.id}
                style={styles.sortable}
              />
            </View>
            <Status>{moved}</Status>
            <Caption>
              The whole worklet pipeline the earlier research called structural:
              a useAnimatedReaction on positionY computing a target index,
              positions updated on the UI side, the notification pushed back to
              JS through scheduleOnRN, and every row&apos;s top driven per frame
              on an absolutely positioned node.
            </Caption>
          </DemoCard>

          <DemoCard
            grid
            title="SortableGrid"
            hint="Drag a tile a whole cell — 82px here. Stop short and nothing happens."
          >
            <View style={styles.gridBox}>
              <SortableGrid
                data={TILES}
                renderItem={renderTile}
                dimensions={{
                  columns: GRID_COLUMNS,
                  itemWidth: TILE,
                  itemHeight: TILE,
                  rowGap: GRID_GAP,
                  columnGap: GRID_GAP,
                }}
                itemKeyExtractor={(tile) => tile.id}
                style={styles.grid}
              />
            </View>
            <Status>{gridMoved}</Status>
            <Caption>
              That threshold is upstream&apos;s arithmetic, not this
              platform&apos;s: getGridCellFromCoordinates floors the dragged
              tile&apos;s TOP-LEFT corner rather than its centre, so moving to a
              higher index needs the tile to come to rest exactly on top of its
              target, while moving back toward index 0 needs one pixel. Measured
              in all four directions — docs/research/dnd-hover-flicker.md.
            </Caption>
          </DemoCard>
        </CardGrid>

        <DemoCard
          title="Sortable — horizontal"
          hint="SortableDirection.Horizontal. Same hold, then drag a tag sideways past its neighbour."
        >
          <View style={styles.tagBox}>
            <Sortable
              data={TAGS}
              renderItem={renderTag}
              direction={SortableDirection.Horizontal}
              itemWidth={TAG_WIDTH}
              gap={8}
              itemKeyExtractor={(tag) => tag.id}
              style={styles.sortable}
            />
          </View>
          <Status>{tagMoved}</Status>
          <Caption>
            Every sortable on this screen arms
            Gesture.Pan().activateAfterLongPress(200), which is upstream&apos;s
            own default and why a drag needs a dwell first: gesture-handler
            fails the pan outright if the pointer travels before that timer.
            Designed for a device that long-presses, met here by a mouse that
            does not.
          </Caption>
        </DemoCard>
      </Section>
    </GestureHandlerRootView>
  )
}
