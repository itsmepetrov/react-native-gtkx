// Reanimated spike probe. Question: can useSharedValue + useAnimatedStyle
// drive a REAL GTK widget on this platform, with no worklet runtime, no
// second thread and no change to library code?
//
// Everything below the flat-reanimated import is the plain React Native
// surface — this is what an app written against Reanimated looks like, and
// the point is that the source does not have to change.
//
// Every assertion logs with a [rea-spike] marker so the driving script can
// grep the host log. PASS/FAIL is decided in-process, not by eyeballing.
import { useEffect, useRef, useState } from "react"
import { Animated, AppRegistry, StyleSheet, Text, View } from "react-native"
import {
  measure,
  runOnJS,
  runOnUI,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "./flat-reanimated"

const DISTANCE = 120
const DURATION = 1200

const log = (message: string): void => {
  console.log(`[rea-spike] ${message}`)
}

const check = (label: string, condition: boolean, detail: string): void => {
  log(`${condition ? "PASS" : "FAIL"} ${label} — ${detail}`)
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#241f31", padding: 24, gap: 16 },
  title: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  box: {
    width: 120,
    height: 80,
    backgroundColor: "#62a0ea",
    alignItems: "center",
    justifyContent: "center",
  },
  probe: { width: 24, height: 24, backgroundColor: "#f6d32d" },
  label: { color: "#ffffff", fontSize: 12 },
})

const Probe = () => {
  const offset = useSharedValue(0)
  const fade = useSharedValue(1)
  // A ref on the inner View: Animated.View exposes no measure handle, and
  // measuring a DESCENDANT is the stronger proof anyway — it shows the
  // transform reached the real GTK allocation, not just a stored rect.
  const probeRef = useAnimatedRef<{
    measureInWindow(
      cb: (x: number, y: number, w: number, h: number) => void,
    ): void
  }>()

  // Proves the animation never goes through React: this counter must still
  // read 1 after the whole animation has run.
  const renders = useRef(0)
  renders.current += 1

  const [, forceRender] = useState(0)

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
    opacity: fade.value,
  }))

  const reactions = useRef(0)
  useAnimatedReaction(
    () => offset.value,
    () => {
      reactions.current += 1
    },
  )

  useEffect(() => {
    // 1. A "worklet" is an ordinary function on the right thread already.
    let uiRan = false
    let jsGot = 0
    runOnUI(() => {
      "worklet"
      uiRan = true
      runOnJS((value: number) => {
        jsGot = value
      })(offset.value + 7)
    })()
    check(
      "runOnUI/runOnJS are direct calls",
      uiRan && jsGot === 7,
      `uiRan=${uiRan} jsGot=${jsGot} (synchronously, same stack)`,
    )

    // The first measurement has to wait for the window to be mapped and the
    // first Yoga rect to be committed — measure() reports null before that,
    // by the platform's own RN-faithful contract.
    let start: ReturnType<typeof measure> = null

    const settle = setTimeout(() => {
      // 2. measure() is synchronous, no worklet required.
      start = measure(probeRef)
      check(
        "measure() is synchronous",
        start !== null,
        `start=${JSON.stringify(start)}`,
      )

      // 3. Drive it. Assignment starts the animation, exactly as upstream.
      offset.value = withTiming(DISTANCE, { duration: DURATION })
      fade.value = withTiming(0.35, { duration: DURATION })
    }, 1200)

    const timer = setTimeout(
      () => {
        const end = measure(probeRef)
        if (!start || !end) {
          check("GTK geometry moved", false, "measure returned null")
          log("DONE")
          return
        }
        const moved = end.pageX - start.pageX
        check(
          "shared value drove REAL GTK geometry",
          Math.abs(moved - DISTANCE) <= 2,
          `pageX ${start.pageX} -> ${end.pageX} (moved ${moved}px, expected ${DISTANCE})`,
        )
        check(
          "no React render during the animation",
          renders.current === 1,
          `render count = ${renders.current}`,
        )
        check(
          "mapper re-ran per frame",
          reactions.current > 5,
          `useAnimatedReaction fired ${reactions.current} times`,
        )
        check(
          "shared value settled at target",
          offset.value === DISTANCE,
          `offset.value = ${offset.value}`,
        )

        // 4. A React render must NOT reset the animated position.
        forceRender(1)
        setTimeout(() => {
          const after = measure(probeRef)
          check(
            "animated position survives a React render",
            after !== null && Math.abs(after.pageX - end.pageX) <= 2,
            `pageX after re-render = ${after?.pageX} (was ${end.pageX})`,
          )
          log("DONE")
        }, 120)
      },
      1200 + DURATION + 250,
    )

    return () => {
      clearTimeout(settle)
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>flattened reanimated spike</Text>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Animated.View style={[styles.box, style] as any}>
        <View
          ref={probeRef as never}
          style={styles.probe}
        />
      </Animated.View>
      <Text style={styles.label}>
        useSharedValue + useAnimatedStyle, no worklet runtime
      </Text>
    </View>
  )
}

AppRegistry.registerComponent("ReanimatedSpike", () => Probe)
AppRegistry.runApplication("ReanimatedSpike", {
  title: "reanimated spike",
  width: 520,
  height: 360,
})
