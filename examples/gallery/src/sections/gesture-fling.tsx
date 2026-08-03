// The last four recognizers: `Fling`, `Manual`, `Hover` and `ForceTouch`.
//
// They are together because what they have in common is the interesting part —
// each was refused for a DIFFERENT reason, and only one of those reasons
// turned out to be about the platform:
//
//   - `Fling` and `Manual` were always reachable and simply unwritten;
//   - `Hover` was refused on a judgement about the test rig that was wrong. A
//     hover needs no button, and a mouse hovers perfectly well — so it is now
//     the most fully verified of the four, driven end to end by an injected
//     pointer in the ordinary test suite;
//   - `ForceTouch` really does need hardware nothing here has by default. It is
//     driven by `GtkGestureStylus` and needs a pressure-reporting tablet tool,
//     so the card below says so rather than looking broken on a machine with
//     only a mouse.
//
// Two of the four demonstrate something a reader cannot see from the API docs,
// so those get the most room: `Fling` is the one where VELOCITY rather than
// distance decides, and `Manual` is the one where the app owns the state
// machine.
import { useRef, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import {
  Directions,
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated"
import { useStatus } from "../gesture-board"
import { Caption, CardGrid, DemoCard, palette, Section, Status } from "../ui"

const styles = StyleSheet.create({
  root: { flex: 1 },
  stage: {
    height: 150,
    borderRadius: 10,
    backgroundColor: palette.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  card: {
    width: 110,
    height: 84,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  fling: { backgroundColor: palette.accent },
  manual: { backgroundColor: palette.orange },
  hover: { backgroundColor: palette.green },
  force: { backgroundColor: palette.purple },
  label: { color: palette.onColor, fontSize: 12, fontWeight: "700" },
  hint: { color: palette.textDim, fontSize: 11, marginTop: 6 },
})

/**
 * `Fling` — a flick, not a drag.
 *
 * The card slides the way it was flung and springs back, so the difference
 * between a flick and a drag is visible rather than only reported: drag the
 * card slowly all the way across and nothing happens at all, then flick it the
 * same distance and it goes.
 */
const FlingCard = () => {
  const { status, say } = useStatus()
  const offset = useSharedValue(0)

  const gesture = Gesture.Fling()
    // Both bits, so either direction counts — a single number would have been
    // one-way, which is the knob's own sign convention.
    .direction(Directions.LEFT | Directions.RIGHT)
    .onStart((event) => {
      const direction = event.velocityX > 0 ? 1 : -1
      say(
        "fling",
        `flung ${direction > 0 ? "right" : "left"} at ${Math.round(
          Math.abs(event.velocityX),
        )} px/s`,
      )
      offset.set(
        withSpring(direction * 90, { damping: 12 }, () => {
          offset.set(withSpring(0))
        }),
      )
    })
    .onFinalize((_event, success) => {
      if (!success) {
        say("fling", "too slow — that was a drag, not a fling")
      }
    })

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }))

  return (
    <DemoCard
      grid
      title="Gesture.Fling()"
      hint="flick left or right — then try dragging the same distance slowly"
    >
      <View style={styles.stage}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.card, styles.fling, style]}>
            <Text style={styles.label}>flick me</Text>
          </Animated.View>
        </GestureDetector>
      </View>
      <Status>{status.fling ?? "— flick the card"}</Status>
      <Text style={styles.hint}>
        Activates above 700 px/s within 800ms, inside a 30° cone of the
        direction asked for. Distance is not a criterion at all.
      </Text>
    </DemoCard>
  )
}

/**
 * `Manual` — the app owns the state machine.
 *
 * The rule below is deliberately one no recognizer in the module has: activate
 * only once the drag has gone further DOWN than it went across. It is
 * arbitrary, which is the point — a manual gesture exists so an app can express
 * a criterion nobody anticipated.
 */
const ManualCard = () => {
  const { status, say } = useStatus()
  const offset = useSharedValue(0)
  const press = useRef({ x: 0, y: 0 })

  const gesture = Gesture.Manual()
    .onTouchesDown((event, manager) => {
      const touch = event.allTouches[0]
      press.current = { x: touch?.absoluteX ?? 0, y: touch?.absoluteY ?? 0 }
      manager.begin()
      say("manual", "BEGAN — drag down more than across")
    })
    .onTouchesMove((event, manager) => {
      const touch = event.allTouches[0]
      if (!touch) {
        return
      }
      const dx = Math.abs(touch.absoluteX - press.current.x)
      const dy = touch.absoluteY - press.current.y
      if (dy > 24 && dy > dx) {
        manager.activate()
      }
    })
    .onTouchesUp((_event, manager) => {
      manager.end()
    })
    .onStart(() => say("manual", "ACTIVE — the app said so"))
    .onUpdate((event) => {
      offset.set(event.translationY)
    })
    .onEnd(() => {
      offset.set(withTiming(0))
      say("manual", "ended — the app said that too")
    })

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }))

  return (
    <DemoCard
      grid
      title="Gesture.Manual()"
      hint="drag down to activate; drag sideways and nothing happens"
    >
      <View style={styles.stage}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.card, styles.manual, style]}>
            <Text style={styles.label}>drag down</Text>
          </Animated.View>
        </GestureDetector>
      </View>
      <Status>{status.manual ?? "— press and drag"}</Status>
      <Text style={styles.hint}>
        No recognition of its own: `.begin()`, `.activate()` and `.end()` from
        the touch callbacks are the whole gesture. It still goes through the
        same arbitration as everything else.
      </Text>
    </DemoCard>
  )
}

