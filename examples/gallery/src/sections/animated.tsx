// Animated: the drivers — timing, spring, loop and sequence. Values bypass
// React entirely: listeners write directly to the widget (opacity) and to the
// rect store the parent's layout manager allocates from (transforms).
//
// What a value is INTERPOLATED into has a section of its own, and so does
// what a transform does to the widget's box.
import { useEffect, useMemo, useRef, useState } from "react"
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Caption, DemoCard, palette, Section, Status } from "../ui"

const styles = StyleSheet.create({
  track: {
    height: 40,
    borderRadius: 8,
    backgroundColor: palette.cardAlt,
  },
  square: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  button: {
    backgroundColor: palette.accent,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  buttonPressed: {
    backgroundColor: palette.accentPressed,
  },
  buttonText: {
    color: palette.onColor,
    fontWeight: "700",
    fontSize: 13,
  },
  parallaxCard: {
    height: 220,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: palette.cardAlt,
  },
  parallaxHeader: {
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.accent,
  },
  parallaxHeaderText: {
    color: palette.onColor,
    fontWeight: "700",
    fontSize: 14,
  },
  parallaxScroll: {
    flex: 1,
  },
  parallaxRow: {
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.card,
  },
  parallaxRowText: {
    color: palette.text,
    fontSize: 13,
  },
})

// The motion range is tied to the actual track width via onLayout — on window
// resize the square stays inside the card.
const TimingLoop = () => {
  const [progress] = useState(() => new Animated.Value(0))
  const [trackWidth, setTrackWidth] = useState(0)

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.quad),
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.quad),
        }),
      ]),
    )
    animation.start()
    return () => animation.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const translateX = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, Math.max(0, trackWidth - 40)],
      }),
    [progress, trackWidth],
  )

  return (
    <View
      style={styles.track}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          styles.square,
          {
            backgroundColor: palette.orange,
            transform: [{ translateX }],
          },
        ]}
      />
    </View>
  )
}

// An underdamped spring OVERSHOOTS its target — that is its physics. Since
// the custom layout manager landed, transforms are paint-only exactly like
// in RN: the square honestly flies PAST the track edge over whatever sits
// there and springs back, moving nothing. This is the canonical RN code —
// a plain 0↔1 → pixels interpolation, no defensive math.
const SpringToggle = () => {
  const [position] = useState(() => new Animated.Value(0))
  const [trackWidth, setTrackWidth] = useState(0)
  const atEnd = useRef(false)

  const translateX = useMemo(() => {
    const width = Math.max(0, trackWidth - 40)
    return position.interpolate({
      inputRange: [0, 1],
      outputRange: [0, width],
    })
  }, [position, trackWidth])

  const toggle = (): void => {
    atEnd.current = !atEnd.current
    Animated.spring(position, {
      toValue: atEnd.current ? 1 : 0,
      stiffness: 120,
      damping: 9,
    }).start()
  }

  return (
    <>
      <View
        style={styles.track}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        <Animated.View
          style={[
            styles.square,
            {
              backgroundColor: palette.green,
              transform: [{ translateX }],
            },
          ]}
        />
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
        onPress={toggle}
      >
        <Text style={styles.buttonText}>spring to the other edge</Text>
      </Pressable>
    </>
  )
}

// `Animated` (the value imported above) has no matching TYPE of the same
// name — unlike upstream's own `Animated.Value` spelling, which works
// because RN's own types merge a namespace declaration onto the value. This
// platform exports the object only, so the instance type is reached the
// same way any class instance behind a plain value is: through the runtime
// value's own type.
type AnimatedValue = InstanceType<typeof Animated.Value>

const PARALLAX_ROWS = Array.from(
  { length: 14 },
  (_, index) => `Ported row ${index + 1}`,
)

// The fade range the header's own interpolation is measured against — past
// it the header is as dim/receded as it gets, which is what `extrapolate:
// "clamp"` holds once scrollY keeps climbing past the row content's own
// range.
const PARALLAX_FADE_RANGE = 160

// Opacity and translateY, not height: both take the direct widget-write path
// (setOpacity, the transform's rect-store slot) that costs nothing per
// scroll tick — the same path Animated.spring's square rides above. An
// animated `height` here would ask the ScrollView sitting right below it to
// reflow around the change, which is a real Yoga pass rather than a paint,
// so this shrinks and fades in place instead of resizing.
const ScrollLinkedHeader = ({
  scrollY,
  renderCountRef,
}: {
  scrollY: AnimatedValue
  // A ref, not state: incrementing it during render is the only way to
  // observe "React committed this component" without becoming a render
  // itself — same escape hatch the gallery's other render counters use.
  renderCountRef: { current: number }
}) => {
  renderCountRef.current += 1

  const opacity = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [0, PARALLAX_FADE_RANGE],
        outputRange: [1, 0.25],
        extrapolate: "clamp",
      }),
    [scrollY],
  )
  const translateY = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [0, PARALLAX_FADE_RANGE],
        outputRange: [0, -18],
        extrapolate: "clamp",
      }),
    [scrollY],
  )

  return (
    <Animated.View
      style={[styles.parallaxHeader, { opacity, transform: [{ translateY }] }]}
    >
      <Text style={styles.parallaxHeaderText}>Ported header, untouched</Text>
    </Animated.View>
  )
}

