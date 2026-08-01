// PORTED from react-native-reanimated-dnd's example app (MIT).
//
// **This is the one file in the port that had to be rewritten rather than
// edited, and it is worth being precise about why: none of it is
// drag-and-drop.** Upstream's toast is a Reanimated component with an RNGH
// swipe gesture — `useSharedValue` ×5, two `useAnimatedStyle`s, a
// `"worklet"`-annotated dismiss, and `Gesture.Pan()` in a
// `GestureDetector`. `docs/research/drag-and-drop.md` lists exactly this
// under "honest gaps": the preset alias replaces the DnD library, not
// Reanimated, and an app that reaches for Reanimated directly still has
// work to do.
//
// So the rewrite is the gap made visible, and what it costs is measurable:
// the same three behaviours (a stack that shuffles up, swipe-left to
// dismiss, autodismiss after 2.5s) on this platform's own gesture surface —
// `PanResponder` and `Animated`, which is what
// `docs/research/gestures.md` decided instead of RNGH.
//
// What changed, line for line:
//   useSharedValue        → Animated.Value
//   useAnimatedStyle      → the style array on Animated.View directly
//   withSpring/withTiming → Animated.spring / Animated.timing
//   Gesture.Pan()         → PanResponder.create
//   GestureDetector       → {...panResponder.panHandlers} on the view
//   runOnJS(onDismiss)    → onDismiss, because there is one runtime here
//
// One behaviour is genuinely gone rather than translated: upstream animates
// `bottom` (a layout property) from a worklet. `Animated` here drives
// `opacity` and `transform` only, which is RN's own documented set for the
// non-native driver too — so the stack offset is a `translateY` instead.
// The toast looks the same and the code says what it means.
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  useWindowDimensions,
} from "react-native"
import { useInternalToast } from "./hooks"

type ToastProps = {
  index: number
  toastKey: string
  onDismiss: (toastId: number) => void
}

const ToastOffset = 20
const BaseSafeArea = 54

const Toast = ({ toastKey, onDismiss }: ToastProps) => {
  const { width: windowWidth } = useWindowDimensions()
  const toast = useInternalToast(toastKey)

  const isActiveToast = toast?.id === 0
  const toastId = toast?.id ?? 0

  // Upstream's shared values, as Animated.Values. `lift` is the stack offset
  // (upstream animates `bottom`; see the header note), `slide` is the swipe,
  // `scale` and `fade` are the depth cues for the toasts underneath.
  const [lift] = useState(() => new Animated.Value(0))
  const [slide] = useState(() => new Animated.Value(0))
  const [scale] = useState(() => new Animated.Value(1))
  const [fade] = useState(() => new Animated.Value(1))

  const dismissItem = useCallback(() => {
    Animated.timing(slide, {
      toValue: -windowWidth,
      duration: 200,
    }).start(({ finished }) => {
      if (finished) {
        onDismiss(toastId)
      }
    })
  }, [onDismiss, slide, toastId, windowWidth])

  // The whole stack shuffles whenever this toast's depth changes — upstream's
  // `useEffect` on `toast?.id`, spring for spring.
  useEffect(() => {
    Animated.spring(lift, { toValue: -(toastId * ToastOffset) }).start()
    Animated.timing(scale, {
      toValue: 1 - toastId * 0.05,
      duration: 200,
    }).start()
    Animated.timing(fade, {
      toValue: toastId <= 1 ? 1 : 0,
      duration: 200,
    }).start()
  }, [toastId, lift, scale, fade])

  useEffect(() => {
    if (!toast?.autodismiss || !isActiveToast) {
      return
    }
    const timeout = setTimeout(() => {
      dismissItem()
    }, 2500)
    return () => clearTimeout(timeout)
  }, [dismissItem, isActiveToast, toast?.autodismiss])

  // Upstream's `Gesture.Pan().enabled(isActiveToast)` — only the front toast
  // is swipeable, leftwards only, and past 50px it goes.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          isActiveToast && Math.abs(gesture.dx) > 4,
        onPanResponderMove: (_event, gesture) => {
          if (gesture.dx > 0) {
            return
          }
          slide.setValue(gesture.dx)
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx < -50) {
            dismissItem()
          } else {
            Animated.spring(slide, { toValue: 0 }).start()
          }
        },
      }),
    [dismissItem, isActiveToast, slide],
  )

  if (!toast) {
    return null
  }

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        {
          width: windowWidth * 0.9,
          left: windowWidth * 0.05,
          bottom: BaseSafeArea,
        },
        styles.container,
        {
          transform: [
            { translateY: lift },
            { translateX: slide },
            { scale: scale },
          ],
        },
      ]}
    >
      <Animated.View style={[styles.textContainer, { opacity: fade }]}>
        <Animated.View style={styles.columnCenter}>
          <Text style={styles.title}>{toast.title}</Text>
          {toast.subtitle && (
            <Text style={styles.subtitle}>{toast.subtitle}</Text>
          )}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1E2030",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2A2D3A",
    paddingHorizontal: 24,
    paddingVertical: 14,
    position: "absolute",
    boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.6)",
  },
  textContainer: {
    alignItems: "flex-start",
    justifyContent: "center",
  },
  columnCenter: {
    flexDirection: "column",
    justifyContent: "center",
  },
  title: {
    color: "#FF3B30",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    marginTop: 3,
  },
})

export { Toast }
