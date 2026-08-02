// The animated-size probe, now pointed at the SHIPPED path.
//
// It began as the recon for task 007 (docs/research/animated-size.md), where
// it drove a width through a local copy of the mechanism to find out whether
// the blanket refusal in animated-colors.md §4 was wider than the measurement
// supported. It was. What runs here now is the platform's own code —
// `useAnimatedStyle(() => ({ width: w.value }))` on an `Animated.View` — so the
// checks below are about what ships rather than about a hypothesis, and the
// cost table is the cost of the real write.
//
// Everything asserted is read back out of GTK: `computeBounds()` against the
// stage, `gtk_widget_pick()`, and the toplevel's own size request through
// `gtk_widget_measure()`. Nothing is asserted from the rect store the path
// writes to — reading our own bookkeeping back would pass even if nothing ever
// reached a widget, which is the failure the whole exercise exists to rule out.
//
// The probes:
//
//   A. a driven width reaches real geometry, moves nothing else, and re-lays
//      out the node's OWN content (which a rect write alone does not)
//   B. it is picked where it is drawn
//   C. the toplevel's size request does not move
//   D. `scaleX`, which the warning offers as the nearest transform, is
//      measurably NOT the same thing
//   E. the cost of the whole write at 5 / 60 / 300 siblings, against the naive
//      write it replaces and against a transform
//
// Run: bash spike/animated-size/run-headless.sh
// See docs/research/animated-size.md.
import { useCallback, useEffect, useRef, useState } from "react"
// Imported straight from the package SOURCE rather than through the
// `react-native-gtkx` specifier, which the exports map sends to `dist/`. Two
// reasons, and the first is not convenience: the driven path writes into the
// rect store that `RnGtkxLayout`'s allocate hook reads, and a second copy of
// that module would be a second WeakMap — the write would land nowhere and
// every check below would fail for the wrong reason. The second is that a
// source change is then visible without `npm run build:dist`.
import { AppRegistry } from "../../../packages/react-native-gtkx/src/components/app-registry"
import { useHostNode } from "../../../packages/react-native-gtkx/src/components/host-node"
import { widgetForHandle } from "../../../packages/react-native-gtkx/src/components/measure"
import { Text } from "../../../packages/react-native-gtkx/src/components/text"
import { View } from "../../../packages/react-native-gtkx/src/components/view"
import type { LayoutEngine } from "../../../packages/react-native-gtkx/src/layout/engine"
import type { LayoutNode } from "../../../packages/react-native-gtkx/src/layout/node"
import {
  Gtk,
  measureWidget,
} from "../../../packages/react-native-gtkx/src/gtkx/bridge/index"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "../../../packages/react-native-gtkx/src/reanimated-compat/index"

const M = "as"

let failures = 0

const log = (message: string): void => {
  console.log(`[${M}] ${message}`)
}

