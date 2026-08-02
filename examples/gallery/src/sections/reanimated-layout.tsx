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
  BounceIn,
  BounceOut,
  CurvedTransition,
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  JumpingTransition,
  Keyframe,
  LinearTransition,
  PinwheelIn,
  PinwheelOut,
  RollInLeft,
  RollOutRight,
  RotateInDownLeft,
  RotateOutUpRight,
  SequencedTransition,
  SlideInLeft,
  SlideOutRight,
  StretchInY,
  StretchOutY,
  ZoomIn,
  ZoomOut,
  type LayoutAnimationProps,
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
  presetStage: {
    height: 150,
    borderRadius: 10,
    backgroundColor: palette.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  presetBox: {
    width: 96,
    height: 96,
    borderRadius: 16,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  presetBoxLabel: {
    color: palette.onColor,
    fontSize: 12,
    fontWeight: "600",
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

// Eight of the sixty presets — one per family, which is what makes the
// differences legible. Listing all sixty would be a wall of buttons that says
// less: the interesting thing is that a bounce OVERSHOOTS, a roll spins as it
// travels, a stretch moves one axis, a slide moves the layout ORIGIN.
const PRESETS = [
  { name: "ZoomIn / ZoomOut", entering: ZoomIn, exiting: ZoomOut },
  { name: "BounceIn / BounceOut", entering: BounceIn, exiting: BounceOut },
  {
    name: "SlideInLeft / SlideOutRight",
    entering: SlideInLeft,
    exiting: SlideOutRight,
  },
  { name: "FadeInDown / FadeOutUp", entering: FadeInDown, exiting: FadeOutUp },
  {
    name: "RotateInDownLeft / RotateOutUpRight",
    entering: RotateInDownLeft,
    exiting: RotateOutUpRight,
  },
  {
    name: "PinwheelIn / PinwheelOut",
    entering: PinwheelIn,
    exiting: PinwheelOut,
  },
  {
    name: "RollInLeft / RollOutRight",
    entering: RollInLeft,
    exiting: RollOutRight,
  },
  {
    name: "StretchInY / StretchOutY",
    entering: StretchInY,
    exiting: StretchOutY,
  },
] as const

/** "ZoomIn / ZoomOut" -> "ZoomIn", for the button and the box label. */
const familyOf = (name: string): string => name.split(" ")[0] ?? name

const PresetPicker = () => {
  const [choice, setChoice] = useState(0)
  const [generation, setGeneration] = useState(0)
  const [shown, setShown] = useState(true)
  const preset = PRESETS[choice]!

  const play = (index: number) => {
    setChoice(index)
    setShown(true)
    setGeneration((value) => value + 1)
  }

  return (
    <>
      <Row>
        {PRESETS.map((entry, index) => (
          <Button
            key={entry.name}
            label={familyOf(entry.name)}
            quiet={index !== choice}
            onPress={() => play(index)}
          />
        ))}
      </Row>
      <View style={styles.presetStage}>
        {shown ? (
          <Animated.View
            // A new key remounts the box, which is what replays an
            // `entering` — the same trigger upstream documents.
            key={`${choice}-${generation}`}
            style={styles.presetBox}
            entering={preset.entering.duration(600)}
            exiting={preset.exiting.duration(600)}
          >
            <Text style={styles.presetBoxLabel}>{familyOf(preset.name)}</Text>
          </Animated.View>
        ) : null}
      </View>
      <Row>
        <Button
          label="Play the entering"
          onPress={() => play(choice)}
        />
        <Button
          label="Play the exiting"
          quiet
          onPress={() => setShown(false)}
        />
      </Row>
    </>
  )
}

const TRANSITIONS = [
  { name: "Linear", builder: LinearTransition },
  { name: "Curved", builder: CurvedTransition },
  { name: "Jumping", builder: JumpingTransition },
  { name: "Sequenced", builder: SequencedTransition },
] as const

const TransitionPicker = () => {
  const [choice, setChoice] = useState(0)
  const [items, setItems] = useState<Item[]>(() =>
    WORDS.slice(0, 4).map((label, index) => ({ id: index, label })),
  )
  const layout = TRANSITIONS[choice]!.builder.duration(
    600,
  ) as LayoutAnimationProps["layout"]

  return (
    <>
      <Row>
        {TRANSITIONS.map((entry, index) => (
          <Button
            key={entry.name}
            label={entry.name}
            quiet={index !== choice}
            onPress={() => setChoice(index)}
          />
        ))}
        <Button
          label="Shuffle"
          onPress={() => setItems((current) => [...current].reverse())}
        />
      </Row>
      <View style={styles.list}>
        {items.map((item) => (
          <Animated.View
            key={item.id}
            style={styles.row}
            layout={layout}
          >
            <Text style={styles.rowLabel}>{item.label}</Text>
            <Text style={styles.rowHint}>#{item.id}</Text>
          </Animated.View>
        ))}
      </View>
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
      title="The preset catalogue"
      hint="one preset per family — pick one and play it in, then out"
    >
      <PresetPicker />
      <Caption>
        Sixty of upstream&apos;s seventy-six presets are here, on
        upstream&apos;s own parameters: the 25 px of a `FadeInDown`, the
        55/15/15/15 split a bounce overshoots on, the five radians a pinwheel
        turns through. They are one builder over a table rather than sixty
        hand-written ones. The sixteen that are missing are the twelve `Flip*` —
        a real 3D rotation with a perspective, and this platform folds a
        transform into one 2D matrix — and the four `LightSpeed*`, which need a
        skew; both refuse by name rather than doing something else quietly.
      </Caption>
    </DemoCard>

    <DemoCard
      title="Layout transitions"
      hint="the same reorder, four ways: shuffle, then switch the transition and shuffle again"
    >
      <TransitionPicker />
      <Caption>
        `JumpingTransition` is the one to watch — it arcs the row clear of both
        rows on an ease-out-exp and drops it on a bounce, where `Linear` walks
        straight there and `Sequenced` moves one axis at a time. All four
        animate the position as a translation, which is paint-only; a width or
        height change lands immediately, so `CurvedTransition`&apos;s
        `.easingWidth()` is accepted and ignored. See docs/api.md.
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
