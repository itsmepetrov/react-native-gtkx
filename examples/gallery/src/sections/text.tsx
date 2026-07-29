// Text: sizes and weights, textAlign, numberOfLines/wrapping, lineHeight,
// letterSpacing, PlatformColor. Honest v1 limitation: nested Text spans with
// their own styles are not supported — children are flattened into one string.
import { PlatformColor, StyleSheet, Text, View } from "react-native"
import { Caption, DemoCard, palette, Section } from "../ui"

const LOREM =
  "Pango measures this paragraph for Yoga: line breaks land exactly where " +
  "the layout engine computed the width, and GtkLabel merely renders the result."

const styles = StyleSheet.create({
  base: {
    color: palette.text,
  },
  dim: {
    color: palette.textDim,
    fontSize: 13,
  },
  alignBox: {
    backgroundColor: palette.cardAlt,
    borderRadius: 6,
    padding: 8,
    gap: 6,
  },
})

export const TextSection = () => (
  <Section
    title="Text"
    subtitle="GtkLabel with Pango metrics: typography via styles, alignment, numberOfLines truncation. Nested styled spans are not supported in v1 (children are flattened into one string)."
  >
    <DemoCard
      title="fontSize"
      hint="12 / 16 / 22 / 28 px"
    >
      {[12, 16, 22, 28].map((size) => (
        <Text
          key={size}
          style={[styles.base, { fontSize: size }]}
        >
          fontSize: {size} — The quick brown fox jumps over the lazy dog
        </Text>
      ))}
    </DemoCard>

    <DemoCard
      title="fontWeight and fontStyle"
      hint='keywords and numeric strings "100"–"900"; italics via fontStyle'
    >
      <Text style={[styles.base, { fontWeight: "300" }]}>
        fontWeight: “300” — light
      </Text>
      <Text style={styles.base}>fontWeight: normal (default)</Text>
      <Text style={[styles.base, { fontWeight: "600" }]}>
        fontWeight: “600” — semibold
      </Text>
      <Text style={[styles.base, { fontWeight: "bold" }]}>
        fontWeight: “bold”
      </Text>
      <Text style={[styles.base, { fontStyle: "italic" }]}>
        fontStyle: “italic”
      </Text>
      <Text style={[styles.base, { fontFamily: "Monospace", fontSize: 13 }]}>
        fontFamily: “Monospace”
      </Text>
    </DemoCard>

    <DemoCard
      title="textAlign"
      hint="left / center / right / justify — xalign + justification on GtkLabel, not CSS"
    >
      <View style={styles.alignBox}>
        <Text style={[styles.base, { textAlign: "left" }]}>
          textAlign: left
        </Text>
        <Text style={[styles.base, { textAlign: "center" }]}>
          textAlign: center
        </Text>
        <Text style={[styles.base, { textAlign: "right" }]}>
          textAlign: right
        </Text>
        <Text style={[styles.dim, { textAlign: "justify" }]}>
          textAlign: justify — {LOREM}
        </Text>
      </View>
    </DemoCard>

    <DemoCard
      title="numberOfLines and wrapping"
      hint="with no limit the text wraps to the width; with numberOfLines an ellipsis ends the last line"
    >
      <Caption>No limit (wraps to the card width):</Caption>
      <Text style={styles.dim}>{LOREM}</Text>
      <Caption>numberOfLines: 1</Caption>
      <Text
        style={styles.dim}
        numberOfLines={1}
      >
        {LOREM}
      </Text>
      <Caption>numberOfLines: 2</Caption>
      <Text
        style={styles.dim}
        numberOfLines={2}
      >
        {LOREM} {LOREM}
      </Text>
    </DemoCard>

    <DemoCard
      title="lineHeight and letterSpacing"
      hint="line-height in px (GTK ≥ 4.6); letter-spacing in px"
    >
      <Caption>lineHeight: 16 (tight):</Caption>
      <Text style={[styles.dim, { lineHeight: 16 }]}>{LOREM}</Text>
      <Caption>lineHeight: 26 (loose):</Caption>
      <Text style={[styles.dim, { lineHeight: 26 }]}>{LOREM}</Text>
      <Caption>letterSpacing: 3</Caption>
      <Text style={[styles.base, { letterSpacing: 3 }]}>
        S P A C E D letters via letterSpacing
      </Text>
    </DemoCard>

    <DemoCard
      title="PlatformColor"
      hint='PlatformColor("accent-fg-color", "@blue_3") → var(--accent-fg-color, @blue_3): the color comes from the Adwaita theme'
    >
      <Text
        style={{
          color: PlatformColor("accent-fg-color", "@blue_3"),
          fontWeight: "700",
        }}
      >
        This text is painted with the accent color of the current theme
      </Text>
      <Text style={{ color: PlatformColor("success-color", "@green_3") }}>
        And this one is success-color with a fallback to @green_3
      </Text>
    </DemoCard>

    <DemoCard
      title="Flat concatenation of children"
      hint="Text children are joined into a single string; nested span styles are ignored in v1 — an honest limitation"
    >
      <Text style={styles.base}>
        Number: {42}, string: {"from an expression"}, all of it is one GtkLabel.
      </Text>
    </DemoCard>
  </Section>
)