// Snapshots the running counters onto a timer rather than reading them
// directly during render — reading a plain ref during render is exactly what
// the React Compiler memoises away as having no reactive input, which would
// freeze this readout at its mount-time value forever (the gotcha the
// Reanimated section's own stats.ts documents for the identical shape).
const ScrollEventReadout = ({
  renderCountRef,
  offsetRef,
  ticksRef,
}: {
  renderCountRef: { current: number }
  offsetRef: { current: number }
  ticksRef: { current: number }
}) => {
  const [snapshot, setSnapshot] = useState({ renders: 1, offset: 0, ticks: 0 })

  useEffect(() => {
    const timer = setInterval(() => {
      setSnapshot({
        renders: renderCountRef.current,
        offset: offsetRef.current,
        ticks: ticksRef.current,
      })
    }, 200)
    return () => clearInterval(timer)
  }, [renderCountRef, offsetRef, ticksRef])

  return (
    <Status>
      {snapshot.ticks} scroll events, listener offset {snapshot.offset}px —
      header rendered {snapshot.renders}×
    </Status>
  )
}

// The classic idiom, transcribed unchanged: a ScrollView's onScroll IS
// Animated.event, mapping contentOffset.y onto a Value the header
// interpolates. Nothing about this component tree differs from what a ported
// app already wrote for iOS/Android — the traversal in animated/event.ts is
// the only thing standing in for the native side that does not exist here.
const ScrollLinkedParallax = () => {
  const [scrollY] = useState(() => new Animated.Value(0))
  const headerRendersRef = useRef(0)
  const listenerOffsetRef = useRef(0)
  const listenerTicksRef = useRef(0)

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        // The listener RN apps reach for alongside the mapping — analytics,
        // a sticky title swap — called with the same ScrollEvent, after
        // scrollY has already been written for this call.
        listener: (event) => {
          const { nativeEvent } = event as {
            nativeEvent: { contentOffset: { y: number } }
          }
          listenerOffsetRef.current = Math.round(nativeEvent.contentOffset.y)
          listenerTicksRef.current += 1
        },
      }),
    [scrollY],
  )

  return (
    <>
      <View style={styles.parallaxCard}>
        <ScrollLinkedHeader
          scrollY={scrollY}
          renderCountRef={headerRendersRef}
        />
        <ScrollView
          style={styles.parallaxScroll}
          onScroll={onScroll}
        >
          {PARALLAX_ROWS.map((row) => (
            <View
              key={row}
              style={styles.parallaxRow}
            >
              <Text style={styles.parallaxRowText}>{row}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
      <ScrollEventReadout
        renderCountRef={headerRendersRef}
        offsetRef={listenerOffsetRef}
        ticksRef={listenerTicksRef}
      />
    </>
  )
}

export const AnimatedSection = () => (
  <Section
    title="Animated"
    subtitle="timing, spring, loop and sequence on a direct path bypassing React: setOpacity on the widget, and the layout manager placing the base rect under the style's transform."
  >
    <DemoCard
      title="Animated.timing + loop"
      hint="translateX interpolated from the track width (onLayout) — adapts to window resizes"
    >
      <TimingLoop />
    </DemoCard>

    <DemoCard
      title="Animated.spring"
      hint="stiffness/damping physics: the overshoot honestly flies past the edge and springs back — transforms are paint-only, like in RN"
    >
      <SpringToggle />
    </DemoCard>

    <DemoCard
      title="Animated.event"
      hint="scroll the rows — the header fades and rises on scrollY.interpolate(), and the listener alongside it gets the raw offset"
    >
      <ScrollLinkedParallax />
      <Caption>
        Animated.event&apos;s arg-mapping traversal writes contentOffset.y
        straight onto scrollY via setValue() — no state, no re-render — so a
        ported app&apos;s scroll-linked header keeps working exactly as written.
        The header&apos;s render count above proves it: it is counted once at
        mount and never again, no matter how many scroll events the listener
        counts alongside it.
      </Caption>
    </DemoCard>
  </Section>
)
