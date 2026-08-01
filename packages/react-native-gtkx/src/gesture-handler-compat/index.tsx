// react-native-gtkx/gesture-handler — `Pan`, `GestureDetector` and the root
// view, reimplemented over this platform's own responder system, and a loud
// refusal for the rest.
//
// NOT A PORT. `docs/research/gestures.md` refused RNGH on four grounds, two of
// which expired when `react-native-gtkx/reanimated` shipped; the other two —
// no `exports` map on `src/web/`, no out-of-tree platform story, and a
// react-native-windows precedent that has been a literal `// NO-OP` since
// 2.8.0 — stand. So this is the third instance of the pattern that has worked
// twice already: reimplement the SEMANTICS behind the package name, take the
// upstream implementation as a blueprint rather than as a dependency. The
// recognizer and its arbitration are the implementation (see ./recognizer,
// ./pan); `Gesture.Pan()` and `usePanGesture()` are two thin spellings over
// it, which is the mistake upstream made and had to undo in 3.1.0.
//
// The root view came first and for its own reason: exactly one RNGH symbol
// appears in apps that do not otherwise use RNGH — `GestureHandlerRootView`.
// Every drag-and-drop app has it at the root, because
// `react-native-reanimated-dnd`'s own quick start puts it there.
//
// WHY it is not a bare passthrough. `GestureHandlerRootView` is a real layout
// box: upstream renders `<View style={style ?? {flex: 1}}>`, so an app that
// leans on that box to fill the screen would collapse without it. Rendering
// only the children would be a simplification, not a shim. See `ROOT_STYLE`.
//
// WHY everything else throws rather than no-oping. docs/research/gestures.md
// records the failure mode this repo most wants to avoid: `Animated.View`
// silently accepting the responder props and ignoring them compiled, ran, and
// did nothing — "the worst possible failure mode". A `PanGestureHandler` that
// renders its children without gestures is the same trap. An unsupported RNGH
// import must fail where it is used, naming itself.
//
// Note on types: this is a BUNDLER alias, so `tsc` never sees it. An app
// keeps `react-native-gesture-handler` in its dependencies for iOS and
// Android, and TypeScript goes on resolving the real package's types from
// node_modules. That is why nothing here mirrors RNGH's ~60 type exports.
import type { ReactNode } from "react"
import { View } from "../components/view"
import type { StyleProp } from "../contracts"
import { createUnsupportedFactory } from "../unsupported-export"
import { Gesture } from "./builder"
import { GestureDetector } from "./detector"
import { usePanGesture } from "./hooks"
import { GESTURE_STATE } from "./types"

export { Gesture, GestureDetector, usePanGesture }
export { PanGestureBuilder } from "./builder"
export type { GestureDetectorProps } from "./detector"
export type { PanGestureHookConfig } from "./hooks"
export type {
  GestureHitSlop,
  GestureSpec,
  GestureStateManagerApi,
  GestureTouchData,
  GestureTouchEvent,
  OffsetBound,
  PanEndEventPayload,
  PanEventPayload,
} from "./types"

/**
 * Upstream's default, and note that it is `style ?? {flex: 1}` rather than
 * `[{flex: 1}, style]`: passing a style REPLACES the flex box, it does not
 * merge with it. Verified against react-native-gesture-handler 3.1.0, where
 * all three implementations (`.tsx`, `.web.tsx`, `.android.tsx`) agree on
 * `<View style={style ?? styles.container} {...rest} />`. The difference is
 * observable — with `style={{height: 100}}` upstream gives a 100px-tall box
 * with no `flex`, and a merged version would give a flexing one.
 */
const ROOT_STYLE = { flex: 1 } as const

export type GestureHandlerRootViewProps = {
  children?: ReactNode
  style?: StyleProp
  testID?: string
}

/**
 * The root box `react-native-gesture-handler` asks apps to put at the top of
 * the tree.
 *
 * Faithful, not merely tolerated. Upstream's does two things: it renders a
 * `flex: 1` `View`, and it marks the subtree as gesture-arbitrating. The
 * first is reproduced exactly. The second is genuinely this platform's job
 * already — RN's own gesture responder system is implemented here on GTK4
 * event controllers (#41), and its lock is global — so there is no context to
 * provide and nothing is being skipped.
 */
export const GestureHandlerRootView = ({
  children,
  style,
  testID,
}: GestureHandlerRootViewProps): ReactNode => (
  <View
    style={style ?? ROOT_STYLE}
    testID={testID}
  >
    {children}
  </View>
)

const unsupported = createUnsupportedFactory(
  "react-native-gesture-handler",
  "Implemented: GestureHandlerRootView, GestureDetector, and Pan in both spellings " +
    "(`Gesture.Pan()` and `usePanGesture()`). Tap, LongPress and `State` are the next slice; " +
    "cross-gesture relations and the composers need the orchestrator; Pinch and Rotation need " +
    "a machine that can produce a touchpad gesture to test them on. RN's own responder system " +
    "and PanResponder also work (docs/api.md); drag-and-drop is react-native-gtkx/dnd.",
)

// Every runtime value `react-native-gesture-handler` 3.1.0 exports, minus
// GestureHandlerRootView above. Enumerated rather than generated by a Proxy
// over the module, because ESM named imports are resolved statically: a
// symbol that is not exported here fails at BUILD time with "no export named
// X", which is loud in its own right — but only the names listed here can
// produce the descriptive runtime message, so the list is worth keeping
// complete.
//
// The `any` is deliberate and load-bearing: an app's `<PanGestureHandler>`
// must still type-check (it type-checks against the REAL package anyway, see
// the note at the top) and fail when it runs, not before.
/* eslint-disable @typescript-eslint/no-explicit-any */

