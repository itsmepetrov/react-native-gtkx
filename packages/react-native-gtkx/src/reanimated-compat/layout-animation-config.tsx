// `<LayoutAnimationConfig>`: turning entering and exiting animations off for a
// subtree, and `enableLayoutAnimations`.
//
// Both halves are ordinary React here, where upstream needs the native side
// for one of them. `skipEntering` is a context whose ref is true for exactly
// one commit — children mounted WITH the wrapper read it from their layout
// effect and skip; children mounted later find it already false. `skipExiting`
// is the same trick backwards: React runs a deleted subtree's layout-effect
// cleanups from the OUTSIDE IN, so this component's own cleanup runs before
// any of its descendants' and can tell them, through the same context, that
// the whole subtree is going. Upstream reaches for `findNodeHandle` plus
// `setShouldAnimateExitingForTag` for that second half only because its
// exiting animations are configured on the native shadow node, one commit
// earlier than the information exists; nothing here is configured that early.
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"

export type LayoutAnimationSkip = {
  /** True for the one commit a `skipEntering` wrapper mounts in. */
  entering: RefObject<boolean>
  /** True once a `skipExiting` wrapper has begun unmounting. */
  exiting: RefObject<boolean>
}

const LayoutAnimationSkipContext = createContext<LayoutAnimationSkip | null>(
  null,
)

/** @internal Read by `withLayoutAnimations`; not part of upstream's surface. */
export const useLayoutAnimationSkip = (): LayoutAnimationSkip | null =>
  useContext(LayoutAnimationSkipContext)

export type LayoutAnimationConfigProps = {
  /** Suppresses the `entering` of children that mount with this wrapper. */
  skipEntering?: boolean
  /** Suppresses the `exiting` of children when this wrapper unmounts. */
  skipExiting?: boolean
  children?: ReactNode
}

/**
 * Suppresses `entering` and/or `exiting` for the subtree below it.
 *
 * The classic use is a screen that mounts with a list already populated: the
 * rows should animate when they are ADDED, not when the screen appears.
 *
 * ```tsx
 * <LayoutAnimationConfig skipEntering>
 *   {items.map((item) => (
 *     <Animated.View key={item.id} entering={FadeIn} />
 *   ))}
 * </LayoutAnimationConfig>
 * ```
 *
 * Adds no widget to the tree — it renders its children and nothing else.
 */
export const LayoutAnimationConfig = ({
  skipEntering,
  skipExiting,
  children,
}: LayoutAnimationConfigProps): ReactNode => {
  const entering = useRef(skipEntering ?? false)
  const exiting = useRef(false)
  // A passive effect, deliberately: every layout effect in the mounting
  // commit — which is where a child's `entering` starts — has already run by
  // the time this fires, so the flag covers that commit and no other.
  useEffect(() => {
    entering.current = false
  })
  useLayoutEffect(() => {
    return () => {
      if (skipExiting) {
        exiting.current = true
      }
    }
  }, [skipExiting])
  // `useState` rather than `useRef` for the context VALUE: it has to be
  // stable (a new object would remount every consumer's effects) and it has
  // to be readable during render, and a ref is only the first of those.
  const [skip] = useState<LayoutAnimationSkip>(() => ({ entering, exiting }))
  return (
    <LayoutAnimationSkipContext value={skip}>
      {children}
    </LayoutAnimationSkipContext>
  )
}

let warnedAboutEnable = false

/**
 * Deprecated upstream, where it warns and does nothing — the allow-list it
 * used to write to is gone from Reanimated itself. Mirrored exactly: refusing
 * would break startup code calling it for a setting that changes nothing on
 * any platform, and honouring it would be inventing behaviour upstream
 * removed. Use {@link LayoutAnimationConfig} to actually skip animations.
 */
export const enableLayoutAnimations = (): void => {
  const isProduction =
    typeof process !== "undefined" && process.env.NODE_ENV === "production"
  if (warnedAboutEnable || isProduction) {
    return
  }
  warnedAboutEnable = true
  console.warn(
    "`enableLayoutAnimations` is deprecated and will be removed in the future.",
  )
}

/** @internal Test seam: the deprecation warning is once per session. */
export const resetEnableLayoutAnimationsWarning = (): void => {
  warnedAboutEnable = false
}
