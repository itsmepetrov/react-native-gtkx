// All three recognizers, drivable with a real mouse, plus a negative control
// that must stay silent.
//
// Every import below is the REAL package name. `react-native-gesture-handler`
// and `react-native-reanimated` are not installed in this example; the vite
// preset aliases both onto react-native-gtkx, which is the whole claim: a
// ported app changes nothing in its source.
//
// The cards are not decorative. Each is the exact configuration one of the
// libraries the epic targets uses, or the exact rule a test asserts, so
// driving them by hand checks the same shapes:
//
//   lift   — `activateAfterLongPress`, react-native-reanimated-dnd's useDraggable
//   sheet  — `activeOffsetY` + `failOffsetX`, @gorhom/bottom-sheet's handle
//   edge   — `activeOffsetX` + `failOffsetY` + an anchored `hitSlop`,
//            react-native-drawer-layout's closed drawer
//   hook   — the same recognizer through `usePanGesture()`, the spelling
//            upstream deprecated the builder in favour of
//   tap    — `Gesture.Tap()` with `maxDistance`: the tap-vs-drag rule. Click
//            it and it counts; press and drag it and it refuses
//   double — `numberOfTaps(2)`, including the gap timing
//   hold   — `Gesture.LongPress()`, which activates on its timer with the
//            pointer standing still, and cancels if the pointer then wanders
//            further than `maxDistance`
//
// The immutability rule is off for this file on purpose: writing
// `sharedValue.value` from a gesture callback is Reanimated's own documented
// pattern, and the React Compiler's rule cannot tell a shared value apart
// from ordinary hook state.
/* eslint-disable react-hooks/immutability */
import { useLayoutEffect, useRef, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  useLongPressGesture,
  usePanGesture,
} from "react-native-gesture-handler"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated"

const LONG_PRESS_MS = 250
const EDGE_WIDTH = 32
const TAP_MAX_DISTANCE = 10
const HOLD_MS = 400

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#241f31", padding: 20, gap: 16 },
  heading: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  subheading: { color: "#c0bfbc", fontSize: 12 },
  row: { flexDirection: "row", gap: 16, flex: 1 },
  column: { flex: 1, gap: 8 },
  label: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  hint: { color: "#9a9996", fontSize: 11 },
  status: { color: "#f6d32d", fontSize: 11, fontWeight: "700" },
  card: {
    height: 130,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  lift: { backgroundColor: "#62a0ea" },
  sheet: { backgroundColor: "#8ff0a4" },
  edge: { backgroundColor: "#dc8add" },
  hook: { backgroundColor: "#ffbe6f" },
  tap: { backgroundColor: "#f9f06b" },
  double: { backgroundColor: "#99c1f1" },
  hold: { backgroundColor: "#f66151" },
  cardText: { color: "#1a1a1a", fontSize: 12, fontWeight: "700" },
  edgeStrip: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: EDGE_WIDTH,
    backgroundColor: "#813d9c",
  },
  control: {
    height: 130,
    borderRadius: 12,
    backgroundColor: "#c01c28",
    alignItems: "center",
    justifyContent: "center",
  },
})

/**
 * One draggable card: a shared value in, GTK geometry out, no re-render.
 *
 * THE PATTERN TO COPY, and the one bug everybody writes once. `translationX`
 * is measured from where THIS gesture activated, so it starts at zero on
 * every new grab. Writing `x.value = event.translationX` therefore throws
 * away everything the card had already accumulated and snaps it back toward
 * its origin the moment you grab it a second time. The offset at the start of
 * the gesture has to be captured and added — which is exactly what upstream's
 * own documentation shows, for exactly this reason.
 */
const useDragged = () => {
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const startX = useSharedValue(0)
  const startY = useSharedValue(0)
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }))
  const begin = () => {
    startX.value = x.value
    startY.value = y.value
  }
  const moveBy = (dx: number, dy: number) => {
    x.value = startX.value + dx
    y.value = startY.value + dy
  }
  return { x, y, style, begin, moveBy }
}

