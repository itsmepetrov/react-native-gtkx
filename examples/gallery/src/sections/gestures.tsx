// Gestures: React Native's responder system and PanResponder.
//
// Every line here is portable react-native — no GTK import, nothing from the
// platform layer. The same source runs on iOS and Android. That is the whole
// claim this section exists to demonstrate, so it must not quietly reach for
// react-native-gtkx/gtk to make something work.
import { useState } from "react"
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from "react-native"
import { Caption, DemoCard, palette, Section } from "../ui"

const BOX = 56

const styles = StyleSheet.create({
  track: {
    height: 120,
    backgroundColor: palette.cardAlt,
    borderRadius: 10,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: 10,
  },
  readout: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  stat: {
    minWidth: 92,
    backgroundColor: palette.cardAlt,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 2,
  },
  statLabel: {
    color: palette.textFaint,
    fontSize: 11,
  },
  statValue: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "600",
  },
  targets: {
    flexDirection: "row",
    gap: 10,
  },
  target: {
    flex: 1,
    height: 84,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.cardAlt,
  },
  targetLabel: {
    color: palette.text,
    fontWeight: "600",
  },
  targetHint: {
    color: palette.textFaint,
    fontSize: 11,
  },
})

const Stat = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.stat}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
)

/**
 * The canonical PanResponder shape: `panHandlers` spread onto a View,
 * `gestureState.dx/dy` driving an `Animated.Value` directly. The Animated
 * write bypasses React entirely — the box follows the pointer at native
 * speed, and no render happens while dragging.
 */
const DragBox = () => {
  const [pan] = useState(() => new Animated.ValueXY())
  const [state, setState] = useState({ dx: 0, dy: 0, vx: 0, active: false })

  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setState((previous) => ({ ...previous, active: true }))
      },
      onPanResponderMove: (
        _event: GestureResponderEvent,
        gesture: PanResponderGestureState,
      ) => {
        pan.setValue({ x: gesture.dx, y: gesture.dy })
        setState({
          dx: gesture.dx,
          dy: gesture.dy,
          vx: gesture.vx,
          active: true,
        })
      },
      onPanResponderRelease: () => {
        // The canonical continuing-drag idiom: fold where it ended into the
        // offset and zero the animated part, so the next gesture's dx starts
        // from zero again instead of snapping the box back.
        pan.extractOffset()
        pan.setValue({ x: 0, y: 0 })
        setState((previous) => ({ ...previous, active: false }))
      },
    }),
  )

  return (
    <>
      <View style={styles.track}>
        <Animated.View
          {...responder.panHandlers}
          style={[
            styles.box,
            {
              backgroundColor: state.active
                ? palette.accentPressed
                : palette.accent,
              transform: pan.getTranslateTransform(),
            },
          ]}
        />
      </View>
      <View style={styles.readout}>
        <Stat
          label="dx"
          value={state.dx.toFixed(0)}
        />
        <Stat
          label="dy"
          value={state.dy.toFixed(0)}
        />
        <Stat
          label="vx"
          value={state.vx.toFixed(2)}
        />
        <Stat
          label="responder"
          value={state.active ? "held" : "free"}
        />
      </View>
    </>
  )
}

/**
 * Negotiation, visible. Both views want the gesture; the inner one wins on
 * bubble because RN asks the deepest view first. Switch the outer view to
 * its capture handler and it wins instead, without the inner one ever being
 * asked — the two orders are the whole point of the responder system.
 */
const Negotiation = () => {
  const [winner, setWinner] = useState<string>("—")
  const [outerCaptures, setOuterCaptures] = useState(false)

  return (
    <>
      <View
        style={styles.targets}
        onStartShouldSetResponderCapture={() => {
          if (outerCaptures) {
            setWinner("outer (capture)")
            return true
          }
          return false
        }}
        onResponderRelease={() => undefined}
      >
        <View
          style={styles.target}
          onStartShouldSetResponder={() => {
            setWinner("inner (bubble)")
            return true
          }}
        >
          <Text style={styles.targetLabel}>inner</Text>
          <Text style={styles.targetHint}>claims on bubble</Text>
        </View>
        <View
          style={styles.target}
          onStartShouldSetResponder={() => {
            setWinner("sibling (bubble)")
            return true
          }}
        >
          <Text style={styles.targetLabel}>sibling</Text>
          <Text style={styles.targetHint}>claims on bubble</Text>
        </View>
      </View>
      <View style={styles.readout}>
        <Stat
          label="last winner"
          value={winner}
        />
        <View
          style={styles.stat}
          onStartShouldSetResponder={() => {
            setOuterCaptures((previous) => !previous)
            return true
          }}
        >
          <Text style={styles.statLabel}>outer capture</Text>
          <Text style={styles.statValue}>{outerCaptures ? "on" : "off"}</Text>
        </View>
      </View>
    </>
  )
}

/** Touch props fire whether or not anything holds the responder. */
const TouchCounters = () => {
  const [counts, setCounts] = useState({ start: 0, move: 0, end: 0 })

  return (
    <>
      <View
        style={styles.track}
        onTouchStart={() => {
          setCounts((previous) => ({ ...previous, start: previous.start + 1 }))
        }}
        onTouchMove={() => {
          setCounts((previous) => ({ ...previous, move: previous.move + 1 }))
        }}
        onTouchEnd={() => {
          setCounts((previous) => ({ ...previous, end: previous.end + 1 }))
        }}
      />
      <View style={styles.readout}>
        <Stat
          label="onTouchStart"
          value={String(counts.start)}
        />
        <Stat
          label="onTouchMove"
          value={String(counts.move)}
        />
        <Stat
          label="onTouchEnd"
          value={String(counts.end)}
        />
      </View>
    </>
  )
}

export const GesturesSection = () => (
  <Section
    title="Gestures"
    subtitle="React Native's gesture responder system on GTK4 event controllers. PanResponder is react-native's own file, vendored unmodified."
  >
    <DemoCard
      title="PanResponder"
      hint="Drag the square. gestureState.dx/dy drive an Animated.ValueXY directly, so the box follows the pointer without a React render."
    >
      <DragBox />
      <Caption>
        Velocity is px/ms and is computed from a monotonic clock; the first move
        of a gesture always reports ~0, exactly as in React Native.
      </Caption>
    </DemoCard>

    <DemoCard
      title="Negotiation"
      hint="Press a box: the deepest view wins on bubble. Turn on the outer view's capture handler and it takes the gesture first instead."
    >
      <Negotiation />
      <Caption>
        There is no responder TRANSFER yet: once a view is granted, nothing can
        steal the gesture from it. GTK&apos;s sequence claim is irrevocable, so
        a transfer could not be honored against native widgets — see
        docs/api.md.
      </Caption>
    </DemoCard>

    <DemoCard
      title="Touch props"
      hint="onTouchStart/Move/End fire regardless of who holds the responder — press and drag inside the strip."
    >
      <TouchCounters />
    </DemoCard>
  </Section>
)
