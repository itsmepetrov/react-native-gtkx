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
  type ViewProps,
} from "./components/index"

// List scroll handle (scrollTo/scrollToEnd/scrollToIndex/scrollToItem/
// scrollToOffset) — exported straight from the component module.
export type { FlatListHandle } from "./components/flat-list"

export {
  Alert,
  Appearance,
  AppState,
  Dimensions,
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
  type PlatformSelectSpec,
  type ScaledSize,
} from "./apis/index"

export { PlatformColor, StyleSheet } from "./style/index"

export type {
  DimensionValue,
  FlatStyle,
  LayoutStyle,
  StyleProp,
  TransformPart,
  VisualStyle,
} from "./contracts"

export const version = "0.1.0"
