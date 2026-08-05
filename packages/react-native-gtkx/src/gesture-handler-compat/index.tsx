// react-native-gtkx/gesture-handler — all ten recognizers, `GestureDetector`,
// the relations and the root view, reimplemented over this platform's own
// responder system, and a loud refusal for what is left.
//
// WHAT IS LEFT is now a short and deliberate list rather than a backlog: the
// RNGH 1.x component API, the native button family, and three exports refused
// for reasons that are each their own rather than one shared excuse. Each
// carries its reason where it is declared below and in docs/api.md, because a
// refusal that does not say why is indistinguishable from one nobody has
// revisited — which is exactly what happened to `Gesture.Hover()`, refused for
// a year on a judgement about the test rig that turned out to be wrong, and to
// `GestureStateManager`, refused for a process-wide handler-tag registry this
// platform did not keep — reversed 2026-08-05 once react-native-sortables'
// real v3 adapter turned out to reach for exactly that. ./tag-registry is what
// changed; see it and ./gesture-state-manager for the how, and docs/api.md for
// the why.
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
import { GestureStateManager } from "./gesture-state-manager"
import {
  useCompetingGestures,
  useExclusiveGestures,
  useFlingGesture,
  useHoverGesture,
  useLongPressGesture,
  useManualGesture,
  useNativeGesture,
  usePanGesture,
  usePinchGesture,
  useRotationGesture,
  useSimultaneousGestures,
  useTapGesture,
} from "./hooks"
import {
  DIRECTIONS,
  GESTURE_STATE,
  HOVER_EFFECT,
  MOUSE_BUTTON,
  POINTER_TYPE,
} from "./types"

