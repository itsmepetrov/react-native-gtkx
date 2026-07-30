// Scroll-performance probe (perf-scroll branch): a deterministic hn-app-like
// card list, driven programmatically, no network. Run with GTKX_PERF=1 so
// the package-side instrumentation reports per-second counters; this app
// adds PERF_MARK lines so the log parser can attribute seconds to phases.
//
// Env matrix:
//   PERF_MODE      flatlist (default) | scrollview
//   PERF_ROWS      row count (default 500)
//   PERF_STEP      px per 16ms driver tick (default 12 → ~750 px/s)
//   PERF_MAX       scroll distance per phase in px (default 6000)
//   PERF_WINDOWSIZE   FlatList windowSize (default 5)
//   PERF_INITIAL      FlatList initialNumToRender (default 10)
//   PERF_ESTIMATE     FlatList estimatedItemSize (default 44 — RN default)
//   PERF_GIL       1 → fixed-height rows + exact getItemLayout
//   PERF_STICKY    1 → stickyHeaderIndices=[0] (sticky machinery active)
//   PERF_WIDTH/PERF_HEIGHT   window default size (sway tiles to output anyway)
import { useEffect, useRef, useState } from "react"
import {
  Appearance,
  AppRegistry,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type FlatListHandle,
  type ScrollViewHandle,
} from "react-native"

const env = (name: string, fallback: string): string => {
  const value =
    typeof process !== "undefined"
      ? (process.env as Record<string, string | undefined>)[name]
      : undefined
  return value !== undefined && value !== "" ? value : fallback
}

const MODE = env("PERF_MODE", "flatlist")
const ROWS = Number(env("PERF_ROWS", "500"))
const STEP = Number(env("PERF_STEP", "12"))
const MAX = Number(env("PERF_MAX", "6000"))
const WINDOW_SIZE = Number(env("PERF_WINDOWSIZE", "5"))
const INITIAL = Number(env("PERF_INITIAL", "10"))
const ESTIMATE = Number(env("PERF_ESTIMATE", "44"))
const GIL = env("PERF_GIL", "0") === "1"
const STICKY = env("PERF_STICKY", "0") === "1"
const WIDTH = Number(env("PERF_WIDTH", "560"))
const HEIGHT = Number(env("PERF_HEIGHT", "760"))

// Fixed row extent for the getItemLayout variant: content height 64 + row
// marginBottom 10.
const FIXED_CARD_H = 64
const FIXED_ROW_EXTENT = FIXED_CARD_H + 10

const mark = (label: string): void => {
  // eslint-disable-next-line no-console -- deliberate script-facing output
  console.log(`PERF_MARK ${label} ${performance.now().toFixed(1)}`)
}

// Deterministic content: seeded PRNG → title lengths vary, some wrap to a
// second/third line at narrow widths (variable row heights like hn-app).
const mulberry32 = (seed: number) => (): number => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const WORDS = [
  "yoga",
  "gtk",
  "wayland",
  "scroll",
  "frame",
  "widget",
  "layout",
  "signal",
  "adjustment",
  "viewport",
  "kinetic",
  "allocation",
  "pixman",
  "render",
  "virtualized",
  "window",
  "measure",
  "commit",
  "reconciler",
  "bridge",
]

type Row = { id: number; title: string; meta: string }

const makeRows = (count: number): Row[] => {
  const random = mulberry32(1337)
  const rows: Row[] = []
  for (let index = 0; index < count; index += 1) {
    const words = GIL ? 4 : 4 + Math.floor(random() * 14)
    const title = Array.from(
      { length: words },
      () => WORDS[Math.floor(random() * WORDS.length)],
    ).join(" ")
    rows.push({
      id: index,
      title: `${index}. ${title}`,
      meta: `${100 + Math.floor(random() * 900)} points · ${Math.floor(random() * 500)} comments`,
    })
  }
  return rows
}