/**
 * `Hover` — the pointer being over the view, with nothing pressed.
 *
 * The card follows the pointer with a dot rather than only lighting up,
 * because the payload carries a position and that is worth seeing.
 */
const HoverCard = () => {
  const [inside, setInside] = useState(false)
  const x = useSharedValue(0)
  const y = useSharedValue(0)

  const gesture = Gesture.Hover()
    .onStart(() => setInside(true))
    .onUpdate((event) => {
      x.set(event.x)
      y.set(event.y)
    })
    .onEnd(() => setInside(false))

  const dot = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value - 55 }, { translateY: y.value - 42 }],
  }))

  return (
    <DemoCard
      grid
      title="Gesture.Hover()"
      hint="move the pointer over the card — no button, no click"
    >
      <View style={styles.stage}>
        <GestureDetector gesture={gesture}>
          <View
            style={{
              width: 220,
              height: 110,
              borderRadius: 12,
              backgroundColor: inside ? palette.green : palette.cardAlt,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={styles.label}>{inside ? "hovering" : "hover me"}</Text>
            <Animated.View
              style={[
                {
                  position: "absolute",
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: palette.onColor,
                  opacity: inside ? 1 : 0,
                },
                dot,
              ]}
            />
          </View>
        </GestureDetector>
      </View>
      <Status>
        {inside ? "ACTIVE on the crossing" : "— pointer is outside"}
      </Status>
      <Text style={styles.hint}>
        Goes straight to ACTIVE on enter and ENDs on leave, driven by
        GtkEventControllerMotion. It never takes the responder, because there is
        no press and so no interaction to take.
      </Text>
    </DemoCard>
  )
}

/**
 * `ForceTouch` — the only one of the ten that needs hardware this machine
 * probably does not have.
 *
 * The card says so rather than sitting inert and looking broken, which is the
 * same thing the pinch and rotation cards do for a missing touchpad.
 */
const ForceTouchCard = () => {
  const { status, say } = useStatus()
  const pressure = useSharedValue(0)

  const gesture = Gesture.ForceTouch()
    .minForce(0.2)
    .onStart(() => say("force", "ACTIVE — past minForce"))
    .onUpdate((event) => {
      pressure.set(event.force)
      say("force", `force ${event.force.toFixed(2)}`)
    })
    .onEnd(() => {
      pressure.set(withTiming(0))
      say("force", "lifted")
    })

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pressure.value * 0.5 }],
  }))

  return (
    <DemoCard
      grid
      title="Gesture.ForceTouch()"
      hint="needs a pressure-sensitive stylus on a tablet"
    >
      <View style={styles.stage}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.card, styles.force, style]}>
            <Text style={styles.label}>press hard</Text>
          </Animated.View>
        </GestureDetector>
      </View>
      <Status>{status.force ?? "— needs a stylus"}</Status>
      <Text style={styles.hint}>
        Driven by GtkGestureStylus, which is stylus-only: a mouse produces no
        events here at all, so this card cannot activate by accident on a
        machine with no tablet.
      </Text>
    </DemoCard>
  )
}

export const GestureFlingSection = () => (
  <GestureHandlerRootView style={styles.root}>
    <Section
      title="Fling, manual, hover and force touch"
      subtitle="The last four recognizers, and four different reasons they were refused until now — only one of which turned out to be about the platform."
    >
      <CardGrid>
        <FlingCard />
        <ManualCard />
        <HoverCard />
        <ForceTouchCard />
      </CardGrid>
      <Caption>
        A fling is decided by VELOCITY, not by distance — 700 px/s inside a
        30&deg; cone, with an 800ms deadline underneath it — so a slow drag
        across the same distance is not a fling and never becomes one. Hover
        activates on the crossing with no threshold at all, and like the
        touchpad gestures it never takes the responder, because a gesture with
        no press has no interaction to lock. Mutual exclusion is still the
        default: a hover sharing a screen with a pan wants
        `simultaneousWithExternalGesture` between them, which is what upstream
        does too.
      </Caption>
    </Section>
  </GestureHandlerRootView>
)