export {
  Gesture,
  GestureDetector,
  GestureStateManager,
  useCompetingGestures,
  useExclusiveGestures,
  useFlingGesture,
  useHoverGesture,
  useLongPressGesture,
  useManualGesture,
  useNativeGesture,
  usePanGesture,
  usePinchGesture,
  useRotationGesture,
  useSimultaneousGestures,
  useTapGesture,
}
export {
  FlingGestureBuilder,
  ForceTouchGestureBuilder,
  HoverGestureBuilder,
  LongPressGestureBuilder,
  ManualGestureBuilder,
  NativeGestureBuilder,
  PanGestureBuilder,
  PinchGestureBuilder,
  RotationGestureBuilder,
  TapGestureBuilder,
} from "./builder"
export type { GestureDetectorProps } from "./detector"
export type {
  FlingGestureHookConfig,
  HoverGestureHookConfig,
  LongPressGestureHookConfig,
  ManualGestureHookConfig,
  NativeGestureHookConfig,
  PanGestureHookConfig,
  TapGestureHookConfig,
} from "./hooks"
export type {
  AnyGestureSpec,
  ComposedGestureKind,
  ComposedGestureSpec,
  GestureEndEventPayload,
  GestureEventPayload,
  GestureHitSlop,
  GestureKind,
  GestureRef,
  GestureRelations,
  GestureSpec,
  GestureStateManagerApi,
  GestureTouchData,
  GestureTouchEvent,
  OffsetBound,
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
  "Implemented: GestureHandlerRootView, GestureDetector, GestureStateManager, `State`, " +
    "`Directions`, `HoverEffect`, the re-exported ScrollView/FlatList/TextInput/Switch and the " +
    "three Touchables, and ALL TEN recognizers — Pan, Tap, LongPress, Native, Pinch, Rotation, " +
    "Fling, Manual, Hover and ForceTouch — in both spellings where upstream has two " +
    "(`Gesture.Pan()` and `usePanGesture()`, and so on), plus the three cross-gesture relations " +
    "and the three composers. Three of them need input a mouse cannot produce: Pinch and " +
    "Rotation need a TOUCHPAD (GtkGestureZoom/GtkGestureRotate) and ForceTouch needs a " +
    "pressure-reporting STYLUS (GtkGestureStylus). RN's own responder system and PanResponder " +
    "also work (docs/api.md); drag-and-drop is react-native-gtkx/dnd.",
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
//
// ALL NINE STAY REFUSED, and now that every recognizer behind them is
// implemented the reason is worth stating precisely rather than leaving as a
// bare `unsupported()`: these are not gestures, they are the RNGH **1.x
// component API** — `<PanGestureHandler onGestureEvent={...}><View/></PanGestureHandler>`
// — which upstream deprecated years before it deprecated the builder, and
// which every one of the four libraries this epic targets has already
// migrated off. Reimplementing them would mean a second public surface over
// the same recognizers, with its own `onGestureEvent`/`onHandlerStateChange`
// event shape, its own `enabled`/`waitFor` prop plumbing and its own
// `createHandler` HOC — for zero measured consumers and a spelling upstream is
// removing. `Gesture.Pan()` and `usePanGesture()` are the two spellings that
// exist here, which is one more than upstream is keeping.
//
// The message each throws names itself, so an app on the old API is told which
// symbol to migrate rather than left with a missing export.
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
// `createNativeWrapper(Component, config)` attaches a `NativeViewGestureHandler`
// to an arbitrary RN component. On this platform the responder system IS the
// arbitration that wrapper registers with, every component this package ships
// already speaks it, and `Gesture.Native()` is how a gesture is declared over
// one explicitly — so the wrapper has nothing to add and would be a no-op
// dressed as a feature. The re-exported ScrollView/FlatList/Touchables below
// are that reasoning applied to the components upstream wraps itself.
export const legacy_createNativeWrapper: any = unsupported(
  "legacy_createNativeWrapper",
)

// --- the new (v3) gesture API ---
// `Gesture`, `GestureDetector`, `GestureStateManager`, the nine gesture hooks
// and the three composer hooks are re-exported at the top of this file.
// `Gesture` is a real namespace and none of its statics throws any more.
//
// `GestureStateManager` used to be refused here, for a global tag→handler
// registry this platform deliberately did not keep — identity was the
// mounted detector, and ./relations resolved an app's gesture object to a
// tag lazily precisely so nothing had to be looked up in a process-wide map.
// Reversed 2026-08-05: react-native-sortables' real v3 gesture-handler
// adapter calls the standalone `GestureStateManager.activate(handlerTag)`
// from its own `onTouchesMove`, on every ordinary drag, reading only the
// numeric tag off the event — no lazy path was available to it. ./tag-registry
// is the registry that reversal needed; ./gesture-state-manager is the export
// built on it. Full account: docs/api.md, docs/research/upstream-libraries.md
// ("Wall 4, confirmed").
//
// The three below stay refused, for three different reasons, none of them
// "not got round to it":
//
//   - `GestureDetectorType` is a TYPE upstream, not a value. It only ever
//     appears in a type position, where this module is not in the path at all
//     (the alias is a BUNDLER alias; `tsc` resolves the real package's types
//     from node_modules — see the note at the top of this file). A runtime
//     value under that name could only be reached by code that has already
//     gone wrong;
//   - `InterceptingGestureDetector` intercepts events destined for views
//     BELOW it, which on this platform would mean claiming a GTK sequence
//     before deciding — and `CLAIMED` is irrevocable here, so the "intercept,
//     look, maybe give it back" shape is not expressible;
//   - `VirtualGestureDetector` drives a gesture with no view at all. The tag
//     registry above answers "which recognizer does this number mean", not
//     "mint a recognizer with nothing to measure, no bounds and no widget to
//     attach a controller to" — every recognizer here is still built by a
//     mounted `GestureDetector` wrapping exactly one child, and giving it none
//     is a structural feature this reversal did not add.
export const GestureDetectorType: any = unsupported("GestureDetectorType")
export const InterceptingGestureDetector: any = unsupported(
  "InterceptingGestureDetector",
)
export const VirtualGestureDetector: any = unsupported("VirtualGestureDetector")

// --- enums and constants ---
//
// ALL FIVE ARE NOW DATA, and the last four changed here. The old rule was that
// an enum is only meaningful next to a handler that can run, so reading one
// was already a symptom — and that rule was right when six of the ten
// recognizers threw. It stopped describing anything true when the last four
// shipped, and the honest test is now the plain one: does an app comparing
// against this constant get a correct answer? For every one of these, yes.
//
// `State` went first, in slice 2, and the reasoning generalises to the rest:
// every payload carries a faithful `state`, so `=== State.ACTIVE` is ordinary
// correct code. `react-native-drawer-layout` does exactly that — it re-exports
// it as `GestureState`, seeds a shared value with `GestureState.UNDETERMINED`
// and tests `=== GestureState.ACTIVE`.
//
// `Directions` is REQUIRED rather than merely harmless: `Gesture.Fling()`
// takes a direction and this is the enum it takes. A refusal here would make
// the recognizer unusable in its documented spelling.
//
// `PointerType` became meaningful with `ForceTouch`, which is the first kind
// whose events are honestly not a mouse — every payload carries `pointerType`,
// and a stylus one says `STYLUS`.
//
// `HoverEffect` and `MouseButton` are INERT and exported anyway, which is the
// one place this file's rule bends. Both name values for knobs that are
// already accepted-and-inert here (`.effect()`, `.mouseButton()`) exactly as
// they are inert off their platforms upstream, and a knob that accepts a
// number while refusing the constant that number has a name for is incoherent.
// The refusal that matters is for something that would silently NOT WORK;
// these do exactly what they do upstream on this platform, which is nothing.
//
// Every number in all five is pinned by a test against 3.1.0's own sources,
// because nothing about a wrong one is loud: `state === State.ACTIVE` and
// `direction === Directions.LEFT` both go on compiling, go on running, and
// quietly answer false.
export const State = GESTURE_STATE
export const Directions = DIRECTIONS
export const HoverEffect = HOVER_EFFECT
export const MouseButton = MOUSE_BUTTON
export const PointerType = POINTER_TYPE

// --- the wrapped RN components and buttons ---
//
// Upstream builds every one of these with `createNativeWrapper(RN.X, {
// disallowInterruption: true, shouldCancelWhenOutside: false })` — an RN
// component with a `NativeViewGestureHandler` attached, so that RNGH's
// arbitration knows about the native scrolling or the native press underneath.
// On this platform that wrapper has nothing to add: the responder system IS
// the arbitration these are being registered with, every one of these
// components already speaks it, and `Gesture.Native()` is how a gesture is
// declared over one of them explicitly. So the honest re-export is the
// platform's own component, unwrapped.
//
// They are here because they are RENDERED, not merely imported.
// `react-native-draggable-flatlist` 4.0.3 hands `FlatList` and `ScrollView` to
// `Animated.createAnimatedComponent()` at module scope in
// `DraggableFlatList.tsx` and `NestableScrollContainer.tsx`, which is what
// stopped that library at IMPORT rather than at use;
// `react-native-reanimated-dnd`'s `Sortable`/`SortableGrid` do the same;
// `@gorhom/bottom-sheet` re-exports the three Touchables from its own public
// entry as `BottomSheetTouchable` on every platform except iOS, and renders
// `TextInput` as `BottomSheetTextInput`.
//
// WHAT IS NOT HERE, and the boundary is upstream's own: the BUTTON family
// (`RawButton`, `BaseButton`, `RectButton`, `BorderlessButton`) is not RN
// components with a handler attached — it is RNGH's own NATIVE BUTTON VIEWS,
// implemented in Java and Objective-C, with an Android ripple
// (`TouchableNativeFeedback`'s), `borderless` drawable selection, `rippleColor`
// / `rippleRadius`, `exclusive`, and an `activeOpacity` applied by the native
// view rather than by style. There is no GTK widget with those semantics and
// no way to fake the ripple, so any implementation would be a `Pressable`
// wearing the name of something else — which is precisely the silent
// substitution this whole surface refuses.
//
// RE-CHECKED WITH THE FOUR TARGET LIBRARIES rather than assumed, because that
// is what settled the `Touchable` question in slice 4. Sweeping the shipped
// sources of `@gorhom/bottom-sheet` 5.2.14, `react-native-draggable-flatlist`
// 4.0.3, `react-native-drawer-layout` 4.2.9 and `react-native-reanimated-dnd`
// 2.0.0 for every symbol still refused here finds exactly one hit —
// `RefreshControl` in `@gorhom/bottom-sheet` — and it is not this package's:
// it is imported from `react-native`, as a type in `bottomSheetRefreshControl/
// index.ts` and as a value only in `BottomSheetRefreshControl.android.tsx`,
// which Metro on this platform never resolves (`.linux.* -> .native.* -> .*`).
// Nothing reaches for a button, a legacy handler component, `Directions`,
// `MouseButton`, `PointerType`, `GestureStateManager` or any `Legacy*` alias.
// The `Touchable` subset slice 4 shipped remains the only thing upstream's own
// exports forced.
//
// `TouchableNativeFeedback` is Android's ripple by another name and `Touchable`
// is RN's deprecated mixin; both stay refused for the reason RN itself would
// not give them to you here. `RefreshControl` is pull-to-refresh, which needs
// a scroll gesture this platform's `ScrollView` does not expose and a spinner
// widget it does not have — and, per the sweep above, nothing asks for it.
export const BaseButton: any = unsupported("BaseButton")
export const BorderlessButton: any = unsupported("BorderlessButton")
export { FlatList } from "../components/flat-list"
export {
  Pressable,
  TouchableHighlight,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "../components/pressable"
export { ScrollView } from "../components/scroll-view"
export { Switch } from "../components/switch"
export { TextInput } from "../components/text-input"
export const RawButton: any = unsupported("RawButton")
export const RectButton: any = unsupported("RectButton")
export const RefreshControl: any = unsupported("RefreshControl")
export const Touchable: any = unsupported("Touchable")
export const TouchableNativeFeedback: any = unsupported(
  "TouchableNativeFeedback",
)

// --- the 2.x legacy aliases, still exported by 3.x ---
//
// ALL TWELVE STAY REFUSED, for one reason that covers them: each is 3.x's
// escape hatch back to the 2.x implementation of a component whose 3.x
// spelling is either implemented here already (`LegacyScrollView`,
// `LegacyFlatList`, `LegacyTextInput`, `LegacySwitch`, `LegacyPressable`,
// `LegacyText`) or refused above with its own reason (`LegacyRawButton`,
// `LegacyBaseButton`, `LegacyRectButton`, `LegacyBorderlessButton`,
// `LegacyRefreshControl`). Where the modern name works, the legacy alias would
// be a second name for the same component with a promise attached — "this one
// behaves like 2.x did" — that this platform cannot keep, because it never
// implemented 2.x's behaviour to differ from. Where the modern name is
// refused, the alias inherits the refusal.
//
// `LegacyDrawerLayoutAndroid` is the odd one and is refused twice over: it is
// Android's `DrawerLayoutAndroid`, which React Native itself does not ship off
// Android, and `@react-navigation/drawer` reaches for
// `react-native-drawer-layout` instead — which runs here (probe 3).
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
