// Layout animations: the ones you get without writing a shared value.
//
// `entering`, `exiting` and `layout` are props on an `Animated.View`, and the
// runtime supplies the values — where the view WAS, where the layout engine
// just put it. That is the whole difference from the rest of the Reanimated
// surface: nothing here is driven by hand.
//
// `LinearTransition` is the interesting one on this platform. Upstream
// animates `originX`/`originY`/`width`/`height`; the same four are produced
// here, and the runtime honours the origins as a translation — which is
// paint-only, so a row walking to its new place costs no layout pass — and
// applies the size immediately. See docs/api.md.
import { useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  Keyframe,
  LinearTransition,
} from "react-native-reanimated"
import { Button, Caption, DemoCard, palette, Row, Section } from "../ui"

type Item = { id: number; label: string }

const WORDS = [
  "Wayland",
  "GTK",
  "Adwaita",
  "Yoga",
  "Pango",
  "GSK",
  "GObject",
  "Cairo",
]

const styles = StyleSheet.create({
  list: {
    gap: 8,
    minHeight: 180,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: palette.cardAlt,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowLabel: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "600",
  },
  rowHint: {
    color: palette.textDim,
    fontSize: 12,
  },
  pulseHost: {
    height: 120,
    borderRadius: 10,
    backgroundColor: palette.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  pulse: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: palette.purple,
  },
})

/**
 * `new Keyframe({...})` is the one builder that is a class you instantiate
 * rather than a preset you configure. Each key is a percentage (or
 * `from`/`to`); every property becomes a `withSequence` of `withTiming` steps
 * whose durations are the gaps between the offsets, exactly as upstream
 * compiles them.
 */
const pulse = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.4 }] },
  60: {
    opacity: 1,
    transform: [{ scale: 1.15 }],
    easing: Easing.out(Easing.cubic),
  },
  100: { opacity: 1, transform: [{ scale: 1 }] },
}).duration(700)

const EnteringLeaving = () => {
  const [items, setItems] = useState<Item[]>(() =>
    WORDS.slice(0, 4).map((label, index) => ({ id: index, label })),
  )
  const [nextId, setNextId] = useState(4)

  const add = () => {
    setItems((current) => [
      { id: nextId, label: WORDS[nextId % WORDS.length]! },
      ...current,
    ])
    setNextId((id) => id + 1)
  }

  const removeFirst = () => setItems((current) => current.slice(1))
  const removeMiddle = () =>
    setItems((current) =>
      current.filter(
        (_item, index) => index !== Math.floor(current.length / 2),
      ),
    )
  const shuffle = () => setItems((current) => [...current].reverse())

  return (
    <>
      <Row>
        <Button
          label="Add to the top"
          onPress={add}
        />
        <Button
          label="Remove the top"
          quiet
          onPress={removeFirst}
        />
        <Button
          label="Remove the middle"
          quiet
          onPress={removeMiddle}
        />
        <Button
          label="Reverse"
          quiet
          onPress={shuffle}
        />
      </Row>
      <View style={styles.list}>
        {items.map((item) => (
          <Animated.View
            key={item.id}
            style={styles.row}
            entering={FadeIn.duration(320)}
            exiting={FadeOut.duration(320)}
            layout={LinearTransition.duration(320)}
          >
            <Text style={styles.rowLabel}>{item.label}</Text>
            <Text style={styles.rowHint}>#{item.id}</Text>
          </Animated.View>
        ))}
      </View>
    </>
  )
}

const KeyframePulse = () => {
  const [generation, setGeneration] = useState(0)
  return (
    <>
      <View style={styles.pulseHost}>
        <Animated.View
          // Remounting is what replays an `entering` animation — the key
          // changing is the whole trigger, exactly as upstream.
          key={generation}
          style={styles.pulse}
          entering={pulse}
        />
      </View>
      <Row>
        <Button
          label="Play it again"
          onPress={() => setGeneration((value) => value + 1)}
        />
      </Row>
    </>
  )
}

export const ReanimatedLayoutSection = () => (
  <Section
    title="Layout animations"
    subtitle="entering, exiting and layout — the animations the runtime supplies the values for, so nothing here drives a shared value by hand."
  >
    <DemoCard
      title="FadeIn, FadeOut and LinearTransition"
      hint="add and remove rows: new ones fade in, leaving ones fade out, and the survivors WALK to their new places instead of jumping"
    >
      <EnteringLeaving />
      <Caption>
        &quot;Remove the middle&quot; is the one to watch: everything below the
        gap moves up, and `LinearTransition` carries each row from where it was
        to where the layout engine just put it. A leaving row has to outlive its
        own removal for `exiting` to be visible at all — the runtime retains it
        until the animation finishes and drops it after.
      </Caption>
    </DemoCard>

    <DemoCard
      title="Keyframe"
      hint="a hand-written track: 0% → 60% → 100%, with an easing on the step that ends at 60"
    >
      <KeyframePulse />
      <Caption>
        Percentages (or `from`/`to`) mapped to styles, compiled into a
        `withSequence` of `withTiming` steps whose durations are the gaps
        between offsets — and a per-keyframe `easing` applies to the step that
        ENDS there, as in CSS. `.springify()` throws here, as upstream: a
        keyframe track is defined by its timeline and a spring has none.
      </Caption>
    </DemoCard>
  </Section>
)
