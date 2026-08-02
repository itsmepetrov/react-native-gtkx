// Shared gallery building blocks: the palette and self-documenting wrappers.
// react-native API only — like everything under examples/.
import type { ReactNode } from "react"
import { PlatformColor, Pressable, StyleSheet, Text, View } from "react-native"

// Surfaces and text resolve through Adwaita CSS variables (PlatformColor):
// GTK recomputes them when the color scheme flips, so the whole gallery
// follows the HeaderBar theme toggle live — no re-render involved. The
// saturated demo colors are content and stay fixed.
export const palette = {
  window: PlatformColor("window-bg-color"),
  sidebar: PlatformColor("sidebar-bg-color"),
  card: PlatformColor("card-bg-color"),
  cardAlt: PlatformColor("card-shade-color"),
  // An OPAQUE surface, for the one thing a card colour cannot do: float ABOVE
  // other content. Adwaita's `--card-bg-color` is opaque white on the light
  // theme and `rgba(255, 255, 255, 0.08)` on the dark one — an overlay tint
  // meant to sit ON the window background — so a sheet painted with it looks
  // right until it slides over a card, and then the text underneath reads
  // straight through it. `--popover-bg-color` is the variable Adwaita means
  // for surfaces that cover things (#ffffff / #36363a), opaque and distinct
  // from `--window-bg-color` on both schemes; the window colour behind it is
  // the fallback for a runtime that lacks it.
  overlay: PlatformColor("popover-bg-color", "window-bg-color"),
  accent: "#1c71d8",
  accentPressed: "#1a5fb4",
  green: "#26a269",
  orange: "#e66100",
  purple: "#613583",
  yellow: "#f6d32d",
  red: "#c01c28",
  text: PlatformColor("window-fg-color"),
  // Adwaita's own dimmed foreground (libadwaita 1.7+), falling back to the
  // plain foreground where it is missing — degrading to MORE contrast, never
  // less. For labels and legends only: prose gets `text`.
  //
  // These two used to be hand-picked greys (#8f929c / #82858f) chosen to be
  // "readable on both card surfaces", which is the thing a fixed hex cannot
  // do: it can only be right on one of the two themes, and the wrong half of
  // the time it is the unreadable half.
  textDim: PlatformColor("dimmed-fg-color", "window-fg-color"),
  textFaint: PlatformColor("dimmed-fg-color", "window-fg-color"),
  // The amber Adwaita means for TEXT — dark on light, pale on dark.
  // `--warning-bg-color` is the saturated FILL that goes behind
  // `--warning-fg-color`, and using it on type is how warnings end up
  // unreadable on the light theme.
  warning: PlatformColor("warning-color", "@yellow_5"),
  // The other two of the same family, for the same reason: a "this works"
  // green and a "this is refused" red that Adwaita keeps legible on both
  // schemes. These replaced #8ff0a4 and #f66151, which were picked against
  // the dark theme and washed out on the light one.
  success: PlatformColor("success-color", "@green_5"),
  error: PlatformColor("error-color", "@red_4"),
  // A tint rather than a variable: 15% amber reads as a warning surface over
  // either card colour, where a theme fill would have to be paired with its
  // own foreground.
  warningTint: "rgba(229, 165, 10, 0.15)",
  // Text sitting ON a saturated fill (accent buttons, colored chips): always
  // white, whatever the scheme — the fill itself does not change.
  onColor: "#ffffff",
} as const

const styles = StyleSheet.create({
  section: {
    padding: 16,
    gap: 14,
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "700",
  },
  sectionSubtitle: {
    color: palette.textFaint,
    fontSize: 13,
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  // A card sized to SHARE a row rather than own one. The basis is what it
  // asks for and flexGrow shares the remainder, so the same grid is four
  // across on a wide window and two on a narrow one, with no measurement.
  cardInGrid: {
    flexBasis: 220,
    flexGrow: 1,
  },
  cardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: 12,
  },
  status: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "700",
  },
  cardTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
  },
  cardHint: {
    color: palette.textFaint,
    fontSize: 12,
  },
  caption: {
    color: palette.textDim,
    fontSize: 12,
  },
  // Prose captions carry the reasoning a screenshot cannot, so they get the
  // foreground colour and a line height rather than being dimmed small print.
  prose: {
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
})

// Section screen: title + subtitle describing what is being demonstrated.
export const Section = ({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    {children}
  </View>
)

// A single demo card: the case title and an optional hint. `grid` sizes it to
// share a row inside a `CardGrid` instead of taking the full width.
export const DemoCard = ({
  title,
  hint,
  grid,
  children,
}: {
  title: string
  hint?: string
  grid?: boolean
  children: ReactNode
}) => (
  <View style={[styles.card, grid && styles.cardInGrid]}>
    <Text style={styles.cardTitle}>{title}</Text>
    {hint ? <Text style={styles.cardHint}>{hint}</Text> : null}
    {children}
  </View>
)

/**
 * A wrapping row of `DemoCard grid` cards — for sections whose cases are
 * meant to be compared side by side and seen in one go rather than scrolled.
 */
export const CardGrid = ({ children }: { children: ReactNode }) => (
  <View style={styles.cardGrid}>{children}</View>
)

/** The live line a demo writes its current state into. */
export const Status = ({ children }: { children: ReactNode }) => (
  <Text style={styles.status}>{children}</Text>
)

// Small caption under a specific variant inside a card.
export const Caption = ({ children }: { children: ReactNode }) => (
  <Text style={styles.caption}>{children}</Text>
)

/**
 * A caption a reader is meant to READ rather than glance at — the sentence
 * that says what a demo just proved. Foreground colour and a line height,
 * because dimmed 12 px is for labels.
 */
export const Prose = ({ children }: { children: ReactNode }) => (
  <Text style={styles.prose}>{children}</Text>
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
