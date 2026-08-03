// Drag and drop: `react-native-reanimated-dnd`'s API, on GTK's own DnD.
//
// Every import below is the one an app already using that library writes. The
// Metro and Vite presets rewrite `react-native-reanimated-dnd` to
// `react-native-gtkx/dnd` on Linux, so a ported app's source is unchanged;
// this file imports the subpath directly only because the gallery IS the
// platform's repo and has no such package to alias.
//
// What is genuinely different from every other section here: the drag itself
// is not drawn by React Native. GDK carries a `Gtk.WidgetPaintable` of the
// dragged view above every window, with the theme's own cursors — which is
// why the card does not follow the pointer the way a Reanimated one would,
// and why the drop works across widgets that React Native never created.
import { useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import {
  Draggable,
  Droppable,
  DropProvider,
  GridStrategy,
  Sortable,
  SortableDirection,
  SortableGrid,
  SortableGridItem,
  SortableItem,
  type SortableGridRenderItemProps,
  type SortableRenderItemProps,
} from "react-native-gtkx/dnd"
import { Caption, DemoCard, palette, Section, Status } from "../ui"

type Card = { id: string; title: string; colour: string }

const CARDS: Card[] = [
  { id: "c1", title: "Design", colour: palette.accent },
  { id: "c2", title: "Build", colour: palette.green },
  { id: "c3", title: "Ship", colour: palette.purple },
]

type Track = { id: string; title: string; artist: string }

const TRACKS: Track[] = [
  { id: "t1", title: "Sonnet", artist: "Verse" },
  { id: "t2", title: "Coda", artist: "Bridge" },
  { id: "t3", title: "Refrain", artist: "Chorus" },
  { id: "t4", title: "Reprise", artist: "Verse" },
]

type EscapeCard = { id: string; title: string }

const ESCAPE_CARD: EscapeCard = { id: "escape-1", title: "Escape me" }

type Tile = { id: string; label: string }

const TILES: Tile[] = [
  { id: "g1", label: "1" },
  { id: "g2", label: "2" },
  { id: "g3", label: "3" },
  { id: "g4", label: "4" },
  { id: "g5", label: "5" },
  { id: "g6", label: "6" },
]

const GRID_TILE = 68
const GRID_GAP = 8
const GRID_COLUMNS = 3

type Chip = { id: string; label: string }

const CHIPS: Chip[] = [
  { id: "c1", label: "Fast" },
  { id: "c2", label: "Native" },
  { id: "c3", label: "Linux" },
  { id: "c4", label: "GTK" },
]

const CHIP_WIDTH = 92

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  zone: {
    flex: 1,
    minHeight: 84,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: palette.cardAlt,
    backgroundColor: palette.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  zoneActive: { borderColor: palette.accent },
  zoneLabel: { color: palette.text, fontSize: 13, fontWeight: "700" },
  zoneCount: { color: palette.textFaint, fontSize: 12 },
  card: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  cardLabel: { color: palette.onColor, fontSize: 13, fontWeight: "700" },
  list: {
    maxHeight: 220,
    borderRadius: 10,
    backgroundColor: palette.cardAlt,
  },
  track: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  trackText: { flex: 1, gap: 1 },
  trackTitle: { color: palette.text, fontSize: 13, fontWeight: "700" },
  trackArtist: { color: palette.textFaint, fontSize: 11 },
  handle: { paddingHorizontal: 6, paddingVertical: 4 },
  handleGlyph: { color: palette.textDim, fontSize: 16 },
  readout: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: {
    minWidth: 108,
    backgroundColor: palette.cardAlt,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 2,
  },
  statLabel: { color: palette.textFaint, fontSize: 11 },
  statValue: { color: palette.text, fontSize: 13, fontWeight: "700" },
  escapeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  // Visibly small and clipped, on purpose: the card inside sits well within
  // it at rest, so the only way it ever crosses this box's edge is the
  // window-level ghost following the pointer out during a drag.
  clipBox: {
    width: 110,
    height: 110,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: palette.window,
    borderWidth: 2,
    borderColor: palette.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  escapeZone: {
    flex: 1,
    alignSelf: "stretch",
  },
  gridBox: {
    borderRadius: 10,
    backgroundColor: palette.cardAlt,
    padding: 8,
    alignSelf: "flex-start",
  },
  tile: {
    width: GRID_TILE,
    height: GRID_TILE,
    borderRadius: 8,
    backgroundColor: palette.overlay,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: { color: palette.text, fontSize: 20, fontWeight: "700" },
  chipBox: {
    height: 56,
    borderRadius: 10,
    backgroundColor: palette.cardAlt,
  },
  chipList: { flex: 1 },
  chip: {
    width: CHIP_WIDTH,
    borderRadius: 999,
    backgroundColor: palette.overlay,
    alignItems: "center",
    justifyContent: "center",
  },
  chipLabel: { color: palette.text, fontSize: 12, fontWeight: "700" },
})

const Stat = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.stat}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
)