const App = () => {
  // Rendered once per STATE CHANGE, never per frame. The count is folded
  // into the status the callbacks publish rather than read during render:
  // if dragging cost a render, this number would race while a card moved.
  const renders = useRef(0)
  useLayoutEffect(() => {
    renders.current += 1
  })

  const [status, setStatus] = useState<Record<string, string>>({})
  const say = (name: string, text: string) => {
    setStatus((previous) => ({
      ...previous,
      [name]: text,
      renders: String(renders.current),
    }))
  }

  const lift = useDragged()
  const sheet = useDragged()
  const edge = useDragged()
  const hook = useDragged()
  const [controlEvents, setControlEvents] = useState(0)

  // react-native-reanimated-dnd's useDraggable, verbatim in shape. The card
  // does not move until the press has matured — and the moment it does, it
  // says so WITHOUT the pointer having moved, which is the out-of-event grant
  // channel this slice added to the responder system.
  const liftGesture = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .onBegin(() => say("lift", "pressed — hold still"))
    .onStart(() => {
      lift.begin()
      say("lift", "LIFTED (the timer granted it)")
    })
    .onUpdate((event) => {
      lift.moveBy(event.translationX, event.translationY)
    })
    .onFinalize((_event, success) => {
      say(
        "lift",
        success
          ? "dropped — grab it again, it will not jump"
          : "refused — moved too soon",
      )
    })

  // @gorhom/bottom-sheet's handle: vertical only, and a sideways twitch
  // kills it for the rest of the press.
  const sheetGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-20, 20])
    .onBegin(() => say("sheet", "pressed"))
    .onStart(() => {
      sheet.begin()
      say("sheet", "dragging vertically")
    })
    .onUpdate((event) => {
      sheet.moveBy(0, event.translationY)
    })
    .onFinalize((_event, success) => {
      say(
        "sheet",
        success
          ? "released — grab it again, it will not jump"
          : "failed — went sideways",
      )
    })

  // react-native-drawer-layout's closed drawer: only the leftmost strip is
  // grabbable, and vertical movement fails it.
  const edgeGesture = Gesture.Pan()
    .activeOffsetX([-5, 5])
    .failOffsetY([-20, 20])
    .hitSlop({ left: 0, width: EDGE_WIDTH })
    .onBegin(() => say("edge", "caught the edge"))
    .onStart(() => {
      edge.begin()
      say("edge", "opening")
    })
    .onUpdate((event) => {
      edge.moveBy(event.translationX, 0)
    })
    .onFinalize((_event, success) => {
      say("edge", success ? "released" : "failed — went vertical")
    })

  // The same recognizer, the other spelling. Note the different callback
  // names: upstream's hook renamed onStart to onActivate and onEnd to
  // onDeactivate, and reports `canceled` instead of a success argument.
  const hookGesture = usePanGesture({
    minDistance: 5,
    onBegin: () => say("hook", "pressed"),
    onActivate: () => {
      hook.begin()
      say("hook", "dragging (usePanGesture)")
    },
    onUpdate: (event) => {
      hook.moveBy(event.translationX, event.translationY)
    },
    onFinalize: (event) => {
      say("hook", event.canceled ? "cancelled" : "released")
    },
  })

  // The tap-vs-drag rule, by hand. Click the card and it counts; press it and
  // drag more than TAP_MAX_DISTANCE before letting go and it refuses — which
  // is the one assertion that proves a tap is not just "a press that ended".
  const [taps, setTaps] = useState(0)
  const tapGesture = Gesture.Tap()
    .maxDistance(TAP_MAX_DISTANCE)
    .onBegin(() => say("tap", "pressed — let go without moving"))
    .onStart(() => setTaps((n) => n + 1))
    .onFinalize((_event, success) => {
      say("tap", success ? "TAPPED" : "refused — that was a drag")
    })

  const [doubles, setDoubles] = useState(0)
  const doubleGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDistance(TAP_MAX_DISTANCE)
    .onBegin(() => say("double", "one…"))
    .onStart(() => setDoubles((n) => n + 1))
    .onFinalize((_event, success) => {
      say("double", success ? "DOUBLE TAP" : "too slow, or only one")
    })

  // The hook spelling of the third recognizer. It activates on its timer with
  // the pointer standing still — the out-of-event grant channel — and then
  // cancels if the pointer wanders further than maxDistance.
  const holdGesture = useLongPressGesture({
    minDuration: HOLD_MS,
    maxDistance: 20,
    onBegin: () => say("hold", `pressed — hold ${HOLD_MS}ms`),
    onActivate: (event) =>
      say("hold", `HELD for ${Math.round(event.duration)}ms`),
    onFinalize: (event) => {
      say("hold", event.canceled ? "cancelled — you moved" : "released")
    },
  })

  const countControl = () => {
    setControlEvents((n) => n + 1)
    return false
  }

  return (
    <GestureHandlerRootView>
      <View style={styles.screen}>
        <Text style={styles.heading}>
          GestureDetector — Pan, Tap and LongPress, on React Native&apos;s own
          responder system
        </Text>
        <Text style={styles.subheading}>
          renders: {status.renders ?? "0"} (state changes only — dragging costs
          none)
        </Text>

        <View style={styles.row}>
          <View style={styles.column}>
            <Text style={styles.label}>
              activateAfterLongPress({LONG_PRESS_MS})
            </Text>
            <Text style={styles.hint}>hold {LONG_PRESS_MS}ms, then drag</Text>
            <GestureDetector gesture={liftGesture}>
              <Animated.View style={[styles.card, styles.lift, lift.style]}>
                <Text style={styles.cardText}>hold me</Text>
              </Animated.View>
            </GestureDetector>
            <Text style={styles.status}>{status.lift ?? "—"}</Text>
          </View>

          <View style={styles.column}>
            <Text style={styles.label}>activeOffsetY + failOffsetX</Text>
            <Text style={styles.hint}>drag down; sideways first kills it</Text>
            <GestureDetector gesture={sheetGesture}>
              <Animated.View style={[styles.card, styles.sheet, sheet.style]}>
                <Text style={styles.cardText}>vertical only</Text>
              </Animated.View>
            </GestureDetector>
            <Text style={styles.status}>{status.sheet ?? "—"}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.column}>
            <Text style={styles.label}>
              hitSlop({"{ left: 0, width: 32 }"})
            </Text>
            <Text style={styles.hint}>
              only the purple strip starts it — drag right
            </Text>
            <GestureDetector gesture={edgeGesture}>
              <Animated.View style={[styles.card, styles.edge, edge.style]}>
                <View style={styles.edgeStrip} />
                <Text style={styles.cardText}>edge only</Text>
              </Animated.View>
            </GestureDetector>
            <Text style={styles.status}>{status.edge ?? "—"}</Text>
          </View>

          <View style={styles.column}>
            <Text style={styles.label}>
              usePanGesture({"{ minDistance: 5 }"})
            </Text>
            <Text style={styles.hint}>
              the other spelling, one implementation
            </Text>
            <GestureDetector gesture={hookGesture}>
              <Animated.View style={[styles.card, styles.hook, hook.style]}>
                <Text style={styles.cardText}>drag me anywhere</Text>
              </Animated.View>
            </GestureDetector>
            <Text style={styles.status}>{status.hook ?? "—"}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.column}>
            <Text style={styles.label}>
              Gesture.Tap().maxDistance({TAP_MAX_DISTANCE})
            </Text>
            <Text style={styles.hint}>click it; dragging it refuses</Text>
            <GestureDetector gesture={tapGesture}>
              <View style={[styles.card, styles.tap]}>
                <Text style={styles.cardText}>taps: {taps}</Text>
              </View>
            </GestureDetector>
            <Text style={styles.status}>{status.tap ?? "—"}</Text>
          </View>

          <View style={styles.column}>
            <Text style={styles.label}>Gesture.Tap().numberOfTaps(2)</Text>
            <Text style={styles.hint}>two clicks, within 500ms</Text>
            <GestureDetector gesture={doubleGesture}>
              <View style={[styles.card, styles.double]}>
                <Text style={styles.cardText}>doubles: {doubles}</Text>
              </View>
            </GestureDetector>
            <Text style={styles.status}>{status.double ?? "—"}</Text>
          </View>

          <View style={styles.column}>
            <Text style={styles.label}>
              useLongPressGesture({"{ minDuration: " + HOLD_MS + " }"})
            </Text>
            <Text style={styles.hint}>hold still; it fires without moving</Text>
            <GestureDetector gesture={holdGesture}>
              <View style={[styles.card, styles.hold]}>
                <Text style={styles.cardText}>hold me</Text>
              </View>
            </GestureDetector>
            <Text style={styles.status}>{status.hold ?? "—"}</Text>
          </View>
        </View>

        <View style={styles.column}>
          <Text style={styles.label}>
            negative control — must stay at 0 unless you touch it
          </Text>
          <View
            style={styles.control}
            onStartShouldSetResponder={countControl}
            onMoveShouldSetResponder={countControl}
            onTouchStart={countControl}
          >
            <Text style={styles.cardText}>events seen: {controlEvents}</Text>
          </View>
        </View>
      </View>
    </GestureHandlerRootView>
  )
}

export default App
