// Maps a derived surface name (derive.ts) to the Reference page that
// declares its profile — the glue "map modules to the documented surface
// names docs:check already knows" the task calls for. Mirrors
// scripts/generate-mcp-data.mjs's own COMPONENT_FILES list exactly (same
// component → file mapping, same order intent) since both read the same
// restructured docs/reference/ tree.

// One reference page per component, docs/reference/components/<file>.
export const COMPONENT_PAGES: Readonly<Record<string, string>> = {
  View: "view.md",
  Text: "text.md",
  Image: "image.md",
  SafeAreaView: "safe-area-view.md",
  StatusBar: "status-bar.md",
  ActivityIndicator: "activity-indicator.md",
  Root: "root.md",
  NestedRoot: "nested-root.md",
  IntrinsicRoot: "intrinsic-root.md",
  TextInput: "text-input.md",
  Switch: "switch.md",
  Pressable: "pressable.md",
  TouchableOpacity: "touchable-opacity.md",
  TouchableHighlight: "touchable-highlight.md",
  TouchableWithoutFeedback: "touchable-without-feedback.md",
  ScrollView: "scroll-view.md",
  FlatList: "flat-list.md",
  SectionList: "section-list.md",
  VirtualizedList: "virtualized-list.md",
  Modal: "modal.md",
}

// Every OTHER value export of src/index.ts lives as one `##` section of
// this single page.
export const API_MODULES_FILE = "apis.md"

// The five subpath modules, badged at PAGE level (frontmatter), not
// per-export — see docs-site task 005's own notes on #143's scope.
export const SUBPATH_PAGES: Readonly<Record<string, string>> = {
  navigation: "navigation.md",
  svg: "svg.md",
  dnd: "dnd.md",
  "gesture-handler": "gesture-handler.md",
  "reanimated-compat": "reanimated-compat.md",
}
