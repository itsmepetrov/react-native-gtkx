// The two screens that could NOT be ported keep their route and say so here,
// rather than quietly disappearing from the menu.
//
// That choice is the point of this file. `react-native-gtkx/dnd` mirrors
// `react-native-reanimated-dnd`'s API, and a mirror that silently omits part
// of it is worse than one that is loudly incomplete — an app discovers the
// hole when a screen does nothing, instead of when it reads the menu. The
// module itself takes the same line: importing `SortableGrid` fails at build
// time, and `SortableDirection.Horizontal` throws rather than laying out
// vertically (packages/react-native-gtkx/src/dnd/sortable.tsx).
import { StyleSheet, Text, View } from "react-native"
import { colors, fonts, radii, spacing } from "../theme"

export function NotImplementedNotice({
  what,
  detail,
}: {
  what: string
  detail: string
}) {
  return (
    <View style={styles.banner}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>NOT IMPLEMENTED ON LINUX</Text>
      </View>
      <Text style={styles.title}>{what}</Text>
      <Text style={styles.detail}>{detail}</Text>
      <Text style={styles.footnote}>
        Everything below is upstream&apos;s own content for this screen,
        rendered but not draggable — so the screen shows what is missing instead
        of pretending it is here. See docs/api.md, &ldquo;Differences from
        react-native-reanimated-dnd&rdquo;.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: spacing.sm,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: fonts.bodyBold,
    color: colors.bg,
    letterSpacing: 1,
  },
  title: {
    fontSize: 17,
    fontFamily: fonts.displayBold,
    color: colors.textPrimary,
  },
  detail: {
    fontSize: 14,
    fontFamily: fonts.bodyRegular,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  footnote: {
    fontSize: 12,
    fontFamily: fonts.bodyRegular,
    color: colors.textMuted,
    lineHeight: 17,
  },
})
