// PROBE 5 — the spike. `Gesture.Pan()` with `activateAfterLongPress` and
// `activeOffsetY`, over React Native's own responder system, driving a real
// GTK widget through a Reanimated shared value, with real pointer injection
// and every assertion taken from GTK's own allocation.
//
// Nothing below the `./flat-gesture` import is spike code: it is the plain
// `react-native-reanimated` + `react-native-gesture-handler` call shape an
// app already writes. That is the claim under test — that the source does
// not have to change.
//
// Two gestures, because two different libraries need two different shapes:
//
//   drag  — `Gesture.Pan().activateAfterLongPress(200)`, which is exactly
//           `react-native-reanimated-dnd`'s `useDraggable`;
//   sheet — `Gesture.Pan().activeOffsetY([-10, 10]).failOffsetX([-20, 20])`,
//           which is `@gorhom/bottom-sheet`'s handle.
//
// And one control view that the pointer never visits.
//
// The immutability rule is off for this file on purpose: writing
// `sharedValue.value` from a gesture callback is Reanimated's own documented
// pattern and the whole point of the probe — the React Compiler's rule
// cannot tell a shared value apart from ordinary hook state, and turning it
// off here is exactly what an app using this API would have to do.
/* eslint-disable react-hooks/immutability */
import { useEffect, useRef, useState } from "react"
import { AppRegistry, StyleSheet, Text, View } from "react-native"
import { GtkBox, type Gtk } from "react-native-gtkx/gtk"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-gtkx/reanimated"
import { Gesture, GestureDetector } from "./flat-gesture"
import { check, finish, fullscreen, log, openPointer, sleep } from "./harness"

const M = "gd-spike"

const LONG_PRESS_MS = 200

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#241f31",
    flexDirection: "row",
    gap: 24,
    padding: 24,
  },
  column: { width: 260, gap: 12 },
  title: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  card: {
    width: 220,
    height: 160,
    backgroundColor: "#62a0ea",
    alignItems: "center",
    justifyContent: "center",
  },
  sheet: {
    width: 220,
    height: 160,
    backgroundColor: "#8ff0a4",
    alignItems: "center",
    justifyContent: "center",
  },
  control: { width: 220, height: 160, backgroundColor: "#c01c28" },
  probe: { width: 20, height: 20, backgroundColor: "#f6d32d" },
})

type Handle = {
  measureInWindow(
    cb: (x: number, y: number, w: number, h: number) => void,
  ): void
}

const pageYOf = (handle: Handle | null): number => {
  let value = Number.NaN
  handle?.measureInWindow((_x, y) => {
    value = y
  })
  return value
}

