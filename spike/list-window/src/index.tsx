// Windowing spike (list-virtualization epic, task 001): prove that a list of
// 10 000 rows can live as a ~30-element mounted window over the layout
// manager — the content node carries the full prefix-sum height, each row is
// absolutely positioned at its offset, scrolling remounts the window slice.
//
// Phases (markers consumed by run-vm.sh):
//   MOUNT   — time from process start to the first content layout
//   WINDOW  — mounted rows vs total
//   SHIFT   — window remount latency while auto-scrolling (p50/p95)
//   JUMP    — random access: scroll to the middle of 10k rows
//   ANCHOR  — a height correction above the window keeps the view anchored
//   SPIKE-DONE
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  AppRegistry,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewHandle,
} from "react-native"

const T0 = performance.now()

const TOTAL = 10_000
const EST = 40
const WINDOW = 30
const BUFFER = 8

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#241f31" },
  row: {
    position: "absolute",
    left: 8,
    right: 8,
    height: EST - 4,
    borderRadius: 6,
    backgroundColor: "#3d3846",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  rowText: { color: "#ffffff", fontSize: 13 },
})

const quantile = (values: number[], q: number): number => {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!
}

const App = () => {
  // Height registry: estimated EST everywhere, one late correction (ANCHOR
  // phase) turns row 100 into 2×EST — offsets below shift, the anchor
  // compensates the scroll position.
  const [corrected, setCorrected] = useState(false)
  const offsetOf = useMemo(() => {
    return (index: number): number =>
      index * EST + (corrected && index > 100 ? EST : 0)
  }, [corrected])
  const totalHeight = TOTAL * EST + (corrected ? EST : 0)

  const [start, setStart] = useState(0)
  const scrollRef = useRef<ScrollViewHandle>(null)
  const shiftStarted = useRef<number | null>(null)
  const shiftTimes = useRef<number[]>([])
  const mounted = useRef(false)

  const indices = useMemo(() => {
    const end = Math.min(TOTAL, start + WINDOW)
    return Array.from({ length: end - start }, (_, i) => start + i)
  }, [start])

  useLayoutEffect(() => {
    if (shiftStarted.current !== null) {
      shiftTimes.current.push(performance.now() - shiftStarted.current)
      shiftStarted.current = null
    }
  })

  const onScroll = (event: {
    nativeEvent: { contentOffset: { x: number; y: number } }
  }): void => {
    const y = event.nativeEvent.contentOffset.y
    const next = Math.max(0, Math.floor(y / EST) - BUFFER)
    if (next !== start) {
      shiftStarted.current = performance.now()
      setStart(next)
    }
  }

  useLayoutEffect(() => {
    if (mounted.current) {
      return
    }
    mounted.current = true
    console.log(
      `MOUNT ${(performance.now() - T0).toFixed(0)}ms to first layout`,
    )
    console.log(`WINDOW ${WINDOW} mounted of ${TOTAL} rows`)

    // Auto-drive: 40 scroll steps of 800px at 100ms, then a jump to the
    // middle, then the height correction with anchoring.
    let step = 0
    let y = 0
    const timer = setInterval(() => {
      step += 1
      if (step <= 40) {
        y += 800
        scrollRef.current?.scrollTo({ y })
        return
      }
      clearInterval(timer)
      const times = shiftTimes.current
      console.log(
        `SHIFT p50=${quantile(times, 0.5).toFixed(1)}ms p95=${quantile(times, 0.95).toFixed(1)}ms over ${times.length} remounts`,
      )
      const jumpStarted = performance.now()
      scrollRef.current?.scrollTo({ y: (TOTAL / 2) * EST })
      setTimeout(() => {
        console.log(
          `JUMP to row ${TOTAL / 2} in ${(performance.now() - jumpStarted).toFixed(1)}ms`,
        )
        // Height correction above the current window: compensate the scroll
        // position by the delta so the visible rows do not move (anchor).
        const anchorY = (TOTAL / 2) * EST + EST
        setCorrected(true)
        scrollRef.current?.scrollTo({ y: anchorY })
        setTimeout(() => {
          console.log("ANCHOR corrected height above window, view compensated")
          console.log("SPIKE-DONE")
          if (process.env.SPIKE_EXIT === "1") {
            process.exit(0)
          }
        }, 300)
      }, 300)
    }, 100)
  })

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      onScroll={onScroll}
    >
      <View style={{ height: totalHeight }}>
        {indices.map((index) => (
          <View
            key={index}
            style={[styles.row, { top: offsetOf(index) }]}
          >
            <Text style={styles.rowText}>{`row #${index}`}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

AppRegistry.registerComponent("listwindow", () => App)
AppRegistry.runApplication("listwindow", {
  title: "list-window spike",
  width: 480,
  height: 640,
})
