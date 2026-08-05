// Public surface of react-native-gtkx, mirroring the `react-native` module.
// Components · APIs · StyleSheet, with the Yoga layout engine underneath.

// Side effect, evaluated before anything below: installs
// requestAnimationFrame/cancelAnimationFrame as globals, on the same frame
// clock Animated and the Reanimated compat surface already run on
// (glibScheduler — see frame-scheduler.ts's header for why nothing else may
// add a second one). RN provides both globals from its own bootstrap on
// every platform; this is the one module BOTH toolchains load before any
// app code runs — "react-native" resolves here (aliased) for the Metro
// bundle and for the vite dev/build graph alike, so installing it here
// covers both without a second call site. See components/
// request-animation-frame.ts for the semantics.
import { glibScheduler } from "./components/frame-scheduler"
import { installGlobalRequestAnimationFrame } from "./components/request-animation-frame"
// Installs the global-environment parity gaps (navigator.product,
// requestIdleCallback, global.alert, ErrorUtils — see ./globals/index.ts)
// before anything below runs. Both toolchains resolve `react-native` here
// (../aliases/index.ts), so this is the one place a side effect reaches
// every app regardless of which bundler built it.
import { installGlobals } from "./globals/install"

installGlobalRequestAnimationFrame(glibScheduler)

installGlobals()
export {
  ActivityIndicator,
  Animated,
  AppRegistry,
  Easing,
  findNodeHandle,
  FlatList,
  Image,
  Modal,
  IntrinsicRoot,
  PanResponder,
  NestedRoot,
  Pressable,
  Root,
  SafeAreaView,
  ScrollView,
  SectionList,
  StatusBar,
  Switch,
  Text,
  TextInput,
  TouchableHighlight,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  VirtualizedList,
  type ActivityIndicatorProps,
  type FlatListProps,
  type GestureResponderEvent,
  type ImageHandle,
  type ImageProps,
  type ImageSource,
  type LayoutEvent,
  type ListRenderItemInfo,
  type MeasureHandle,
  type MeasureInWindowOnSuccessCallback,
  type MeasureLayoutOnSuccessCallback,
  type MeasureOnSuccessCallback,
  type ItemLayout,
  type ModalProps,
  type NativeTouch,
  type NodeHandle,
  type PanResponderCallbacks,
  type PanResponderGestureState,
  type PanResponderInstance,
  type PressableProps,
  type PressableStateCallbackType,
  type IntrinsicRootProps,
  type NestedRootProps,
  type PressEvent,
  type ResponderProps,
  type RootProps,
  type RunApplicationParams,
  type ScrollEvent,
  type ScrollViewHandle,
  type ScrollViewProps,
  type SectionListProps,
  type SwitchProps,
  type TextHandle,
  type TextInputProps,
  type TextProps,
  type TouchHistory,
  type TouchRecord,
  type TouchableHighlightProps,
  type TouchableOpacityProps,
  type TouchableWithoutFeedbackProps,
  type ViewabilityConfig,
  type ViewHandle,
  type ViewProps,
  type ViewToken,
} from "./components/index"

// List scroll handle (scrollTo/scrollToEnd/scrollToIndex/scrollToItem/
// scrollToOffset) — exported straight from the component module.
export type { FlatListHandle } from "./components/flat-list"

export {
  Alert,
  Appearance,
  AppState,
  BackHandler,
  DevSettings,
  Dimensions,
  I18nManager,
  InteractionManager,
  Keyboard,
  Linking,
  LogBox,
  Platform,
  useColorScheme,
  useWindowDimensions,
  type AlertButton,
  type AlertButtonStyle,
  type AlertOptions,
  type AppearancePreferences,
  type AppStateEvent,
  type AppStateStatus,
  type ColorSchemeName,
  type DimensionKey,
  type DimensionsPayload,
  type InteractionPromise,
  type KeyboardEvent,
  type KeyboardEventName,
  type LogBoxIgnorePattern,
  type PlatformOSType,
  type PlatformSelectSpec,
  type ScaledSize,
} from "./apis/index"

export { PlatformColor, StyleSheet } from "./style/index"

export type {
  BoxShadowValue,
  DimensionValue,
  FlatStyle,
  ImageStyle,
  LayoutStyle,
  PointerEventsValue,
  StyleProp,
  TextDecorationLine,
  TextStyle,
  TransformPart,
  ViewStyle,
  VisualStyle,
} from "./contracts"

export const version = "0.1.0"
