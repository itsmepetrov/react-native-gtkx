// 1 — Drag me.
//
// A shared value per axis, written straight from PanResponder's gesture
// state, read back by `useAnimatedStyle` into a transform. On release the
// same shared values are handed a `withSpring`, so the box flies home under
// physics rather than being set back.
//
// The box holds NO React state, which is the point: nothing in this file can
// cause a render while the pointer moves. The grab feedback is a third leaf
// of the same transform (`scale`), not a `setState`.
import { useRef, useState } from "react"
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from "react-native"
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated"
import { countWrite, useRenderCount } from "../stats"
import { Caption, palette, Panel } from "../ui"

const BOX = 72

const styles = StyleSheet.create({
  arena: {
    height: 200,
    backgroundColor: palette.cardAlt,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    // The box is a transform away from wherever the pointer takes it, and a
    // transform is paint-only — without this it draws over the caption under
    // the arena, exactly as it would in RN. `overflow: "hidden"` is the
    // portable answer and it is the one this platform used to accept and
    // ignore; it clips to the rounded shape above, corners included.
    overflow: "hidden",
  },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: 14,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  boxLabel: {
    color: palette.onColor,
    fontSize: 12,
    fontWeight: "700",
  },
})

const DragBox = () => {
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const scale = useSharedValue(1)

  // Counted for panel 2. Stays at 1 for the life of the app: nothing below
  // sets state, and the animated style's SHAPE never changes, so there is
  // nothing to make React look at this component again.
  useRenderCount("drag")
  useAnimatedReaction(
    () => x.get() + y.get(),
    () => countWrite("drag"),
  )

  // PanResponder reports dx/dy relative to the grant, so the position the
  // gesture started from has to be remembered — including mid-spring, which
  // is why it is read off the shared value rather than assumed to be zero.
  const origin = useRef({ x: 0, y: 0 })

  const home = () => {
    x.set(withSpring(0))
    y.set(withSpring(0))
    scale.set(withTiming(1, { duration: 160 }))
  }

  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        origin.current = { x: x.get(), y: y.get() }
        scale.set(withSpring(1.15))
      },
      onPanResponderMove: (
        _event: GestureResponderEvent,
        gesture: PanResponderGestureState,
      ) => {
        x.set(origin.current.x + gesture.dx)
        y.set(origin.current.y + gesture.dy)
      },
      onPanResponderRelease: home,
      onPanResponderTerminate: home,
    }),
  )

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.get() },
      { translateY: y.get() },
      { scale: scale.get() },
    ],
  }))

  return (
    <View style={styles.arena}>
      <Animated.View
        style={[styles.box, animatedStyle]}
        {...responder.panHandlers}
      >
        <Text style={styles.boxLabel}>drag me</Text>
      </Animated.View>
    </View>
  )
}

export const DragPanel = () => (
  <Panel
    index="01"
    title="Drag me"
    subtitle="A shared value per axis, driven by the pointer, sprung back on release."
  >
    <DragBox />
    <Caption>
      Grab the box with the mouse and throw it around. Let go and `withSpring`
      returns it — an underdamped spring, so it overshoots home and settles.
    </Caption>
    <Caption>
      Drag it past an edge and it is CUT OFF at the arena, rounded corners and
      all, instead of sliding over this caption: the platform honouring the
      arena&apos;s `overflow: &quot;hidden&quot;` — the RN style it used to
      accept and ignore — with paint and hit-testing stopping at the same clip.
      Clamping the shared value in the gesture (`clamp()` ships here) would keep
      the box in too, but that is an app choosing where a drag ENDS rather than
      the platform obeying a style, and it would leave nothing here for the clip
      to show.
    </Caption>
    <Caption>
      Honest note: this is NOT `GestureDetector`. `Gesture.Pan()` and
      `GestureDetector` are not implemented on this platform — they throw,
      naming themselves — so the drag is React Native&apos;s own `PanResponder`,
      spread onto the `Animated.View` as `panHandlers`. That is the same code an
      RN app wrote before the Gesture API existed, and it runs here unchanged.
      The Reanimated half — the shared values, the `useAnimatedStyle`, the
      `withSpring` — is exactly what you would write on iOS.
    </Caption>
  </Panel>
)