// --- the legacy handler components ---
export const FlingGestureHandler: any = unsupported("FlingGestureHandler")
export const ForceTouchGestureHandler: any = unsupported(
  "ForceTouchGestureHandler",
)
export const LongPressGestureHandler: any = unsupported(
  "LongPressGestureHandler",
)
export const NativeViewGestureHandler: any = unsupported(
  "NativeViewGestureHandler",
)
export const PanGestureHandler: any = unsupported("PanGestureHandler")
export const PinchGestureHandler: any = unsupported("PinchGestureHandler")
export const RotationGestureHandler: any = unsupported("RotationGestureHandler")
export const TapGestureHandler: any = unsupported("TapGestureHandler")
export const legacy_createNativeWrapper: any = unsupported(
  "legacy_createNativeWrapper",
)

// --- the new (v3) gesture API ---
// `Gesture`, `GestureDetector` and `usePanGesture` are re-exported at the top
// of this file. `Gesture` is a real namespace whose eleven unimplemented
// statics throw individually, so `Gesture.Pinch()` still names itself.
export const GestureDetectorType: any = unsupported("GestureDetectorType")
export const GestureStateManager: any = unsupported("GestureStateManager")
export const InterceptingGestureDetector: any = unsupported(
  "InterceptingGestureDetector",
)
export const VirtualGestureDetector: any = unsupported("VirtualGestureDetector")
export const useCompetingGestures: any = unsupported("useCompetingGestures")
export const useExclusiveGestures: any = unsupported("useExclusiveGestures")
export const useFlingGesture: any = unsupported("useFlingGesture")
export const useHoverGesture: any = unsupported("useHoverGesture")
export const useLongPressGesture: any = unsupported("useLongPressGesture")
export const useManualGesture: any = unsupported("useManualGesture")
export const useNativeGesture: any = unsupported("useNativeGesture")
export const usePinchGesture: any = unsupported("usePinchGesture")
export const useRotationGesture: any = unsupported("useRotationGesture")
export const useSimultaneousGestures: any = unsupported(
  "useSimultaneousGestures",
)
export const useTapGesture: any = unsupported("useTapGesture")

// --- enums and constants ---
// These are plain data upstream, so throwing on them looks harsh. It is not:
// they are only meaningful when compared against an event from a handler that
// cannot run here, so `event.nativeEvent.state === State.ACTIVE` is code that
// has already gone wrong by the time it reads the enum. Failing at that line
// beats silently comparing against `undefined`.
//
// `State` is the exception, and the reason it throws expired with this slice:
// `Gesture.Pan()`'s payloads now carry a faithful `state`, so comparing one
// against `State.ACTIVE` is ordinary correct code rather than a symptom.
// `react-native-drawer-layout` does exactly that — it re-exports it as
// `GestureState`, seeds a shared value with `GestureState.UNDETERMINED` and
// tests `=== GestureState.ACTIVE` — and it was the ONLY runtime symbol still
// standing between that library and running here. Six numbers, and the
// alternative was a refusal that no longer described anything true.
export const State = GESTURE_STATE
export const Directions: any = unsupported("Directions")
export const HoverEffect: any = unsupported("HoverEffect")
export const MouseButton: any = unsupported("MouseButton")
export const PointerType: any = unsupported("PointerType")

// --- the wrapped RN components and buttons ---
export const BaseButton: any = unsupported("BaseButton")
export const BorderlessButton: any = unsupported("BorderlessButton")
export const FlatList: any = unsupported("FlatList")
export const Pressable: any = unsupported("Pressable")
export const RawButton: any = unsupported("RawButton")
export const RectButton: any = unsupported("RectButton")
export const RefreshControl: any = unsupported("RefreshControl")
export const ScrollView: any = unsupported("ScrollView")
export const Switch: any = unsupported("Switch")
export const TextInput: any = unsupported("TextInput")
export const Touchable: any = unsupported("Touchable")
export const TouchableHighlight: any = unsupported("TouchableHighlight")
export const TouchableNativeFeedback: any = unsupported(
  "TouchableNativeFeedback",
)
export const TouchableOpacity: any = unsupported("TouchableOpacity")
export const TouchableWithoutFeedback: any = unsupported(
  "TouchableWithoutFeedback",
)

// --- the 2.x legacy aliases, still exported by 3.x ---
export const LegacyBaseButton: any = unsupported("LegacyBaseButton")
export const LegacyBorderlessButton: any = unsupported("LegacyBorderlessButton")
export const LegacyDrawerLayoutAndroid: any = unsupported(
  "LegacyDrawerLayoutAndroid",
)
export const LegacyFlatList: any = unsupported("LegacyFlatList")
export const LegacyPressable: any = unsupported("LegacyPressable")
export const LegacyRawButton: any = unsupported("LegacyRawButton")
export const LegacyRectButton: any = unsupported("LegacyRectButton")
export const LegacyRefreshControl: any = unsupported("LegacyRefreshControl")
export const LegacyScrollView: any = unsupported("LegacyScrollView")
export const LegacySwitch: any = unsupported("LegacySwitch")
export const LegacyText: any = unsupported("LegacyText")
export const LegacyTextInput: any = unsupported("LegacyTextInput")
