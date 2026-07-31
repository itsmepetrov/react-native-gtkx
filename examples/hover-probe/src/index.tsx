// Hover-latency probe (hover-perf epic, task 007). Measures how long a
// pointer crossing takes to become an actual highlight change, for two arms
// that share this one file so the method is identical:
//
//   HOVER_MODE=pressable (default) — a FlatList of Pressable rows using the
//     `style={({ hovered }) => ...}` pattern this codebase's own examples
//     already use for row hover (hn-app cards, the gallery buttons demo,
//     the sidebar article list in adwaita-primitives).
//   HOVER_MODE=native — a plain Gtk.ListBox of Gtk.ListBoxRow, relying
//     entirely on GTK's own prelight/`:hover` handling: no Pressable, no
//     FlatList, no Yoga on the rows at all. This is the "GtkListBox with
//     none of our layer" reference task 007 asks for, on the same rig.
//
// Both arms fill the whole window (no header chrome, no sidebar): a
// maximized window's bounds ARE the list's bounds, so a real ydotool mouse
// sweep does not need to know the window's on-screen position.
//
// The pressable arm's numbers come from the package's own GTKX_PERF
// counters (pressable.hoverApply / pressable.hoverFullCycle / hoverEvent —
// see src/components/pressable.tsx); FlatList wraps ScrollView, which is
// what starts that reporter, so nothing extra is needed here. The native
// arm has no such hook by design, so this file adds one tiny aggregator of
// its own, printed once a second in the same per-second shape (`HOVER_PERF
// {json}`) so both arms read the same way.
import { useEffect, useRef } from "react"
import {
  Appearance,
  AppRegistry,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type FlatListHandle,
} from "react-native"
import { Gtk, GtkScrolledWindow } from "react-native-gtkx/adwaita"

const env = (name: string, fallback: string): string => {
  const value =
    typeof process !== "undefined"
      ? (process.env as Record<string, string | undefined>)[name]
      : undefined
  return value !== undefined && value !== "" ? value : fallback
}

const MODE = env("HOVER_MODE", "pressable")
const ROWS = Number(env("HOVER_ROWS", "60"))
const IDLE_MS = Number(env("HOVER_IDLE_MS", "6000"))
const SCROLL_MS = Number(env("HOVER_SCROLL_MS", "10000"))
const SCROLL_MAX = Number(env("HOVER_SCROLL_MAX", "1400"))
const SCROLL_STEP = Number(env("HOVER_SCROLL_STEP", "14"))

const mark = (label: string): void => {
  // eslint-disable-next-line no-console -- deliberate script-facing output
  console.log(`PERF_MARK ${label} ${performance.now().toFixed(1)}`)
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const ROW_LABELS = Array.from(
  { length: ROWS },
  (_, i) => `Row ${i + 1} of ${ROWS}`,
)

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#241f31" },
  list: { flex: 1 },
  listContent: { alignItems: "stretch" },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#3d3846",
  },
  rowHovered: { backgroundColor: "#3584e4" },
  rowText: { color: "#ffffff", fontSize: 14 },
})

// --- native arm: its own tiny per-second aggregator -----------------------
// Same shape as perf.ts's dump() on purpose: `<name>.ms/.n/.max` for
// latency samples, `frame.*` for the tick-callback interval, so the two
// arms' logs read side by side without a second parser.
let nativeSamples: number[] = []
let frameLastAt = -1
let frameCount = 0
let frameTotalMs = 0
let frameMaxMs = 0
let frameVeryLate = 0

const startNativeReporter = (): void => {
  setInterval(() => {
    const out: Record<string, number> = { t: Math.round(performance.now()) }
    let hasData = false
    if (nativeSamples.length > 0) {
      const n = nativeSamples.length
      const sum = nativeSamples.reduce((a, b) => a + b, 0)
      out["native.hoverApply.ms"] = Math.round((sum / n) * 100) / 100
      out["native.hoverApply.n"] = n
      out["native.hoverApply.max"] =
        Math.round(Math.max(...nativeSamples) * 100) / 100
      hasData = true
    }
    if (frameCount > 0) {
      out["frame.count"] = frameCount
      out["frame.veryLate"] = frameVeryLate
      out["frame.avg"] = Math.round((frameTotalMs / frameCount) * 100) / 100
      out["frame.max"] = Math.round(frameMaxMs * 100) / 100
      hasData = true
    }
    nativeSamples = []
    frameCount = 0
    frameTotalMs = 0
    frameMaxMs = 0
    frameVeryLate = 0
    if (hasData) {
      // eslint-disable-next-line no-console -- deliberate script-facing output
      console.log(`HOVER_PERF ${JSON.stringify(out)}`)
    }
  }, 1000)
}

const onNativeFrameTick = (now: number): void => {
  if (frameLastAt >= 0) {
    const delta = now - frameLastAt
    if (delta < 250) {
      frameCount += 1
      frameTotalMs += delta
      if (delta > frameMaxMs) {
        frameMaxMs = delta
      }
      if (delta > 34) {
        frameVeryLate += 1
      }
    }
  }
  frameLastAt = now
}