/** A `Draggable` inside a visibly small `overflow: hidden` box, with the drop
 *  zone OUTSIDE it — the rig `drag-layer.gtk.test.tsx` measures, here for a
 *  screenshot instead of an assertion. Drag past the box's own edge and a
 *  live ghost keeps going while the card underneath it dims and stays put. */
const Escape = () => {
  const [dropped, setDropped] = useState(0)

  return (
    <DropProvider style={styles.escapeRow}>
      <View style={styles.clipBox}>
        <Draggable<EscapeCard>
          data={ESCAPE_CARD}
          draggableId={ESCAPE_CARD.id}
          style={[styles.card, { backgroundColor: palette.orange }]}
        >
          <Text style={styles.cardLabel}>Escape me</Text>
        </Draggable>
      </View>
      <Droppable<EscapeCard>
        droppableId="escape-drop"
        activeStyle={styles.zoneActive}
        onDrop={() => setDropped((count) => count + 1)}
        style={[styles.zone, styles.escapeZone]}
      >
        <Text style={styles.zoneLabel}>Drop here</Text>
        <Text style={styles.zoneCount}>{dropped} dropped</Text>
      </Droppable>
    </DropProvider>
  )
}

/** A small photo-tile grid, `GridStrategy.Insert`: dropping a tile onto
 *  another shifts everything between its old and new index rather than
 *  trading places with just the one underneath. */
const TileGrid = () => {
  const [order, setOrder] = useState("no tiles reordered yet")

  return (
    <View style={styles.gridBox}>
      <SortableGrid<Tile>
        data={TILES}
        strategy={GridStrategy.Insert}
        dimensions={{
          columns: GRID_COLUMNS,
          itemWidth: GRID_TILE,
          itemHeight: GRID_TILE,
          columnGap: GRID_GAP,
          rowGap: GRID_GAP,
        }}
        renderItem={({
          item,
          id,
          ...rest
        }: SortableGridRenderItemProps<Tile>) => (
          <SortableGridItem<Tile>
            key={id}
            id={id}
            data={item}
            {...rest}
            onDrop={(_id, _position, all) =>
              setOrder(
                Object.entries(all ?? {})
                  .sort((left, right) => left[1].index - right[1].index)
                  .map(([key]) => key)
                  .join(", "),
              )
            }
          >
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>{item.label}</Text>
            </View>
          </SortableGridItem>
        )}
      />
      <Status>{order}</Status>
    </View>
  )
}

/** The same reorder-by-crossing mechanism, `SortableDirection.Horizontal`: a
 *  chip strip rather than a column, dragged sideways. */
const ChipRow = () => {
  const [order, setOrder] = useState("Fast, Native, Linux, GTK")

  return (
    <>
      <View style={styles.chipBox}>
        <Sortable<Chip>
          data={CHIPS}
          direction={SortableDirection.Horizontal}
          itemWidth={CHIP_WIDTH}
          gap={8}
          paddingHorizontal={8}
          style={styles.chipList}
          renderItem={({
            item,
            id,
            ...rest
          }: SortableRenderItemProps<Chip>) => (
            <SortableItem<Chip>
              key={id}
              id={id}
              data={item}
              {...rest}
              style={styles.chip}
            >
              <Text style={styles.chipLabel}>{item.label}</Text>
            </SortableItem>
          )}
          onDrop={(_id, _position, all) =>
            setOrder(
              Object.entries(all ?? {})
                .sort((left, right) => left[1] - right[1])
                .map(
                  ([key]) =>
                    CHIPS.find((chip) => chip.id === key)?.label ?? key,
                )
                .join(", "),
            )
          }
        />
      </View>
      <Status>Settled order: {order}</Status>
    </>
  )
}

