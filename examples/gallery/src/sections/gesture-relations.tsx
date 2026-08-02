// What happens when two gestures want the same drag, and what happens when a
// gesture sits over a widget that already handles the pointer itself.
//
// All three arrangements below are two SEPARATE `GestureDetector`s, one
// nested inside the other, which is the shape every real cross-component
// relation has: `@gorhom/bottom-sheet`'s sheet and the scrollable inside it,
// a draggable row inside a list.
//
//   native — `Gesture.Native()` over a real `ScrollView`, @gorhom/bottom-
//            sheet's shape. Drag it and it reports; wheel it and it still
//            scrolls, because this is the one recognizer that never takes
//            the interaction
//   both   — `simultaneousWithExternalGesture`: two nested detectors, ONE
//            drag, and both of them active. The outer card slides down while
//            the inner one slides right, each from its own gesture, and the
//            responder lock still has a single holder underneath
//   wait   — `requireExternalGestureToFail`: the inner card is held in BEGAN
//            until the outer one gives up. Drag sideways and only the outer
//            moves; drag down and the outer fails, which is what releases the
//            inner one
//
// This section does NOT scroll (see src/index.tsx), and here that is not a
// nicety: the first card is a real `ScrollView` whose arbitration with the
// gesture over it IS the demonstration, and an enclosing ScrollView would be
// a third party in it.
import { useState } from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler"
import Animated from "react-native-reanimated"
import { board, useDragged, useStatus } from "../gesture-board"
import { CardGrid, DemoCard, palette, Section, Status } from "../ui"

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroller: {
    height: 130,
    borderRadius: 10,
    backgroundColor: palette.cardAlt,
  },
  scrollRow: {
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  scrollRowText: { color: palette.text, fontSize: 12, fontWeight: "700" },
  carrier: {
    backgroundColor: palette.accent,
    height: 118,
    padding: 14,
    alignItems: "stretch",
    justifyContent: "flex-start",
  },
  rider: {
    backgroundColor: palette.purple,
    height: 56,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  blocker: {
    backgroundColor: palette.red,
    height: 118,
    padding: 14,
    alignItems: "stretch",
    justifyContent: "flex-start",
  },
  waiter: {
    backgroundColor: palette.orange,
    height: 56,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
})

export const GestureRelationsSection = () => {
  const { status, say } = useStatus()
  const [scrolled, setScrolled] = useState(0)

  const carrier = useDragged()
  const rider = useDragged()
  const waiter = useDragged()

  // @gorhom/bottom-sheet's scrollable, in shape: a `Gesture.Native()` over a
  // real list. It reports what the widget underneath is doing and takes
  // nothing away from it — the wheel keeps scrolling this while the gesture
  // is active, which it could not if the gesture had won the responder
  // (winning is what puts every enclosing GtkScrolledWindow's own gestures
  // into GTK_PHASE_NONE).
  const nativeGesture = Gesture.Native()
    .onBegin(() => say("native", "pressed — the list still owns this"))
    .onStart(() => say("native", "ACTIVE (the widget took over)"))
    .onFinalize((_event, success) =>
      say("native", success ? "ended" : "cancelled — something took it"),
    )

  // Two gestures ACTIVE at once. There is still exactly one responder while
  // this happens — the inner detector wins it, and the outer one is driven
  // from the touch props, which fire regardless of who holds the lock.
  const carrierGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onStart(() => {
      carrier.begin()
      say("both", "outer ACTIVE…")
    })
    .onUpdate((event) => {
      carrier.moveBy(0, event.translationY)
    })
    .onFinalize(() => say("both", "released"))

  const riderGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .simultaneousWithExternalGesture(carrierGesture)
    .onStart(() => {
      rider.begin()
      say("both", "BOTH ACTIVE — one drag, two gestures")
    })
    .onUpdate((event) => {
      rider.moveBy(event.translationY, 0)
    })

  // The outer one is a horizontal scroller that gives up the moment the drag
  // has gone far enough DOWN.
  const blockerGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-25, 25])
    .onBegin(() => say("wait", "pressed — inner is held in BEGAN"))
    .onStart(() => say("wait", "outer won it — drag down instead"))
    .onFinalize((_event, success) => {
      if (!success) {
        say("wait", "outer FAILED — inner is released")
      }
    })

  const waiterGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .requireExternalGestureToFail(blockerGesture)
    .onStart(() => {
      waiter.begin()
      say("wait", "inner ACTIVE, after the outer failed")
    })
    .onUpdate((event) => {
      waiter.moveBy(0, event.translationY)
    })

  return (
    <GestureHandlerRootView style={styles.root}>
      <Section
        title="Gesture relations"
        subtitle={`Two detectors, one drag. Renders: ${status.renders ?? "0"} — state changes only, dragging costs none.`}
      >
        <CardGrid>
          <DemoCard
            grid
            title="Gesture.Native() over a ScrollView"
            hint="drag it: reports. wheel it: still scrolls."
          >
            <GestureDetector gesture={nativeGesture}>
              <ScrollView
                style={styles.scroller}
                onScroll={(event) =>
                  setScrolled(Math.round(event.nativeEvent.contentOffset.y))
                }
              >
                {Array.from({ length: 24 }, (_value, index) => (
                  <View
                    key={index}
                    style={styles.scrollRow}
                  >
                    <Text style={styles.scrollRowText}>row {index}</Text>
                  </View>
                ))}
              </ScrollView>
            </GestureDetector>
            <Status>
              {status.native ?? "—"} · offset {scrolled}
            </Status>
          </DemoCard>

          <DemoCard
            grid
            title="simultaneousWithExternalGesture"
            hint="drag the inner card down — both move, one responder"
          >
            <GestureDetector gesture={carrierGesture}>
              <Animated.View
                style={[board.card, styles.carrier, carrier.style]}
              >
                <GestureDetector gesture={riderGesture}>
                  <Animated.View style={[styles.rider, rider.style]}>
                    <Text style={board.cardLabel}>drag me down</Text>
                  </Animated.View>
                </GestureDetector>
              </Animated.View>
            </GestureDetector>
            <Status>{status.both ?? "—"}</Status>
          </DemoCard>

          <DemoCard
            grid
            title="requireExternalGestureToFail"
            hint="sideways: only the outer. down: the outer fails, the inner moves"
          >
            <GestureDetector gesture={blockerGesture}>
              <View style={[board.card, styles.blocker]}>
                <GestureDetector gesture={waiterGesture}>
                  <Animated.View style={[styles.waiter, waiter.style]}>
                    <Text style={board.cardLabel}>held until it fails</Text>
                  </Animated.View>
                </GestureDetector>
              </View>
            </GestureDetector>
            <Status>{status.wait ?? "—"}</Status>
          </DemoCard>
        </CardGrid>
      </Section>
    </GestureHandlerRootView>
  )
}