const Stage = () => {
  const dragOffset = useSharedValue(0)
  const sheetOffset = useSharedValue(0)

  const renders = useRef(0)
  renders.current += 1
  const [, forceRender] = useState(0)

  const dragProbe = useRef<Handle | null>(null)
  const sheetProbe = useRef<Handle | null>(null)
  // A one-pixel raw GTK widget, present only so the probe can reach the
  // toplevel: a `View`'s ref is a `ViewHandle` by design, and fullscreening
  // the window needs the real `Gtk.Window`.
  const anchorRef = useRef<Gtk.Widget | null>(null)

  const trace = useRef<string[]>([])
  const updates = useRef(0)
  const controlEvents = useRef(0)

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragOffset.value }],
  }))
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetOffset.value }],
  }))

  const drag = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .onBegin(() => {
      trace.current.push("drag:begin")
    })
    .onStart(() => {
      trace.current.push("drag:start")
    })
    .onUpdate((event) => {
      trace.current.push("drag:update")
      updates.current += 1
      dragOffset.value = event.translationY
    })
    .onEnd(() => {
      trace.current.push("drag:end")
    })
    .onFinalize((_event, success) => {
      trace.current.push(`drag:finalize(${success})`)
    })

  const sheet = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-20, 20])
    .onBegin(() => {
      trace.current.push("sheet:begin")
    })
    .onStart(() => {
      trace.current.push("sheet:start")
    })
    .onUpdate((event) => {
      trace.current.push("sheet:update")
      sheetOffset.value = event.translationY
    })
    .onFinalize((_event, success) => {
      trace.current.push(`sheet:finalize(${success})`)
    })

  useEffect(() => {
    // GD_PROBE=demo renders the same two gestures and drives NOTHING: no
    // injected pointer, no fullscreen, no exit. That is the mode to launch
    // into a real desktop session and drag by hand — the scripted mode below
    // aims a real pointer at absolute output coordinates and would take the
    // user's cursor with it.
    if (process.env.GD_PROBE === "demo") {
      log(
        M,
        "demo mode — drag the blue card (hold 200ms first) and the green one",
      )
      return
    }
    const run = async (): Promise<void> => {
      const anchor = anchorRef.current
      if (!anchor) {
        throw new Error("no anchor widget")
      }
      const pointer = await openPointer()
      await fullscreen(M, anchor)

      const dragCard = centreOfProbe(dragProbe)
      const sheetCard = centreOfProbe(sheetProbe)

      const press = async (point: { x: number; y: number }) => {
        pointer.moveTo(point.x, point.y)
        await sleep(60)
        pointer.press()
        await sleep(60)
      }
      const moveBy = async (
        point: { x: number; y: number },
        dx: number,
        dy: number,
        steps: number,
      ) => {
        for (let i = 1; i <= steps; i += 1) {
          pointer.moveTo(point.x + (dx * i) / steps, point.y + (dy * i) / steps)
          await sleep(40)
        }
      }
      const release = async () => {
        pointer.release()
        await sleep(90)
      }

      // ---- A. the long-press gate refuses an immediate drag -------------
      trace.current = []
      const dragBefore = pageYOf(dragProbe.current)
      await press(dragCard)
      await moveBy(dragCard, 0, 90, 6)
      await release()
      const dragAfterA = pageYOf(dragProbe.current)

      check(
        M,
        "activateAfterLongPress refuses a drag that starts immediately",
        !trace.current.includes("drag:start") &&
          Math.abs(dragAfterA - dragBefore) < 2,
        `trace=[${trace.current.join(" ")}] pageY ${dragBefore} -> ${dragAfterA}`,
      )

      // ---- B. hold, then drag, and REAL geometry moves ------------------
      trace.current = []
      updates.current = 0
      const rendersBefore = renders.current
      await press(dragCard)
      await sleep(LONG_PRESS_MS + 120)
      await moveBy(dragCard, 0, 120, 8)
      const dragAfterB = pageYOf(dragProbe.current)
      await release()

      check(
        M,
        "after the long press the same drag activates",
        trace.current.includes("drag:start"),
        `trace=[${trace.current.slice(0, 4).join(" ")} …]`,
      )
      // 120px was injected but the gesture activates on the FIRST move after
      // the timer, and RNGH measures translation from the activation point,
      // not from the press — so the expected travel is 120 minus one step.
      // The assertion is therefore "GTK's allocation equals the shared
      // value", which is the claim that matters, plus "most of the 120px
      // arrived", which is the claim that it is not a rounding artefact.
      check(
        M,
        "a shared value written from onUpdate moved REAL GTK geometry",
        Math.abs(dragAfterB - dragBefore - dragOffset.value) <= 2 &&
          dragOffset.value >= 100,
        `pageY ${dragBefore} -> ${dragAfterB} (moved ${dragAfterB - dragBefore}px; shared value = ${dragOffset.value}, out of 120px injected after the long press)`,
      )
      check(
        M,
        "no React render during the pan",
        renders.current === rendersBefore,
        `render count ${rendersBefore} -> ${renders.current} across ${updates.current} onUpdate calls`,
      )
      check(
        M,
        "callback order is RNGH's",
        /^drag:begin( drag:start)( drag:update)+ drag:end drag:finalize\(true\)$/.test(
          trace.current.join(" "),
        ),
        `trace=[${trace.current.join(" ")}]`,
      )

      // ---- C. activeOffsetY holds the gesture BEGAN below the threshold --
      trace.current = []
      const sheetBefore = pageYOf(sheetProbe.current)
      await press(sheetCard)
      await moveBy(sheetCard, 0, 6, 3)
      const sheetAtSix = pageYOf(sheetProbe.current)
      const startedEarly = trace.current.includes("sheet:start")
      await moveBy(sheetCard, 0, 60, 6)
      const sheetAtSixty = pageYOf(sheetProbe.current)
      await release()

      check(
        M,
        "activeOffsetY([-10,10]) does not activate at 6px, and does at 60px",
        !startedEarly &&
          Math.abs(sheetAtSix - sheetBefore) < 2 &&
          trace.current.includes("sheet:start") &&
          sheetAtSixty > sheetBefore + 20,
        `6px: started=${startedEarly} pageY ${sheetBefore} -> ${sheetAtSix}; 60px: pageY -> ${sheetAtSixty}`,
      )

      // ---- D. failOffsetX kills it, and it never takes the lock ----------
      trace.current = []
      sheetOffset.value = 0
      await sleep(60)
      const sheetBeforeD = pageYOf(sheetProbe.current)
      await press(sheetCard)
      await moveBy(sheetCard, 40, 0, 5)
      await moveBy(sheetCard, 40, 60, 5)
      const sheetAfterD = pageYOf(sheetProbe.current)
      await release()

      check(
        M,
        "failOffsetX([-20,20]) fails the pan, and a later vertical move cannot revive it",
        !trace.current.includes("sheet:start") &&
          Math.abs(sheetAfterD - sheetBeforeD) < 2,
        `trace=[${trace.current.join(" ")}] pageY ${sheetBeforeD} -> ${sheetAfterD}`,
      )

      // ---- E. the negative control ---------------------------------------
      check(
        M,
        "NEGATIVE CONTROL: the zone the pointer never visited saw nothing",
        controlEvents.current === 0,
        `control responder callbacks = ${controlEvents.current}`,
      )

      pointer.dispose()
      forceRender(1)
      await sleep(150)
      check(
        M,
        "the animated position survives a React render",
        Math.abs(pageYOf(dragProbe.current) - dragAfterB) <= 2,
        `pageY after re-render = ${pageYOf(dragProbe.current)} (was ${dragAfterB}, shared value = ${dragOffset.value})`,
      )
      finish(M)
      setTimeout(() => {
        process.exit(process.exitCode ?? 0)
      }, 200)
    }

    void run().catch((error: unknown) => {
      log(M, `FAIL harness error — ${String(error)}`)
      process.exitCode = 1
      setTimeout(() => {
        process.exit(1)
      }, 200)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const countControl = () => {
    controlEvents.current += 1
    return false
  }

  return (
    <View style={styles.screen}>
      <GtkBox
        ref={anchorRef as never}
        style={{ width: 1, height: 1 }}
      />
      <View style={styles.column}>
        <Text style={styles.title}>Pan().activateAfterLongPress(200)</Text>
        <GestureDetector gesture={drag}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Animated.View style={[styles.card, dragStyle] as any}>
            <View
              ref={dragProbe as never}
              style={styles.probe}
            />
          </Animated.View>
        </GestureDetector>
      </View>
      <View style={styles.column}>
        <Text style={styles.title}>
          Pan().activeOffsetY([-10,10]).failOffsetX([-20,20])
        </Text>
        <GestureDetector gesture={sheet}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Animated.View style={[styles.sheet, sheetStyle] as any}>
            <View
              ref={sheetProbe as never}
              style={styles.probe}
            />
          </Animated.View>
        </GestureDetector>
      </View>
      <View style={styles.column}>
        <Text style={styles.title}>negative control</Text>
        <View
          style={styles.control}
          onStartShouldSetResponder={countControl}
          onMoveShouldSetResponder={countControl}
          onTouchStart={countControl}
          onTouchMove={countControl}
        />
      </View>
    </View>
  )
}

/**
 * The pointer is aimed from the PROBE's measured position rather than from
 * the styles, so a layout change cannot silently move the target somewhere
 * the assertions no longer describe.
 */
const centreOfProbe = (ref: {
  current: Handle | null
}): { x: number; y: number } => {
  let point: { x: number; y: number } | null = null
  ref.current?.measureInWindow((x, y, width, height) => {
    point = { x: x + width / 2, y: y + height / 2 }
  })
  if (point === null) {
    throw new Error("the probe has no measurable geometry yet")
  }
  return point
}

export const runSpike = (): void => {
  AppRegistry.registerComponent("GestureSpike", () => Stage)
  AppRegistry.runApplication("GestureSpike", {
    title: "gesture-detector spike",
    width: 1024,
    height: 768,
  })
}
