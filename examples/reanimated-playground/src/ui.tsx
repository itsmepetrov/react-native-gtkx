// Shared chrome for the panels: the palette and the four wrappers every
// panel is built out of. Plain react-native, like every other file here.
import type { ReactNode } from "react"
import { PlatformColor, Pressable, StyleSheet, Text, View } from "react-native"

// Surfaces and text resolve through Adwaita CSS variables (PlatformColor), so
// the whole app follows the desktop's light/dark setting without a render.
// The saturated demo colours are content and stay fixed — a panel about
// interpolating between two colours must not have them move under it.
//
// Nothing a reader has to READ is a hand-picked grey. A fixed hex can only be
// right on one of the two themes, and the wrong half of the time it is the
// unreadable half; every text colour below is a theme variable that Adwaita
// keeps legible on both.
export const palette = {
  window: PlatformColor("window-bg-color"),
  card: PlatformColor("card-bg-color"),
  cardAlt: PlatformColor("card-shade-color"),
  text: PlatformColor("window-fg-color"),
  // Adwaita's own dimmed foreground (libadwaita 1.7+), falling back to the
  // plain foreground where it is missing — degrading to MORE contrast, never
  // less. For labels and legends only: prose is `text`.
  textDim: PlatformColor("dimmed-fg-color", "window-fg-color"),
  // The amber Adwaita means for TEXT — dark on light, pale on dark.
  // `--warning-bg-color` is the saturated FILL that goes behind
  // `--warning-fg-color`, and using it on type is how the warnings ended up
  // unreadable on the light theme.
  warning: PlatformColor("warning-color", "@yellow_5"),
  // A tint rather than a variable: 15% amber reads as a warning surface over
  // either card colour, where a theme fill would have to be paired with its
  // own foreground.
  warningTint: "rgba(229, 165, 10, 0.15)",
  accent: "#1c71d8",
  accentPressed: "#1a5fb4",
  green: "#26a269",
  orange: "#e66100",
  purple: "#813d9c",
  red: "#c01c28",
  yellow: "#f6d32d",
  onColor: "#ffffff",
} as const

const styles = StyleSheet.create({
  panel: {
    backgroundColor: palette.card,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  panelHeader: {
    gap: 4,
  },
  panelIndex: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "700",
  },
  panelTitle: {
    color: palette.text,
    fontSize: 19,
    fontWeight: "700",
  },
  panelSubtitle: {
    color: palette.textDim,
    fontSize: 13,
    lineHeight: 19,
  },
  // Captions are the prose of this app, so they get the foreground colour and
  // a line height rather than being dimmed small print. Keeping them readable
  // is only half of it — there are few enough of them now to read.
  caption: {
    color: palette.text,
    fontSize: 13,
    lineHeight: 19,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  button: {
    backgroundColor: palette.accent,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  buttonPressed: {
    backgroundColor: palette.accentPressed,
  },
  buttonQuiet: {
    backgroundColor: palette.cardAlt,
  },
  buttonText: {
    color: palette.onColor,
    fontSize: 13,
    fontWeight: "700",
  },
  buttonTextQuiet: {
    color: palette.text,
  },
  stat: {
    minWidth: 128,
    backgroundColor: palette.cardAlt,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 2,
  },
  statLabel: {
    color: palette.textDim,
    fontSize: 11,
  },
  statValue: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "700",
  },
  statValueLoud: {
    color: palette.green,
  },
  track: {
    height: 96,
    backgroundColor: palette.cardAlt,
    borderRadius: 10,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
})

/** One numbered panel of the playground. */
export const Panel = ({
  index,
  title,
  subtitle,
  children,
}: {
  index: string
  title: string
  subtitle: string
  children: ReactNode
}) => (
  <View style={styles.panel}>
    <View style={styles.panelHeader}>
      <Text style={styles.panelIndex}>{index}</Text>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelSubtitle}>{subtitle}</Text>
    </View>
    {children}
  </View>
)

/** Small print under a demo, for the things a screenshot cannot say. */
export const Caption = ({ children }: { children: ReactNode }) => (
  <Text style={styles.caption}>{children}</Text>
)

/** A wrapping row — usually a strip of buttons. */
export const Row = ({ children }: { children: ReactNode }) => (
  <View style={styles.row}>{children}</View>
)

export const Button = ({
  label,
  quiet,
  onPress,
}: {
  label: string
  quiet?: boolean
  onPress: () => void
}) => (
  <Pressable
    style={({ pressed }) => [
      styles.button,
      quiet && styles.buttonQuiet,
      pressed && styles.buttonPressed,
    ]}
    onPress={onPress}
  >
    <Text style={[styles.buttonText, quiet && styles.buttonTextQuiet]}>
      {label}
    </Text>
  </Pressable>
)

/** A big number with a label — the readouts the counters live in. */
export const Stat = ({
  label,
  value,
  loud,
}: {
  label: string
  value: string
  loud?: boolean
}) => (
  <View style={styles.stat}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={[styles.statValue, loud && styles.statValueLoud]}>
      {value}
    </Text>
  </View>
)

/** The shaded lane a demo box moves along. */
export const Track = ({
  children,
  onWidth,
}: {
  children: ReactNode
  onWidth?: (width: number) => void
}) => (
  <View
    style={styles.track}
    onLayout={
      onWidth ? (event) => onWidth(event.nativeEvent.layout.width) : undefined
    }
  >
    {children}
  </View>
)
