// View: backgrounds, borders (including per-side and dashed/dotted), corner
// radii, opacity and nesting of GtkFixed containers.
import { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Caption, DemoCard, palette, Section } from "../ui"

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "flex-end",
  },
  item: {
    gap: 4,
    alignItems: "center",
  },
  swatch: {
    width: 72,
    height: 48,
    borderRadius: 6,
  },
  box: {
    width: 72,
    height: 48,
    backgroundColor: palette.cardAlt,
  },
  nestedOuter: {
    backgroundColor: palette.purple,
    borderRadius: 12,
    padding: 12,
  },
  nestedMiddle: {
    backgroundColor: palette.accent,
    borderRadius: 10,
    padding: 12,
  },
  nestedInner: {
    backgroundColor: palette.green,
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  nestedLabel: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "700",
  },
})

const Labeled = ({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) => (
  <View style={styles.item}>
    {children}
    <Caption>{label}</Caption>
  </View>
)

export const ViewsSection = () => (
  <Section
    title="Views"
    subtitle="View → GtkFixed: backgroundColor in every color format, borders and corner radii via GTK CSS, opacity, nested containers."
  >
    <DemoCard
      title="backgroundColor"
      hint="the same color in different formats: hex, rgb(), hsl(), named, a PlatformColor-compatible var() string"
    >
      <View style={styles.row}>
        <Labeled label='"#e66100"'>
          <View style={[styles.swatch, { backgroundColor: "#e66100" }]} />
        </Labeled>
        <Labeled label='"rgb(38 162 105)"'>
          <View
            style={[styles.swatch, { backgroundColor: "rgb(38 162 105)" }]}
          />
        </Labeled>
        <Labeled label='"hsl(213 68% 48%)"'>
          <View
            style={[styles.swatch, { backgroundColor: "hsl(213, 68%, 48%)" }]}
          />
        </Labeled>
        <Labeled label='"rebeccapurple"'>
          <View style={[styles.swatch, { backgroundColor: "rebeccapurple" }]} />
        </Labeled>
        <Labeled label='"#ffffff33" (alpha)'>
          <View style={[styles.swatch, { backgroundColor: "#ffffff33" }]} />
        </Labeled>
      </View>
    </DemoCard>

    <DemoCard
      title="opacity"
      hint="a ladder from 1 → 0.15; opacity applies to the widget's entire subtree"
    >
      <View style={styles.row}>
        {[1, 0.7, 0.4, 0.15].map((value) => (
          <Labeled
            key={value}
            label={`opacity: ${value}`}
          >
            <View
              style={[
                styles.swatch,
                { backgroundColor: palette.accent, opacity: value },
              ]}
            />
          </Labeled>
        ))}
      </View>
    </DemoCard>

    <DemoCard
      title="Borders"
      hint="borderWidth/Color as a shorthand and per side; borderStyle: solid | dashed | dotted"
    >
      <View style={styles.row}>
        <Labeled label="borderWidth: 2">
          <View
            style={[
              styles.box,
              { borderWidth: 2, borderColor: palette.orange },
            ]}
          />
        </Labeled>
        <Labeled label="dashed">
          <View
            style={[
              styles.box,
              {
                borderWidth: 2,
                borderColor: palette.green,
                borderStyle: "dashed",
              },
            ]}
          />
        </Labeled>
        <Labeled label="dotted">
          <View
            style={[
              styles.box,
              {
                borderWidth: 2,
                borderColor: palette.accent,
                borderStyle: "dotted",
              },
            ]}
          />
        </Labeled>
        <Labeled label="per-side width">
          <View
            style={[
              styles.box,
              {
                borderColor: palette.text,
                borderTopWidth: 1,
                borderRightWidth: 3,
                borderBottomWidth: 6,
                borderLeftWidth: 1,
              },
            ]}
          />
        </Labeled>
        <Labeled label="per-side color">
          <View
            style={[
              styles.box,
              {
                borderWidth: 3,
                borderTopColor: palette.red,
                borderRightColor: palette.orange,
                borderBottomColor: palette.green,
                borderLeftColor: palette.accent,
              },
            ]}
          />
        </Labeled>
      </View>
    </DemoCard>

    <DemoCard
      title="Corner radii"
      hint="borderRadius shorthand, per-corner radii, a circle from a square"
    >
      <View style={styles.row}>
        <Labeled label="borderRadius: 12">
          <View
            style={[
              styles.box,
              { backgroundColor: palette.purple, borderRadius: 12 },
            ]}
          />
        </Labeled>
        <Labeled label="per-corner">
          <View
            style={[
              styles.box,
              {
                backgroundColor: palette.purple,
                borderTopLeftRadius: 24,
                borderBottomRightRadius: 24,
              },
            ]}
          />
        </Labeled>
        <Labeled label="circle (radius = size/2)">
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: palette.orange,
            }}
          />
        </Labeled>
      </View>
    </DemoCard>

    <DemoCard
      title="pointerEvents"
      hint="an overlay covers the button; none and box-none let the click through (GTK picking: can-target + a contains() override), auto and box-only block it"
    >
      <PointerEventsDemo />
    </DemoCard>

    <DemoCard
      title="Nesting"
      hint="three levels of containers: each View is a GtkFixed with its own CSS class, padding sets the insets via Yoga"
    >
      <View style={styles.nestedOuter}>
        <View style={styles.nestedMiddle}>
          <View style={styles.nestedInner}>
            <Text style={styles.nestedLabel}>outer → middle → inner</Text>
          </View>
        </View>
      </View>
    </DemoCard>
  </Section>
)

const PE_MODES = ["auto", "none", "box-none", "box-only"] as const

const PointerEventsDemo = () => {
  const [mode, setMode] = useState<(typeof PE_MODES)[number]>("none")
  const [presses, setPresses] = useState(0)
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {PE_MODES.map((candidate) => (
          <Pressable
            key={candidate}
            onPress={() => setMode(candidate)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 6,
              backgroundColor:
                candidate === mode ? palette.accent : palette.cardAlt,
            }}
          >
            <Text style={{ color: palette.text, fontSize: 12 }}>
              {candidate}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={{ height: 70 }}>
        <Pressable
          onPress={() => setPresses((value) => value + 1)}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 220,
            height: 44,
            borderRadius: 8,
            backgroundColor: palette.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: palette.text, fontWeight: "700" }}>
            {`press me (${presses})`}
          </Text>
        </Pressable>
        <View
          pointerEvents={mode}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 220,
            height: 44,
            borderRadius: 8,
            backgroundColor: "#f6d32d55",
          }}
        />
      </View>
      <Text style={{ color: palette.textDim, fontSize: 12 }}>
        the yellow overlay sits on top of the button
      </Text>
    </View>
  )
}