// Measurement only — does not alter row behavior. `enter` timestamps the
// pointer crossing (the same signal Pressable's own EventControllerMotion
// reacts to); `state-flags-changed` is GTK's own notification that a state
// bit (PRELIGHT = hover) actually flipped, i.e. that the highlight is now
// applied and due to be painted on the next frame.
const attachNativeHoverProbe = (widget: Gtk.Widget | null): void => {
  if (!widget) {
    return
  }
  let enteredAt = 0
  let wasPrelit = false
  const motion = new Gtk.EventControllerMotion()
  motion.on("enter", () => {
    enteredAt = performance.now()
  })
  widget.addController(motion)
  widget.on("state-flags-changed", () => {
    const prelit = (widget.getStateFlags() & Gtk.StateFlags.PRELIGHT) !== 0
    if (prelit && !wasPrelit && enteredAt > 0) {
      nativeSamples.push(performance.now() - enteredAt)
    }
    wasPrelit = prelit
  })
}

// --- driver: idle, then a bouncing scroll for the whole scroll phase ------
const useDriver = (scrollTo: (offset: number) => void): void => {
  const started = useRef(false)
  useEffect(() => {
    if (started.current) {
      return
    }
    started.current = true
    const run = async (): Promise<void> => {
      await sleep(1000)
      mark("idle:start")
      await sleep(IDLE_MS)
      mark("idle:end")

      mark("scroll:start")
      let offset = 0
      let direction = 1
      const start = performance.now()
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          offset += direction * SCROLL_STEP
          if (offset >= SCROLL_MAX) {
            offset = SCROLL_MAX
            direction = -1
          } else if (offset <= 0) {
            offset = 0
            direction = 1
          }
          scrollTo(offset)
          if (performance.now() - start >= SCROLL_MS) {
            clearInterval(timer)
            resolve()
          }
        }, 16)
      })
      mark("scroll:end")

      mark("PERF_DONE")
      // eslint-disable-next-line no-console -- script-facing
      console.log("PERF_DONE")
    }
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

const PressableProbe = () => {
  const listRef = useRef<FlatListHandle>(null)
  useDriver((offset) =>
    listRef.current?.scrollToOffset({ offset, animated: false }),
  )
  return (
    <FlatList
      ref={listRef}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={ROW_LABELS}
      keyExtractor={(item) => item}
      windowSize={11}
      renderItem={({ item }) => (
        <Pressable
          style={({ hovered }) => [styles.row, hovered && styles.rowHovered]}
        >
          <Text style={styles.rowText}>{item}</Text>
        </Pressable>
      )}
    />
  )
}

// The rows are built IMPERATIVELY with the raw GI classes, not JSX: a
// wrapReactNative component (GtkListBox) nested inside another one
// (GtkScrolledWindow) both resolve their Yoga node against the same
// ambient host, so the inner one's real native parent (the ScrolledWindow)
// never runs an allocate pass over it — it stays unsized. Plain
// `Gtk.ListBox.new()` + `.append()` sidesteps that entirely and is, if
// anything, an even purer "none of our layer" reference: no JSX
// reconciler involved in the row tree at all, only GTK's own APIs.
const buildNativeList = (): Gtk.ListBox => {
  const listBox = Gtk.ListBox.new()
  listBox.addCssClass("navigation-sidebar")
  for (const label of ROW_LABELS) {
    const row = Gtk.ListBoxRow.new()
    const gtkLabel = Gtk.Label.new(label)
    gtkLabel.setXalign(0)
    gtkLabel.setMarginTop(12)
    gtkLabel.setMarginBottom(12)
    gtkLabel.setMarginStart(16)
    gtkLabel.setMarginEnd(16)
    row.setChild(gtkLabel)
    listBox.append(row)
    attachNativeHoverProbe(row)
  }
  return listBox
}

const NativeProbe = () => {
  const scrolledRef = useRef<Gtk.ScrolledWindow | null>(null)
  useDriver((offset) => {
    scrolledRef.current?.getVadjustment().setValue(offset)
  })
  useEffect(() => {
    startNativeReporter()
    const widget = scrolledRef.current
    if (!widget) {
      return
    }
    widget.setChild(buildNativeList())
    const id = widget.addTickCallback(() => {
      onNativeFrameTick(performance.now())
      return true
    })
    return () => {
      widget.removeTickCallback(id)
    }
  }, [])
  return (
    // `flex: 1` measured 0 height here: GtkScrolledWindow is a
    // wrapReactNative leaf (measureFromWidget), and a flexGrow leaf with no
    // explicit basis does not resolve against this engine's flex-grow pass
    // the way a plain View does. Percentage sizing resolves directly
    // against the parent's already-known rect instead, sidestepping that —
    // found empirically, not worth chasing further for a measurement probe.
    <GtkScrolledWindow
      ref={scrolledRef}
      style={{ width: "100%", height: "100%" }}
      hscrollbarPolicy={Gtk.PolicyType.NEVER}
    />
  )
}

const App = () => {
  mark(
    `config mode=${MODE} rows=${ROWS} idleMs=${IDLE_MS} scrollMs=${SCROLL_MS}`,
  )
  return (
    <View style={styles.screen}>
      {MODE === "native" ? <NativeProbe /> : <PressableProbe />}
    </View>
  )
}

Appearance.setColorScheme("dark")

AppRegistry.registerComponent("hover-probe", () => App)
AppRegistry.runApplication("hover-probe", {
  title: "hover-probe",
  width: 480,
  height: 820,
})
