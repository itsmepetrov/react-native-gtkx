// Shared gallery building blocks: the palette and self-documenting wrappers.
// react-native API only — like everything under examples/.
import type { ReactNode } from "react"
import { PlatformColor, StyleSheet, Text, View } from "react-native"

// Surfaces and text resolve through Adwaita CSS variables (PlatformColor):
// GTK recomputes them when the color scheme flips, so the whole gallery
// follows the HeaderBar theme toggle live — no re-render involved. The
// saturated demo colors are content and stay fixed.
export const palette = {
  window: PlatformColor("window-bg-color"),
  sidebar: PlatformColor("sidebar-bg-color"),
  card: PlatformColor("card-bg-color"),
  cardAlt: PlatformColor("card-shade-color"),
  accent: "#1c71d8",
  accentPressed: "#1a5fb4",
  green: "#26a269",
  orange: "#e66100",
  purple: "#613583",
  yellow: "#f6d32d",
  red: "#c01c28",
  text: PlatformColor("window-fg-color"),
  // No dim/faint Adwaita variables exist — neutral grays picked to stay
  // readable on both card surfaces.
  textDim: "#8f929c",
  textFaint: "#82858f",
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

// A single demo card: the case title and an optional hint.
export const DemoCard = ({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) => (
  <View style={styles.card}>
    <Text style={styles.cardTitle}>{title}</Text>
    {hint ? <Text style={styles.cardHint}>{hint}</Text> : null}
    {children}
  </View>
)

// Small caption under a specific variant inside a card.
export const Caption = ({ children }: { children: ReactNode }) => (
  <Text style={styles.caption}>{children}</Text>
)
