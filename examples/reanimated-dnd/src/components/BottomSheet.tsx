// PORTED from react-native-reanimated-dnd's example app (MIT).
//
// Rewritten off Reanimated for the same reason as toast.tsx, and it is again
// not drag-and-drop: upstream drives this sheet with `useSharedValue`,
// `useDerivedValue` and two `useAnimatedStyle`s. The translation is
// mechanical — `withSpring` → `Animated.spring`, the derived progress → one
// `Animated.Value` the two styles interpolate from — and the styles below
// are byte-for-byte upstream's.
//
// One measurement upstream needs and this does not: it reads the sheet's own
// height in `onLayout` to know how far off-screen to park it. `translateY`
// as a percentage is not a thing in RN, so that stays — the layout callback
// feeds the same number into `Animated.Value`.
import { useEffect, useState, type ReactNode } from "react"
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native"
import { colors, fonts } from "../theme"

interface BottomSheetProps {
  isVisible: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function BottomSheet({
  isVisible,
  onClose,
  title,
  children,
}: BottomSheetProps) {
  const [height, setHeight] = useState(420)
  // Upstream's `progress`: 0 shown, 1 hidden. One value, both styles.
  const [progress] = useState(() => new Animated.Value(1))

  useEffect(() => {
    Animated.spring(progress, { toValue: isVisible ? 0 : 1 }).start()
  }, [isVisible, progress])

  const hiddenOffset = height + 60
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, hiddenOffset],
  })
  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  })

  // `pointerEvents` is a `View` prop here but NOT an `Animated.View` one —
  // RN's `Animated.View` takes every `View` prop, this platform's takes the
  // responder props, `style`, `onLayout` and `testID`. Found by this port and
  // recorded in the PR; the workaround is the plain `View` around each
  // animated one, which is where the prop goes.
  return (
    <>
      <View
        pointerEvents={isVisible ? "auto" : "none"}
        style={styles.backdropHost}
      >
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <TouchableOpacity
            style={styles.backdropTouchable}
            onPress={onClose}
          />
        </Animated.View>
      </View>
      <View
        pointerEvents={isVisible ? "auto" : "none"}
        style={styles.sheetHost}
      >
        <Animated.View
          onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
          style={[styles.sheet, { transform: [{ translateY }] }]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.content}>{children}</ScrollView>
        </Animated.View>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  backdropHost: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  backdropTouchable: {
    flex: 1,
  },
  sheetHost: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "90%",
  },
  sheet: {
    backgroundColor: colors.surface,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    width: "100%",
    marginBottom: Platform.OS === "android" ? -72 : 0,
    borderTopRightRadius: 20,
    borderTopLeftRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.glassBorder,
    boxShadow: "0px -4px 24px rgba(0, 0, 0, 0.5)",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    alignSelf: "center",
    marginBottom: 15,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.displayBold,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  closeButton: {
    justifyContent: "center",
    alignItems: "center",
  },
  closeText: {
    fontSize: 14,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    width: 36,
    height: 36,
    textAlign: "center",
    lineHeight: 36,
    color: colors.textSecondary,
    fontWeight: "600",
    overflow: "hidden",
  },
  content: {
    maxHeight: "80%",
  },
})
