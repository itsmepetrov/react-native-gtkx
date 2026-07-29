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
      subtitle="Контролируемый Switch (стейт ведёт prop, дефолтный тоггл проглатывается) и ActivityIndicator в трёх размерах."
    >
      <DemoCard
        title="Switch"
        hint="value/onValueChange; выключенный disabled-переключатель не реагирует"
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
        title="ActivityIndicator: размеры"
        hint='size: "small" (20) | "large" (36) | число (48)'
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
        hint="Switch управляет пропом animating соседнего спиннера"
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
              ? "animating: true — крутится"
              : "animating: false — стоит"}
          </Text>
        </View>
      </DemoCard>
    </Section>
  )
}
