// `Gesture.Pinch()` and `Gesture.Rotation()` — the two recognizers whose raw
// numbers come from GTK rather than from the pointer stream.
//
// This platform has one pointer. Upstream's `PinchGestureHandler` runs a
// `ScaleGestureDetector` over two tracked pointers and needs two real touches;
// there are none here. What there IS instead is a path upstream's own
// single-runtime implementation does not have: `GtkGestureZoom` reads
// `gdk_touchpad_event_get_pinch_scale()` straight off a `GDK_TOUCHPAD_PINCH`
// event, so a TOUCHPAD pinch drives the recognizer with no touchscreen
// involved. `GtkGestureRotate` does the same for the angle.
//
// So these two need a TOUCHPAD. A mouse cannot activate them, and the cards
// below say so rather than looking broken on a rig that has no touchpad.
//
// Neither ever takes the responder (`claimsResponder: false`), and that is
// structural rather than policy: the responder lock is a lock over an
// interaction, and an interaction starts with a press. A touchpad pinch has
// no button down, so there is no session to take and no GTK sequence to claim
// — which is why a pinch can run at the same time as anything else.
import { StyleSheet, Text, View } from "react-native"
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated"
import { useStatus } from "../gesture-board"
import { Caption, CardGrid, DemoCard, palette, Section, Status } from "../ui"

const styles = StyleSheet.create({
  root: { flex: 1 },
  stage: {
    height: 180,
    borderRadius: 10,
    backgroundColor: palette.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    // Without this a pinched-up card draws over the status line under it.
    overflow: "hidden",
  },
  card: {
    width: 96,
    height: 96,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  pinch: { backgroundColor: palette.accent },
  rotate: { backgroundColor: palette.purple },
  both: { backgroundColor: palette.green },
  label: { color: palette.onColor, fontSize: 12, fontWeight: "700" },
})

const PinchCard = () => {
  const { status, say } = useStatus()
  const scale = useSharedValue(1)
  const start = useSharedValue(1)

  const gesture = Gesture.Pinch()
    .onStart(() => {
      start.value = scale.value
      say("pinch", "ACTIVE")
    })
    .onUpdate((event) => {
      scale.value = start.value * event.scale
    })
    .onFinalize(() => say("pinch", `released at ×${scale.value.toFixed(2)}`))

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  return (
    <DemoCard
      grid
      title="Gesture.Pinch()"
      hint="two fingers on a touchpad, pinching in or out"
    >
      <View style={styles.stage}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.card, styles.pinch, style]}>
            <Text style={styles.label}>pinch me</Text>
          </Animated.View>
        </GestureDetector>
      </View>
      <Status>{status.pinch ?? "— needs a touchpad"}</Status>
    </DemoCard>
  )
}

const RotationCard = () => {
  const { status, say } = useStatus()
  const angle = useSharedValue(0)
  const start = useSharedValue(0)

  const gesture = Gesture.Rotation()
    .onStart(() => {
      start.value = angle.value
      say("rotation", "ACTIVE")
    })
    .onUpdate((event) => {
      angle.value = start.value + event.rotation
    })
    .onFinalize(() =>
      say(
        "rotation",
        `released at ${Math.round((angle.value * 180) / Math.PI)}°`,
      ),
    )

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${(angle.value * 180) / Math.PI}deg` }],
  }))

  return (
    <DemoCard
      grid
      title="Gesture.Rotation()"
      hint="two fingers on a touchpad, twisting"
    >
      <View style={styles.stage}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.card, styles.rotate, style]}>
            <Text style={styles.label}>twist me</Text>
          </Animated.View>
        </GestureDetector>
      </View>
      <Status>{status.rotation ?? "— needs a touchpad"}</Status>
    </DemoCard>
  )
}

/** Both at once, which is the case that needs no relation configured. */
const TogetherCard = () => {
  const { status, say } = useStatus()
  const scale = useSharedValue(1)
  const scaleStart = useSharedValue(1)
  const angle = useSharedValue(0)
  const angleStart = useSharedValue(0)

  const pinch = Gesture.Pinch()
    .onStart(() => {
      scaleStart.value = scale.value
      say("both", "pinching…")
    })
    .onUpdate((event) => {
      scale.value = scaleStart.value * event.scale
    })

  const rotation = Gesture.Rotation()
    .onStart(() => {
      angleStart.value = angle.value
      say("both", "rotating…")
    })
    .onUpdate((event) => {
      angle.value = angleStart.value + event.rotation
    })

  const style = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${(angle.value * 180) / Math.PI}deg` },
    ],
  }))

  return (
    <DemoCard
      grid
      title="Both, with nothing configured"
      hint="pinch and twist in the same motion — neither takes the responder, so neither can exclude the other"
    >
      <View style={styles.stage}>
        <GestureDetector gesture={pinch}>
          <GestureDetector gesture={rotation}>
            <Animated.View style={[styles.card, styles.both, style]}>
              <Text style={styles.label}>both</Text>
            </Animated.View>
          </GestureDetector>
        </GestureDetector>
      </View>
      <Status>{status.both ?? "— needs a touchpad"}</Status>
    </DemoCard>
  )
}

export const GesturePinchSection = () => (
  <GestureHandlerRootView style={styles.root}>
    <Section
      title="Pinch and rotation"
      subtitle="The two recognizers driven by GTK's own touchpad gestures rather than by the pointer stream — so they need a touchpad, and a mouse will not move them."
    >
      <CardGrid>
        <PinchCard />
        <RotationCard />
        <TogetherCard />
      </CardGrid>
      <Caption>
        Activation thresholds: five degrees of accumulated rotation, which is
        upstream&apos;s `ROTATION_RECOGNITION_THRESHOLD` reproduced exactly, and
        five percent of scale change, which is this platform&apos;s own number.
        Upstream&apos;s pinch gate is arithmetic over two touch POSITIONS and a
        touchpad pinch has none — libinput hands the compositor a ratio — so
        there is no span in pixels anywhere in the chain to measure slop
        against. libinput has also already decided the motion is a pinch rather
        than a two-finger scroll before any of this runs, which is a stricter
        gate than the one it replaces.
      </Caption>
    </Section>
  </GestureHandlerRootView>
)