const check = (label: string, condition: boolean, detail: string): void => {
  if (!condition) {
    failures += 1
  }
  log(`${condition ? "PASS" : "FAIL"} ${label} — ${detail}`)
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const round = (value: number): number => Math.round(value * 100) / 100

type Rect = { x: number; y: number; width: number; height: number }

/** A widget's rect in another's coordinates — real GTK, not a stored value. */
const boundsIn = (widget: Gtk.Widget, host: Gtk.Widget): Rect => {
  const [ok, bounds] = widget.computeBounds(host)
  if (!ok) {
    throw new Error("no computable bounds")
  }
  return {
    x: round(bounds.getX()),
    y: round(bounds.getY()),
    width: round(bounds.getWidth()),
    height: round(bounds.getHeight()),
  }
}

const same = (a: Rect, b: Rect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

const asText = (r: Rect): string => `(${r.x}, ${r.y}, ${r.width}, ${r.height})`

/** Microseconds per call, median of three runs after a warm-up. */
const microseconds = (
  iterations: number,
  write: (i: number) => void,
): number => {
  for (let i = 0; i < 2000; i += 1) {
    write(i)
  }
  const runs: number[] = []
  for (let run = 0; run < 3; run += 1) {
    const started = performance.now()
    for (let i = 0; i < iterations; i += 1) {
      write(i)
    }
    runs.push(((performance.now() - started) * 1000) / iterations)
  }
  runs.sort((a, b) => a - b)
  return round(runs[1] ?? 0)
}

// --- the scene -------------------------------------------------------------

const BASE_WIDTH = 100
const TARGET_WIDTH = 260
const SIZES = [5, 60, 300]

// The naive write's own node and engine, reached through the host-node context
// rather than through a new API — a `View` publishes itself as the host of its
// children, so a child of the box sees the box's node.
const CaptureNode = ({
  onNode,
}: {
  onNode: (node: LayoutNode, engine: LayoutEngine) => void
}) => {
  const host = useHostNode()
  useEffect(() => {
    onNode(host.node, host.engine)
  }, [host, onNode])
  return null
}

const Stage = () => {
  const stageRef = useRef<unknown>(null)
  const columnRef = useRef<unknown>(null)
  const barRef = useRef<unknown>(null)
  const siblingRef = useRef<unknown>(null)
  const labelRef = useRef<unknown>(null)
  const scaleBoxRef = useRef<unknown>(null)
  const scaleLabelRef = useRef<unknown>(null)
  const naiveRef = useRef<{ node: LayoutNode; engine: LayoutEngine } | null>(
    null,
  )
  const captureNaive = useCallback((node: LayoutNode, engine: LayoutEngine) => {
    naiveRef.current = { node, engine }
  }, [])
  const [control, setControl] = useState<"base" | "scale" | "width">("base")
  const [rows, setRows] = useState(60)

  // The shipped surface, exactly as an app writes it.
  const barWidth = useSharedValue(BASE_WIDTH)
  const textWidth = useSharedValue(BASE_WIDTH)
  const slide = useSharedValue(0)
  const barStyle = useAnimatedStyle(() => ({ width: barWidth.value }))
  const textStyle = useAnimatedStyle(() => ({ width: textWidth.value }))
  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slide.value }],
  }))

  const handles = useRef<{
    barWidth: SharedValue<number>
    textWidth: SharedValue<number>
    slide: SharedValue<number>
    setRows: (value: number) => void
    setControl: (value: "base" | "scale" | "width") => void
  }>(null as never)
  handles.current = { barWidth, textWidth, slide, setRows, setControl }

  useEffect(() => {
    const run = async (): Promise<void> => {
      await sleep(900)
      // `View`'s ref is RN's measure handle, not the widget; the widget is
      // read back out of it exactly as `createAnimatedComponent` does.
      const stage = widgetForHandle(stageRef.current)
      const column = widgetForHandle(columnRef.current)
      const bar = widgetForHandle(barRef.current)
      const sibling = widgetForHandle(siblingRef.current)
      const label = widgetForHandle(labelRef.current)
      if (!stage || !column || !bar || !sibling || !label) {
        log("FAIL harness — a widget ref is null")
        failures += 1
        return
      }
      const window = stage.getRoot() as unknown as Gtk.Window
      window.present()
      await sleep(400)

      const barBefore = boundsIn(bar, stage)
      const siblingBefore = boundsIn(sibling, stage)
      const columnBefore = boundsIn(column, stage)
      const labelBefore = boundsIn(label, stage)
      const requestBefore = measureWidget(window, "horizontal")
      log(
        `baseline bar=${asText(barBefore)} sibling=${asText(siblingBefore)} ` +
          `column=${asText(columnBefore)} label=${asText(labelBefore)} ` +
          `window request min=${requestBefore.minimum} nat=${requestBefore.natural}`,
      )

      // A frame-pacing control measured in THIS process on THIS compositor,
      // because an absolute millisecond threshold under headless software
      // rendering measures the rig and not the mechanism.
      const drive = async (
        frames: number,
        write: (t: number) => void,
      ): Promise<number[]> => {
        const periods: number[] = []
        let previous = 0
        let frame = 0
        await new Promise<void>((resolve) => {
          column.addTickCallback(() => {
            const now = performance.now()
            if (previous > 0) {
              periods.push(now - previous)
            }
            previous = now
            write(Math.min(1, frame / (frames - 1)))
            frame += 1
            if (frame >= frames) {
              resolve()
              return false
            }
            return true
          })
        })
        return periods.sort((a, b) => a - b)
      }

      const idle = await drive(120, () => {})
      await sleep(150)

      // --- A. the driven width ------------------------------------------
      const driven = await drive(120, (t) => {
        handles.current.textWidth.value =
          BASE_WIDTH + (TARGET_WIDTH - BASE_WIDTH) * t
      })
      await sleep(250)

      const barAfter = boundsIn(bar, stage)
      const siblingAfter = boundsIn(sibling, stage)
      const columnAfter = boundsIn(column, stage)
      const labelAfter = boundsIn(label, stage)

      check(
        "A1 the driven width reached real GTK geometry",
        barAfter.width === TARGET_WIDTH,
        `bar width ${barBefore.width} -> ${barAfter.width}, wanted ${TARGET_WIDTH}`,
      )
      check(
        "A2 it grew from the leading edge, not the centre",
        barAfter.x === barBefore.x && barAfter.y === barBefore.y,
        `bar origin ${asText(barBefore)} -> ${asText(barAfter)}`,
      )
      check(
        "A3 the sibling below did not move",
        same(siblingBefore, siblingAfter),
        `sibling ${asText(siblingBefore)} -> ${asText(siblingAfter)}`,
      )
      check(
        "A4 the container did not change size",
        same(columnBefore, columnAfter),
        `column ${asText(columnBefore)} -> ${asText(columnAfter)}`,
      )
      check(
        "A5 the node's own content was re-laid-out for the new width",
        labelAfter.width === TARGET_WIDTH &&
          labelAfter.height < labelBefore.height,
        `label ${asText(labelBefore)} -> ${asText(labelAfter)} (the text re-wrapped)`,
      )
      const medianOf = (xs: number[]): number =>
        round(xs[Math.floor(xs.length / 2)] ?? 0)
      check(
        "A6 the frame clock kept up, against an idle control",
        medianOf(driven) <= medianOf(idle) + 1.5,
        `driven median ${medianOf(driven)} ms over ${driven.length} frames vs idle ${medianOf(idle)} ms ` +
          `(driven p95 ${round(driven[Math.floor(driven.length * 0.95)] ?? 0)}, idle p95 ${round(idle[Math.floor(idle.length * 0.95)] ?? 0)})`,
      )

      // --- B. picked where it is drawn ------------------------------------
      const insideNew = {
        x: barAfter.x + BASE_WIDTH + 40,
        y: barAfter.y + barAfter.height / 2,
      }
      const beyond = { x: barAfter.x + TARGET_WIDTH + 40, y: insideNew.y }
      const isBar = (widget: Gtk.Widget | null): boolean => {
        let node = widget
        while (node) {
          if (node === bar) {
            return true
          }
          node = node.getParent()
        }
        return false
      }
      const pickedNew = stage.pick(
        insideNew.x,
        insideNew.y,
        Gtk.PickFlags.DEFAULT,
      )
      const pickedBeyond = stage.pick(beyond.x, beyond.y, Gtk.PickFlags.DEFAULT)
      check(
        "B1 a point past the OLD edge now hits the widget",
        isBar(pickedNew),
        `pick(${round(insideNew.x)}, ${round(insideNew.y)}) = ${pickedNew?.getName() ?? "null"}`,
      )
      check(
        "B2 a point past the NEW edge still does not",
        !isBar(pickedBeyond),
        `pick(${round(beyond.x)}, ${round(beyond.y)}) = ${pickedBeyond?.getName() ?? "null"}`,
      )

      // --- C. the toplevel --------------------------------------------------
      const requestAfter = measureWidget(window, "horizontal")
      check(
        "C1 the window's size request did not move",
        requestAfter.minimum === requestBefore.minimum &&
          requestAfter.natural === requestBefore.natural,
        `min ${requestBefore.minimum} -> ${requestAfter.minimum}, nat ${requestBefore.natural} -> ${requestAfter.natural}`,
      )

      // --- D. what `scaleX` does instead ------------------------------------
      const scaleBox = widgetForHandle(scaleBoxRef.current)
      const scaleLabel = widgetForHandle(scaleLabelRef.current)
      if (scaleBox && scaleLabel) {
        const boxBefore = boundsIn(scaleBox, stage)
        const controlLabelBefore = boundsIn(scaleLabel, stage)
        handles.current.setControl("scale")
        await sleep(500)
        const boxScaled = boundsIn(scaleBox, stage)
        const labelScaled = boundsIn(scaleLabel, stage)
        handles.current.setControl("width")
        await sleep(500)
        const boxWidened = boundsIn(scaleBox, stage)
        const labelWidened = boundsIn(scaleLabel, stage)
        log(
          `control box base=${asText(boxBefore)} scaleX=${asText(boxScaled)} width=${asText(boxWidened)}`,
        )
        log(
          `control label base=${asText(controlLabelBefore)} scaleX=${asText(labelScaled)} width=${asText(labelWidened)}`,
        )
        check(
          "D1 scaleX grows about the CENTRE, so the box moves",
          boxScaled.x !== boxBefore.x && boxWidened.x === boxBefore.x,
          `x base ${boxBefore.x} -> scaleX ${boxScaled.x} -> width ${boxWidened.x}`,
        )
        check(
          "D2 scaleX stretches the content instead of re-laying it out",
          labelScaled.height === controlLabelBefore.height &&
            labelWidened.height < controlLabelBefore.height,
          `label height base ${controlLabelBefore.height} -> scaleX ${labelScaled.height} (unchanged: the glyphs ` +
            `were stretched) -> width ${labelWidened.height} (re-wrapped)`,
        )
      }

      // --- E. cost ----------------------------------------------------------
      //
      // The WHOLE per-frame write, as an app produces it: a shared-value
      // assignment, the mapper, the style node, the pinned subtree pass, the
      // rect-store override and one `queueAllocate`. No paint, so these sit
      // next to animated-colors.md §3 and absolute-insets.md §4 without
      // conversion.
      log(
        "cost: children | driven leaf | driven text | naive width | transform",
      )
      for (const size of SIZES) {
        handles.current.setRows(size)
        await sleep(600)
        const naive = naiveRef.current
        const leaf = microseconds(20000, (i) => {
          handles.current.barWidth.value = BASE_WIDTH + (i % 120)
        })
        const withText = microseconds(20000, (i) => {
          handles.current.textWidth.value = BASE_WIDTH + (i % 120)
        })
        const transform = microseconds(20000, (i) => {
          handles.current.slide.value = i % 120
        })
        let naiveCost = 0
        if (naive) {
          naiveCost = microseconds(2000, (i) => {
            naive.node.setStyle({ width: BASE_WIDTH + (i % 120), height: 60 })
            naive.engine.flushSync()
          })
        }
        log(
          `cost: ${size} | ${leaf} µs | ${withText} µs | ${naiveCost} µs | ${transform} µs`,
        )
      }

      log(failures === 0 ? "DONE all checks passed" : `DONE ${failures} FAILED`)
      process.exitCode = failures === 0 ? 0 : 1
      setTimeout(() => {
        process.exit(process.exitCode ?? 0)
      }, 200)
    }

    void run().catch((error: unknown) => {
      log(`FAIL harness error — ${String(error)}`)
      process.exitCode = 1
      setTimeout(() => {
        process.exit(1)
      }, 200)
    })
  }, [])

  return (
    <View
      ref={stageRef}
      testID="stage"
      style={{ flex: 1, backgroundColor: "#241f31" }}
    >
      {/* The column has a definite cross size, so nothing a child does to its
          own width can change the container's. That is the precondition the
          whole carve-out rests on. */}
      <View
        ref={columnRef}
        testID="column"
        style={{ width: 400, height: 700, backgroundColor: "#3d3846" }}
      >
        {/* The measured shape: a box with wrapped text, whose width is driven
            by an ordinary useAnimatedStyle. */}
        <Animated.View
          ref={barRef}
          testID="bar"
          style={[{ height: 60, backgroundColor: "#3584e4" }, textStyle]}
        >
          <Text
            ref={labelRef}
            testID="label"
            style={{ color: "#ffffff", fontSize: 11 }}
          >
            the quick brown fox jumps over the lazy dog
          </Text>
        </Animated.View>
        {/* The leaf, for the cost column that has no measure function in it. */}
        <Animated.View
          testID="leafbar"
          style={[{ height: 6, backgroundColor: "#26a269" }, barStyle]}
        />
        {/* A transform on the same tree, for scale. */}
        <Animated.View
          testID="slider"
          style={[
            { width: 100, height: 6, backgroundColor: "#e5a50a" },
            slideStyle,
          ]}
        />
        {/* The naive write's target: a plain View whose Yoga style is set
            directly, so the cost is `setStyle` plus a whole engine flush. */}
        <View
          testID="naive"
          style={{ width: 100, height: 6, backgroundColor: "#a51d2d" }}
        >
          <CaptureNode onNode={captureNaive} />
        </View>
        {Array.from({ length: rows }, (_, i) => (
          <View
            key={i}
            ref={i === 0 ? siblingRef : undefined}
            testID={`row${i}`}
            style={{
              width: 100,
              height: 6,
              backgroundColor: i % 2 === 0 ? "#613583" : "#813d9c",
            }}
          />
        ))}
      </View>
      {/* The negative control: the transform the warning offers as the nearest
          thing to a width, and the same box given the width for real. */}
      <View
        ref={scaleBoxRef}
        testID="scalebox"
        style={{
          position: "absolute",
          left: 500,
          top: 40,
          width: control === "width" ? TARGET_WIDTH : BASE_WIDTH,
          height: 60,
          backgroundColor: "#c64600",
          ...(control === "scale"
            ? { transform: [{ scaleX: TARGET_WIDTH / BASE_WIDTH }] }
            : {}),
        }}
      >
        <Text
          ref={scaleLabelRef}
          testID="scalelabel"
          style={{ color: "#ffffff", fontSize: 11 }}
        >
          the quick brown fox jumps over the lazy dog
        </Text>
      </View>
    </View>
  )
}

AppRegistry.registerComponent("AnimatedSizeSpike", () => Stage)
AppRegistry.runApplication("AnimatedSizeSpike", {
  title: "animated size probe",
  width: 1024,
  height: 768,
})