/** Drag a card into a zone. The zone lights up through `activeStyle` while a
 *  drag is over it, and `capacity` makes a full zone REFUSE the drop — GDK
 *  then shows the no-drop cursor before the user lets go. */
const Zones = () => {
  const [assigned, setAssigned] = useState<Record<string, string>>({})

  const zone = (id: string, label: string, capacity?: number) => (
    <Droppable<Card>
      droppableId={id}
      capacity={capacity}
      activeStyle={styles.zoneActive}
      onDrop={(card) => setAssigned((all) => ({ ...all, [card.id]: label }))}
      style={styles.zone}
    >
      <Text style={styles.zoneLabel}>{label}</Text>
      <Text style={styles.zoneCount}>
        {Object.values(assigned).filter((value) => value === label).length}
        {capacity === undefined ? "" : ` / ${capacity}`}
      </Text>
    </Droppable>
  )

  return (
    <DropProvider style={{ gap: 10 }}>
      <View style={styles.row}>
        {zone("todo", "To do")}
        {zone("doing", "Doing", 1)}
        {zone("done", "Done")}
      </View>
      <View style={styles.row}>
        {CARDS.map((card) => (
          <Draggable<Card>
            key={card.id}
            data={card}
            draggableId={card.id}
            style={[styles.card, { backgroundColor: card.colour }]}
          >
            <Text style={styles.cardLabel}>{card.title}</Text>
          </Draggable>
        ))}
      </View>
      <View style={styles.readout}>
        {CARDS.map((card) => (
          <Stat
            key={card.id}
            label={card.title}
            value={assigned[card.id] ?? "unassigned"}
          />
        ))}
      </View>
    </DropProvider>
  )
}

/** The sortable list, written exactly as upstream documents it: destructure
 *  `item`/`id`, forward the rest opaquely. That spread compiling unchanged is
 *  the whole point of mirroring the API. */
const Queue = () => {
  const [order, setOrder] = useState("t1, t2, t3, t4")

  return (
    <>
      <Sortable<Track>
        data={TRACKS}
        style={styles.list}
        onDrop={(_id, _position, all) =>
          setOrder(
            Object.entries(all ?? {})
              .sort((left, right) => left[1] - right[1])
              .map(([key]) => key)
              .join(", "),
          )
        }
        renderItem={({ item, id, ...rest }: SortableRenderItemProps<Track>) => (
          <SortableItem<Track>
            key={id}
            id={id}
            data={item}
            {...rest}
          >
            <View style={styles.track}>
              <View style={styles.trackText}>
                <Text style={styles.trackTitle}>{item.title}</Text>
                <Text style={styles.trackArtist}>{item.artist}</Text>
              </View>
              {/* The handle owns the GtkDragSource outright, so the rest of
                  the row stays free to press and select. */}
              <SortableItem.Handle style={styles.handle}>
                <Text style={styles.handleGlyph}>⠿</Text>
              </SortableItem.Handle>
            </View>
          </SortableItem>
        )}
      />
      <Caption>Settled order: {order}</Caption>
    </>
  )
}

/** `onDragging` — the callback that looked impossible on this platform.
 *  `GtkDragSource` says nothing between `drag-begin` and `drag-end`, but
 *  `GtkDropControllerMotion` on the provider's own view tracks the pointer
 *  for the whole drag, which reconstructs upstream's `{x, y, tx, ty}`
 *  exactly. */
