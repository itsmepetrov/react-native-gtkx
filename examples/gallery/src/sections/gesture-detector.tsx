// The three recognizers, drivable with a real mouse, plus a negative control
// that must stay silent.
//
// The cards are not decorative. Each is the exact configuration one of the
// libraries this platform targets uses, or the exact rule a test asserts, so
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
// This section does NOT scroll (see src/index.tsx): a ScrollView around the
// board would put GTK's own scroll gestures into the arbitration these cards
// exist to demonstrate. That is what the `CardGrid` is for — eight cases
// visible in one go, wrapping with the window instead of scrolling.
import { useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  useLongPressGesture,
  usePanGesture,
} from "react-native-gesture-handler"
import Animated from "react-native-reanimated"
import { board, useDragged, useStatus } from "../gesture-board"
import { CardGrid, DemoCard, palette, Section, Status } from "../ui"

const LONG_PRESS_MS = 250
const EDGE_WIDTH = 32
const TAP_MAX_DISTANCE = 10
const HOLD_MS = 400

const styles = StyleSheet.create({
  root: { flex: 1 },
  lift: { backgroundColor: palette.accent },
  sheet: { backgroundColor: palette.green },
  edge: { backgroundColor: palette.purple },
  hook: { backgroundColor: palette.orange },
  tap: { backgroundColor: palette.accent },
  double: { backgroundColor: palette.green },
  hold: { backgroundColor: palette.red },
  // The grabbable strip of the edge card, in the one place a second hue is
  // load-bearing: it marks WHERE the hitSlop is, so it has to differ from
  // the card it sits on.
  edgeStrip: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: EDGE_WIDTH,
    backgroundColor: palette.accentPressed,
  },
  control: {
    height: 84,
    borderRadius: 10,
    backgroundColor: palette.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  controlLabel: { color: palette.text, fontSize: 12, fontWeight: "700" },
})

export const GestureDetectorSection = () => {
  const { status, say } = useStatus()

  const lift = useDragged()
  const sheet = useDragged()
  const edge = useDragged()
  const hook = useDragged()
  const [controlEvents, setControlEvents] = useState(0)

  // react-native-reanimated-dnd's useDraggable, verbatim in shape. The card
  // does not move until the press has matured — and the moment it does, it
  // says so WITHOUT the pointer having moved, which is the out-of-event grant
  // channel this platform's responder system added.
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
    <GestureHandlerRootView style={styles.root}>
      <Section
        title="Gesture detector"
        subtitle={`Pan, Tap and LongPress on React Native's own responder system. Renders: ${status.renders ?? "0"} — state changes only, dragging costs none.`}
      >
        <CardGrid>
          <DemoCard
            grid
            title={`activateAfterLongPress(${LONG_PRESS_MS})`}
            hint={`hold ${LONG_PRESS_MS}ms, then drag`}
          >
            <GestureDetector gesture={liftGesture}>
              <Animated.View style={[board.card, styles.lift, lift.style]}>
                <Text style={board.cardLabel}>hold me</Text>
              </Animated.View>
            </GestureDetector>
            <Status>{status.lift ?? "—"}</Status>
          </DemoCard>

          <DemoCard
            grid
            title="activeOffsetY + failOffsetX"
            hint="drag down; sideways first kills it"
          >
            <GestureDetector gesture={sheetGesture}>
              <Animated.View style={[board.card, styles.sheet, sheet.style]}>
                <Text style={board.cardLabel}>vertical only</Text>
              </Animated.View>
            </GestureDetector>
            <Status>{status.sheet ?? "—"}</Status>
          </DemoCard>

          <DemoCard
            grid
            title="hitSlop({ left: 0, width: 32 })"
            hint="only the strip on the left starts it — drag right"
          >
            <GestureDetector gesture={edgeGesture}>
              <Animated.View style={[board.card, styles.edge, edge.style]}>
                <View style={styles.edgeStrip} />
                <Text style={board.cardLabel}>edge only</Text>
              </Animated.View>
            </GestureDetector>
            <Status>{status.edge ?? "—"}</Status>
          </DemoCard>

          <DemoCard
            grid
            title="usePanGesture({ minDistance: 5 })"
            hint="the other spelling, one implementation"
          >
            <GestureDetector gesture={hookGesture}>
              <Animated.View style={[board.card, styles.hook, hook.style]}>
                <Text style={board.cardLabel}>drag me anywhere</Text>
              </Animated.View>
            </GestureDetector>
            <Status>{status.hook ?? "—"}</Status>
          </DemoCard>

          <DemoCard
            grid
            title={`Gesture.Tap().maxDistance(${TAP_MAX_DISTANCE})`}
            hint="click it; dragging it refuses"
          >
            <GestureDetector gesture={tapGesture}>
              <View style={[board.card, styles.tap]}>
                <Text style={board.cardLabel}>taps: {taps}</Text>
              </View>
            </GestureDetector>
            <Status>{status.tap ?? "—"}</Status>
          </DemoCard>

          <DemoCard
            grid
            title="Gesture.Tap().numberOfTaps(2)"
            hint="two clicks, within 500ms"
          >
            <GestureDetector gesture={doubleGesture}>
              <View style={[board.card, styles.double]}>
                <Text style={board.cardLabel}>doubles: {doubles}</Text>
              </View>
            </GestureDetector>
            <Status>{status.double ?? "—"}</Status>
          </DemoCard>

          <DemoCard
            grid
            title={`useLongPressGesture({ minDuration: ${HOLD_MS} })`}
            hint="hold still; it fires without moving"
          >
            <GestureDetector gesture={holdGesture}>
              <View style={[board.card, styles.hold]}>
                <Text style={board.cardLabel}>hold me</Text>
              </View>
            </GestureDetector>
            <Status>{status.hold ?? "—"}</Status>
          </DemoCard>

          <DemoCard
            grid
            title="negative control"
            hint="must stay at 0 — nothing outside a pointer's own path can reach it"
          >
            <View
              style={styles.control}
              onStartShouldSetResponder={countControl}
              onMoveShouldSetResponder={countControl}
              onTouchStart={countControl}
            >
              <Text style={styles.controlLabel}>
                events seen: {controlEvents}
              </Text>
            </View>
          </DemoCard>
        </CardGrid>
      </Section>
    </GestureHandlerRootView>
  )
}
