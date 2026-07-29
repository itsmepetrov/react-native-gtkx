// Switch (GtkSwitch, controlled) and ActivityIndicator (GtkSpinner):
// small/large/numeric sizes, animating, disabled.
import { useState } from "react"
import { ActivityIndicator, StyleSheet, Switch, Text, View } from "react-native"
import { Caption, DemoCard, palette, Section } from "../ui"

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    flexWrap: "wrap",
  },
  item: {
    gap: 4,
    alignItems: "center",
  },
  status: {
    color: palette.textDim,
    fontSize: 12,
  },
})

export const TogglesSection = () => {
  const [on, setOn] = useState(true)
  const [spinning, setSpinning] = useState(true)

  return (
    <Section
      title="Toggles"
      subtitle="Controlled Switch (state drives the prop, the default toggle is swallowed) and ActivityIndicator in three sizes."
    >
      <DemoCard
        title="Switch"
        hint="value/onValueChange; a disabled switch does not react"
      >
        <View style={styles.row}>
          <View style={styles.item}>
            <Switch
              value={on}
              onValueChange={setOn}
            />
            <Caption>{on ? "value: true" : "value: false"}</Caption>
          </View>
          <View style={styles.item}>
            <Switch
              value
              disabled
            />
            <Caption>disabled, on</Caption>
          </View>
          <View style={styles.item}>
            <Switch
              value={false}
              disabled
            />
            <Caption>disabled, off</Caption>
          </View>
        </View>
      </DemoCard>

      <DemoCard
        title="ActivityIndicator: sizes"
        hint='size: "small" (20) | "large" (36) | number (48)'
      >
        <View style={styles.row}>
          <View style={styles.item}>
            <ActivityIndicator size="small" />
            <Caption>small</Caption>
          </View>
          <View style={styles.item}>
            <ActivityIndicator size="large" />
            <Caption>large</Caption>
          </View>
          <View style={styles.item}>
            <ActivityIndicator size={48} />
            <Caption>48 px</Caption>
          </View>
        </View>
      </DemoCard>

      <DemoCard
        title="animating"
        hint="the Switch drives the animating prop of the spinner next to it"
      >
        <View style={styles.row}>
          <Switch
            value={spinning}
            onValueChange={setSpinning}
          />
          <ActivityIndicator
            animating={spinning}
            size="large"
          />
          <Text style={styles.status}>
            {spinning
              ? "animating: true — spinning"
              : "animating: false — stopped"}
          </Text>
        </View>
      </DemoCard>
    </Section>
  )
}