const Live = () => {
  const [readout, setReadout] = useState({ tx: 0, ty: 0, dragging: false })

  return (
    <DropProvider
      style={{ gap: 10 }}
      onDragStart={() => setReadout((r) => ({ ...r, dragging: true }))}
      onDragEnd={() => setReadout((r) => ({ ...r, dragging: false }))}
      onDragging={({ tx, ty }) =>
        setReadout({ tx: Math.round(tx), ty: Math.round(ty), dragging: true })
      }
    >
      <Draggable<Card>
        data={CARDS[0]!}
        style={[styles.card, { backgroundColor: palette.orange }]}
      >
        <Text style={styles.cardLabel}>Drag me anywhere</Text>
      </Draggable>
      <View style={styles.readout}>
        <Stat
          label="state"
          value={readout.dragging ? "DRAGGING" : "IDLE"}
        />
        <Stat
          label="tx"
          value={String(readout.tx)}
        />
        <Stat
          label="ty"
          value={String(readout.ty)}
        />
      </View>
    </DropProvider>
  )
}

export const DndSection = () => (
  <Section
    title="Drag and drop"
    subtitle="react-native-reanimated-dnd's API on GtkDragSource/GtkDropTarget. The presets alias the package name, so a ported app keeps its source."
  >
    <DemoCard
      title="Draggable and Droppable"
      hint="Drag a card onto a zone. Zones light up through activeStyle; 'Doing' takes one card and then refuses — watch the cursor."
    >
      <Zones />
      <Caption>
        The card does not follow the pointer: GDK carries a picture of it
        instead, at the point you grabbed it. That is what buys the real cursors
        and drops onto widgets React Native never created — and it is why
        dragAxis, dragBoundsRef and animationFunction are accepted and ignored
        here. See docs/api.md.
      </Caption>
    </DemoCard>

    <DemoCard
      title="Escaping overflow: hidden"
      hint="Drag the card out of its box — a live ghost keeps going past the clip while the card itself dims and stays exactly where it was."
    >
      <Escape />
      <Caption>
        A window-level Gtk.WidgetPaintable copy — not the card itself — floats
        above this window&apos;s real content for as long as the drag lasts,
        which is what lets it cross this box&apos;s overflow: hidden clip that
        nothing here reparents into. measure() still reports the card&apos;s
        real, unmoved position throughout; only the copy is wherever the pointer
        took it.
      </Caption>
    </DemoCard>

    <DemoCard
      title="Sortable"
      hint="Drag a row by its handle. The list rearranges live under the drag icon, which is what upstream's animated gaps do without the spring."
    >
      <Queue />
      <Caption>
        The component owns the order, exactly as upstream requires — read the
        settled one from onDrop&apos;s allPositions rather than reordering your
        own array in onMove.
      </Caption>
    </DemoCard>

    <DemoCard
      title="SortableGrid"
      hint="Drag a tile onto another — GridStrategy.Insert shifts everything between the two indices rather than trading places with just the one underneath."
    >
      <TileGrid />
      <Caption>
        Cells lay out in a real Yoga flexWrap grid instead of upstream&apos;s
        absolutely-positioned ones — same row/column arithmetic
        (calculateGridPosition), a different engine painting it. A grid too tall
        or wide for its own box keeps autoscrolling toward whichever edge a drag
        lingers near, the same GtkDropControllerMotion-driven tick the plain
        Sortable above uses.
      </Caption>
    </DemoCard>

    <DemoCard
      title="Sortable — horizontal"
      hint="SortableDirection.Horizontal: drag a chip past its neighbour, sideways."
    >
      <ChipRow />
      <Caption>
        The same reorder-by-crossing mechanism as the vertical Sortable above —
        the axis is a render-time branch here, not a second implementation,
        because GDK hit-tests the real widget tree either way.
      </Caption>
    </DemoCard>

    <DemoCard
      title="onDragging"
      hint="tx/ty are how far the pointer has moved since the drag began — the translation the view would have had."
    >
      <Live />
      <Caption>
        GtkDragSource goes quiet once a drag starts, so this comes from a
        GtkDropControllerMotion on the provider&apos;s own view.
      </Caption>
    </DemoCard>
  </Section>
)
