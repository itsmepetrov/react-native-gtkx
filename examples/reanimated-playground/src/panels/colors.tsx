// 3 — Colours.
//
// `interpolateColor` maps a number to a colour string, and the string goes
// into `backgroundColor` in an animated style. On this platform that lands in
// a `GtkCssProvider` private to the widget, reloaded in place: 11.2 µs per
// frame, flat in the size of the tree, and no React render.
//
// A colour is never the animated VALUE — `withTiming("#ff0000")` throws here,
// by design. The number is animated and the colour is derived from it, which
// is what Reanimated's own examples do on every platform.
import { useEffect, useRef, useState } from "react"
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from "react-native"
import Animated, {
  clamp,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated"
import { Button, Caption, palette, Panel, Row } from "../ui"

const HANDLE = 26

// Blue → red → green, the three stops the slider walks between.
const STOPS = [0, 0.5, 1]
const COLORS = ["#1c71d8", "#c01c28", "#26a269"]

// The auto pair takes the long way round the colour wheel, which is where
// RGB and HSV visibly disagree: RGB fades through mud, HSV through the hues
// in between.
const AUTO_COLORS = ["#1c71d8", "#f6d32d"]

const styles = StyleSheet.create({
  swatch: {
    height: 96,
    borderRadius: 12,
  },
  sliderTrack: {
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.cardAlt,
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  handle: {
    width: HANDLE,
    height: HANDLE,
    borderRadius: HANDLE / 2,
    backgroundColor: palette.text,
  },
  autoRow: {
    flexDirection: "row",
    gap: 12,
  },
  autoCell: {
    flex: 1,
    gap: 6,
  },
  autoSwatch: {
    height: 64,
    borderRadius: 10,
  },
  autoLabel: {
    color: palette.textFaint,
    fontSize: 12,
  },
})

const HandDriven = () => {
  const progress = useSharedValue(0)
  const [trackWidth, setTrackWidth] = useState(0)
  const travel = Math.max(0, trackWidth - HANDLE - 10)

  // The responder is created once; the travel distance it divides by changes
  // with the window, so it is read through a ref rather than captured.
  const spanRef = useRef(1)
  spanRef.current = Math.max(1, travel)
  const originRef = useRef(0)

  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        originRef.current = progress.get()
      },
      onPanResponderMove: (
        _event: GestureResponderEvent,
        gesture: PanResponderGestureState,
      ) => {
        progress.set(
          clamp(originRef.current + gesture.dx / spanRef.current, 0, 1),
        )
      },
    }),
  )

  const swatchStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), STOPS, COLORS),
  }))

  // The dependency array is load-bearing here and nowhere else in this app:
  // this updater closes over `travel`, which is React state, and a mapper
  // only re-runs when a SHARED VALUE it read changes. Passing `[travel]`
  // rebuilds it on resize; without it the handle would sit at the old
  // position until the next drag.
  const handleStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: progress.get() * travel }] }),
    [travel],
  )

  const goTo = (value: number) => () => {
    progress.set(withTiming(value, { duration: 350 }))
  }

  return (
    <>
      <Animated.View style={[styles.swatch, swatchStyle]} />
      <View
        style={styles.sliderTrack}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      >
        <Animated.View
          style={[styles.handle, handleStyle]}
          {...responder.panHandlers}
        />
      </View>
      <Row>
        <Button
          label="0.00"
          quiet
          onPress={goTo(0)}
        />
        <Button
          label="0.25"
          quiet
          onPress={goTo(0.25)}
        />
        <Button
          label="0.50"
          quiet
          onPress={goTo(0.5)}
        />
        <Button
          label="0.75"
          quiet
          onPress={goTo(0.75)}
        />
        <Button
          label="1.00"
          quiet
          onPress={goTo(1)}
        />
      </Row>
    </>
  )
}

const AutoPair = () => {
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.set(withRepeat(withTiming(1, { duration: 2200 }), -1, true))
  }, [progress])

  const rgb = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], AUTO_COLORS),
  }))
  const hsv = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.get(),
      [0, 1],
      AUTO_COLORS,
      "HSV",
    ),
  }))

  return (
    <View style={styles.autoRow}>
      <View style={styles.autoCell}>
        <Animated.View style={[styles.autoSwatch, rgb]} />
        <Text style={styles.autoLabel}>
          &apos;RGB&apos; — upstream&apos;s 2.2 gamma
        </Text>
      </View>
      <View style={styles.autoCell}>
        <Animated.View style={[styles.autoSwatch, hsv]} />
        <Text style={styles.autoLabel}>
          &apos;HSV&apos; — upstream&apos;s hue-wrap correction
        </Text>
      </View>
    </View>
  )
}

export const ColorsPanel = () => (
  <Panel
    index="03"
    title="Colours"
    subtitle="interpolateColor into backgroundColor — by hand, and on a loop."
  >
    <HandDriven />
    <Caption>
      Drag the pill or press a stop. One shared value walks 0 → 1;
      `interpolateColor` turns it into blue → red → green and the animated style
      writes it. The colour reaches GTK through a `GtkCssProvider` private to
      that one widget, reloaded in place — 11.2 µs per frame, the same at any
      tree size, and deliberately NOT through the memoised class registry the
      static styles use (that one would mint a class per frame into a
      process-wide stylesheet: 0.8 ms on the first frame, 6.8 ms by the
      six-hundredth, still climbing).
    </Caption>
    <AutoPair />
    <Caption>
      Both squares are the same `withRepeat(withTiming(...), -1, true)` on one
      shared value, blue → yellow, differing only in the colour space. RGB
      crosses through the desaturated middle; HSV takes the hue path and stays
      saturated. &apos;LAB&apos; throws here, by name — upstream&apos;s is a
      vendored slice of culori fed the wrong channel scale.
    </Caption>
  </Panel>
)