const DATA = makeRows(ROWS)

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#241f31" },
  list: { flex: 1 },
  listContent: { alignItems: "stretch", paddingTop: 10, paddingBottom: 6 },
  card: {
    backgroundColor: "#3d3846",
    borderRadius: 12,
    padding: 10,
    gap: 4,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  cardFixed: {
    height: FIXED_CARD_H,
    overflow: "hidden",
  },
  title: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  meta: { color: "#c0bfbc", fontSize: 12 },
})

const Card = ({ row }: { row: Row }) => (
  <View style={GIL ? [styles.card, styles.cardFixed] : styles.card}>
    <Text
      style={styles.title}
      numberOfLines={GIL ? 1 : undefined}
    >
      {row.title}
    </Text>
    <Text style={styles.meta}>{row.meta}</Text>
  </View>
)

// Drives the scroll: phase down1 walks 0→MAX in STEP px increments at ~60Hz
// (16ms timer), reset jumps back to 0, phase down2 repeats over the (by
// then) fully measured region. PERF_DONE ends the run.
const useDriver = (scrollTo: (offset: number) => void): void => {
  const started = useRef(false)
  useEffect(() => {
    if (started.current) {
      return
    }
    started.current = true
    const phase = (label: string, from: number, onDone: () => void): void => {
      mark(`${label}:start`)
      let offset = from
      const timer = setInterval(() => {
        offset += STEP
        scrollTo(offset)
        if (offset >= MAX) {
          clearInterval(timer)
          mark(`${label}:end`)
          onDone()
        }
      }, 16)
    }
    setTimeout(() => {
      phase("down1", 0, () => {
        setTimeout(() => {
          mark("reset")
          scrollTo(0)
          setTimeout(() => {
            phase("down2", 0, () => {
              setTimeout(() => {
                mark("PERF_DONE")
                // eslint-disable-next-line no-console -- script-facing
                console.log("PERF_DONE")
              }, 2000)
            })
          }, 3000)
        }, 1000)
      })
    }, 4000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

const FlatListProbe = () => {
  const listRef = useRef<FlatListHandle>(null)
  useDriver((offset) =>
    listRef.current?.scrollToOffset({ offset, animated: false }),
  )
  return (
    <FlatList
      ref={listRef}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={DATA}
      keyExtractor={(row) => String(row.id)}
      renderItem={({ item }) => <Card row={item} />}
      windowSize={WINDOW_SIZE}
      initialNumToRender={INITIAL}
      estimatedItemSize={ESTIMATE}
      getItemLayout={
        GIL
          ? (_data, index) => ({
              length: FIXED_ROW_EXTENT,
              offset: FIXED_ROW_EXTENT * index,
              index,
            })
          : undefined
      }
      stickyHeaderIndices={STICKY ? [0] : undefined}
    />
  )
}

const ScrollViewProbe = () => {
  const scrollRef = useRef<ScrollViewHandle>(null)
  useDriver((offset) => scrollRef.current?.scrollTo({ y: offset }))
  return (
    <ScrollView
      ref={scrollRef}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      stickyHeaderIndices={STICKY ? [0] : undefined}
    >
      {DATA.map((row) => (
        <Card
          key={row.id}
          row={row}
        />
      ))}
    </ScrollView>
  )
}

const App = () => {
  // Startup marker with the effective matrix cell, for the log.
  const [config] = useState(() => {
    mark(
      `config mode=${MODE} rows=${ROWS} step=${STEP} max=${MAX} ` +
        `windowSize=${WINDOW_SIZE} initial=${INITIAL} estimate=${ESTIMATE} ` +
        `gil=${GIL ? 1 : 0} sticky=${STICKY ? 1 : 0}`,
    )
    return MODE
  })
  return (
    <View style={styles.screen}>
      {config === "scrollview" ? <ScrollViewProbe /> : <FlatListProbe />}
    </View>
  )
}

Appearance.setColorScheme("dark")

AppRegistry.registerComponent("perf-probe", () => App)
AppRegistry.runApplication("perf-probe", {
  title: "perf-probe",
  width: WIDTH,
  height: HEIGHT,
})
