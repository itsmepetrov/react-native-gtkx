// The REAL `react-native-sortables` — npm's fastest-growing dnd library —
// running its flagship `Sortable.Grid` on this platform's Reanimated,
// gesture-handler and worklets surfaces. The published 1.10.0 tarball,
// nothing aliased away: everything it imports at module scope is answered
// by react-native-gtkx.
//
// Getting here took four walls, each measured in
// docs/research/upstream-libraries.md ("a third experiment"): an optional
// haptics backend reading Turbo Module registries at module scope (shimmed
// in vite.config.ts), no global requestAnimationFrame (PR #126 made it a
// platform global), `withTiming({x, y})` objects (PR #128 widened animated
// values to upstream's real AnimatableValue), and `GestureStateManager` —
// a symbol this platform deliberately REFUSED until the v3 hook path made
// the refusal obsolete (PR #133 reversed it, with the history in
// docs/api.md).
//
// The strategy toggle exercises their reorder model live: `insert` shifts
// every tile between the two positions, `swap` trades exactly two. The
// library keys the grid by strategy, so toggling remounts it — upstream's
// own behaviour, not a workaround here.
//
// This section does NOT scroll (fillsCanvas): the grid arbitrates drags
// against nothing, the same reasoning as the reanimated-dnd section next
// door.
import { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import Sortable from "react-native-sortables"
import { Caption, DemoCard, palette, Section, Status } from "../ui"

type Tile = { id: string; label: string; tone: string }

const TILES: Tile[] = [
  { id: "s1", label: "One", tone: "#1c71d8" },
  { id: "s2", label: "Two", tone: "#26a269" },
  { id: "s3", label: "Three", tone: "#e66100" },
  { id: "s4", label: "Four", tone: "#613583" },
  { id: "s5", label: "Five", tone: "#a51d2d" },
  { id: "s6", label: "Six", tone: "#63452c" },
]

const STRATEGIES = ["insert", "swap"] as const
type Strategy = (typeof STRATEGIES)[number]

export const UpstreamRnSortablesSection = () => {
  const [strategy, setStrategy] = useState<Strategy>("insert")
  const [orders, setOrders] = useState(0)
  const [lastOrder, setLastOrder] = useState(
    TILES.map((tile) => tile.label).join(" "),
  )

  return (
    <GestureHandlerRootView style={styles.root}>
      <Section
        title="Upstream react-native-sortables"
        subtitle="The published 1.10.0 tarball of npm's fastest-growing dnd library, on this platform's Reanimated + gesture-handler. Four measured walls fell to get here — see the caption."
      >
        <DemoCard
          title="Sortable.Grid"
          hint="drag a tile; hold ~200ms first — the library's own dragActivationDelay"
        >
          <View style={styles.toggleRow}>
            {STRATEGIES.map((candidate) => (
              <Pressable
                key={candidate}
                onPress={() => setStrategy(candidate)}
                style={[
                  styles.toggle,
                  strategy === candidate && styles.toggleActive,
                ]}
              >
                <Text
                  style={[
                    styles.toggleText,
                    strategy === candidate && styles.toggleTextActive,
                  ]}
                >
                  {candidate}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.gridBox}>
            <Sortable.Grid
              columns={3}
              data={TILES}
              keyExtractor={(tile: Tile) => tile.id}
              rowGap={10}
              columnGap={10}
              strategy={strategy}
              onDragEnd={({ data }: { data: Tile[] }) => {
                setOrders((count) => count + 1)
                setLastOrder(data.map((tile) => tile.label).join(" "))
              }}
              renderItem={({ item }: { item: Tile }) => (
                <View style={[styles.tile, { backgroundColor: item.tone }]}>
                  <Text style={styles.tileText}>{item.label}</Text>
                </View>
              )}
            />
          </View>
          <Status>
            {orders === 0
              ? "0 reorders — drag a tile"
              : `${orders} reorders — order: ${lastOrder}`}
          </Status>
          <Caption>
            Three libraries on this platform answer &quot;when does a neighbour
            yield?&quot; three different ways. This one resolves the dragged
            item&apos;s CENTRE onto its neighbours (reorderTriggerOrigin:
            &quot;center&quot;, their default) — the same answer
            react-native-gtkx/dnd&apos;s own mirror chose deliberately (~60px on
            a 100px cell, symmetric both directions, any grab point).
            react-native-reanimated-dnd floors the top-left corner instead: ~1px
            of travel toward the list start, the item&apos;s full size away from
            it — the dead zone docs/api.md documents with numbers. Haptics: this
            library ships an optional backend chain and every adapter declines
            here (there is no Linux desktop haptics standard) — silently off,
            exactly as its own fallback design intends.
          </Caption>
        </DemoCard>
      </Section>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  toggle: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: palette.cardAlt,
  },
  toggleActive: {
    backgroundColor: palette.accent,
  },
  toggleText: {
    color: palette.textDim,
    fontSize: 13,
  },
  toggleTextActive: {
    color: "#ffffff",
  },
  gridBox: {
    width: 380,
  },
  tile: {
    borderRadius: 10,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  tileText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
})
