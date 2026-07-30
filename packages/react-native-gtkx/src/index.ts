// Public surface of react-native-gtkx, mirroring the `react-native` module.
// Components: 006 · APIs: 007 · StyleSheet: 005 · layout engine underneath: 004.

export {
  ActivityIndicator,
  Animated,
  AppRegistry,
  Easing,
  FlatList,
  Image,
  Modal,
  IntrinsicRoot,
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
  TouchableOpacity,
  View,
  type ActivityIndicatorProps,
  type FlatListProps,
  type ImageProps,
  type ImageSource,
  type LayoutEvent,
  type ListRenderItemInfo,
  type ModalProps,
  type PressableProps,
  type PressableStateCallbackType,
  type IntrinsicRootProps,
  type NestedRootProps,
  type PressEvent,
  type RootProps,
  type RunApplicationParams,
  type ScrollEvent,
  type ScrollViewHandle,
  type ScrollViewProps,
  type SectionListProps,
  type SwitchProps,
  type TextInputProps,
  type TextProps,
  type TouchableOpacityProps,
  type ViewabilityConfig,
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
  Linking,
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
  type PlatformSelectSpec,
  type ScaledSize,
} from "./apis/index"

export { PlatformColor, StyleSheet } from "./style/index"

export type {
  DimensionValue,
  FlatStyle,
  LayoutStyle,
  PointerEventsValue,
  StyleProp,
  TransformPart,
  VisualStyle,
} from "./contracts"

export const version = "0.1.0"
