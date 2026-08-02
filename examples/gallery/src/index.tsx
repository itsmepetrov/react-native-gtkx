// Component gallery — 100% of the react-native-gtkx v1 surface and the basis
// for visual regression: every screen is self-documenting, section screenshots
// are compared against golden images. Components come from "react-native";
// the chrome is the package's own sidebar navigator: a native Adwaita
// NavigationSplitView with the sections in a real GtkListBox sidebar.
//
// `./warnings` comes first and is imported for its side effect: it wraps
// `console.warn` before anything else is evaluated, so the "Reanimated limits"
// section can show the refusal messages on screen instead of only on stderr.
import "./warnings"
import { NavigationContainer } from "@react-navigation/native"
import {
  Appearance,
  AppRegistry,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from "react-native"
import { createSidebarNavigator } from "react-native-gtkx/navigation"
import { AdwaitaStackSection } from "./sections/adwaita-stack"
import { AnimatedSection } from "./sections/animated"
import { ApisSection } from "./sections/apis"
import { ButtonsSection } from "./sections/buttons"
import { ClippingSection } from "./sections/clipping"
import { DndSection } from "./sections/dnd"
import { GestureDetectorSection } from "./sections/gesture-detector"
import { GestureFlingSection } from "./sections/gesture-fling"
import { GesturePinchSection } from "./sections/gesture-pinch"
import { GestureRelationsSection } from "./sections/gesture-relations"
import { GesturesSection } from "./sections/gestures"
import { SECTION_IDS, type SectionId } from "./sections/index"
import { InputsSection } from "./sections/inputs"
import { InterpolateSection } from "./sections/interpolate"
import { LayoutSection } from "./sections/layout"
import { ListsSection } from "./sections/lists"
import { MediaSection } from "./sections/media"
import { ModalSection } from "./sections/modal"
import { ReanimatedSection } from "./sections/reanimated"
import { ReanimatedLayoutSection } from "./sections/reanimated-layout"
import { ReanimatedLimitsSection } from "./sections/reanimated-limits"
import { ReanimatedMotionSection } from "./sections/reanimated-motion"
import { SvgSection } from "./sections/svg"
import { TextSection } from "./sections/text"
import { TogglesSection } from "./sections/toggles"
import { TransformsSection } from "./sections/transforms"
import { UpstreamBottomSheetSection } from "./sections/upstream-bottom-sheet"
import { UpstreamDrawerSection } from "./sections/upstream-drawer"
import { UpstreamDropZonesSection } from "./sections/upstream-drop-zones"
import { UpstreamSortablesSection } from "./sections/upstream-sortables"
import { ViewsSection } from "./sections/views"
import { WidgetHostingSection } from "./sections/widget-hosting"
import { palette } from "./ui"

// The three groups, in the order a reader meets the platform: portable API
// first, the part that only exists because this is GTK second, the ecosystem
// third. They become Adwaita section headers in the sidebar — see
// `SidebarNavigationOptions.group`.
const GROUP = {
  rn: "React Native",
  gtkx: "gtkx",
  modules: "Modules",
} as const

type SectionDef = {
  title: string
  group: (typeof GROUP)[keyof typeof GROUP]
  Component: () => React.ReactElement
  /**
   * Sections that bring their own scrolling or gesture-arbitrating surface
   * opt out of the screen ScrollView and take the canvas directly.
   *
   * This is not cosmetic. A `Gesture.Native()` over a real ScrollView, a
   * drawer dragged in from an edge, an AdwBottomSheet's drag handle and
   * Adwaita's back gesture all negotiate with whatever else wants the
   * pointer — and an enclosing ScrollView is a competitor those demos were
   * never meant to have. Every one of them arrived here as a standalone app
   * whose window it filled; the canvas is that window.
   */
  fillsCanvas?: true
}

// A Record over SectionId guarantees that every id from SECTION_IDS (the
// visual regression contract, see sections/index.ts) has a section — and back.
const SECTION_DEFS: Record<SectionId, SectionDef> = {
  // 1 — the portable React Native API.
  views: { title: "Views", group: GROUP.rn, Component: ViewsSection },
  text: { title: "Text", group: GROUP.rn, Component: TextSection },
  layout: { title: "Layout", group: GROUP.rn, Component: LayoutSection },
  clipping: { title: "Clipping", group: GROUP.rn, Component: ClippingSection },
  inputs: { title: "Inputs", group: GROUP.rn, Component: InputsSection },
  buttons: { title: "Buttons", group: GROUP.rn, Component: ButtonsSection },
  toggles: { title: "Toggles", group: GROUP.rn, Component: TogglesSection },
  lists: { title: "Lists", group: GROUP.rn, Component: ListsSection },
  media: { title: "Media", group: GROUP.rn, Component: MediaSection },
  modal: { title: "Modal", group: GROUP.rn, Component: ModalSection },
  animated: { title: "Animated", group: GROUP.rn, Component: AnimatedSection },
  interpolate: {
    title: "Interpolate",
    group: GROUP.rn,
    Component: InterpolateSection,
  },
  transforms: {
    title: "Transforms",
    group: GROUP.rn,
    Component: TransformsSection,
  },
  gestures: { title: "Gestures", group: GROUP.rn, Component: GesturesSection },
  apis: { title: "APIs", group: GROUP.rn, Component: ApisSection },

  // 2 — what exists only because this is GTK.
  "widget-hosting": {
    title: "Widget hosting",
    group: GROUP.gtkx,
    Component: WidgetHostingSection,
    fillsCanvas: true,
  },
  "adwaita-stack": {
    title: "Adwaita stack",
    group: GROUP.gtkx,
    Component: AdwaitaStackSection,
    fillsCanvas: true,
  },

  // 3 — the third-party ecosystem, reached through the presets' aliases —
  // and, in the last four, deliberately not aliased at all.
  reanimated: {
    title: "Reanimated values",
    group: GROUP.modules,
    Component: ReanimatedSection,
  },
  "reanimated-motion": {
    title: "Reanimated motion",
    group: GROUP.modules,
    Component: ReanimatedMotionSection,
  },
  "reanimated-layout": {
    title: "Layout animations",
    group: GROUP.modules,
    Component: ReanimatedLayoutSection,
  },
  "reanimated-limits": {
    title: "Reanimated limits",
    group: GROUP.modules,
    Component: ReanimatedLimitsSection,
  },
  "gesture-detector": {
    title: "Gesture detector",
    group: GROUP.modules,
    Component: GestureDetectorSection,
    fillsCanvas: true,
  },
  "gesture-pinch": {
    title: "Pinch and rotation",
    group: GROUP.modules,
    Component: GesturePinchSection,
    fillsCanvas: true,
  },
  "gesture-relations": {
    title: "Gesture relations",
    group: GROUP.modules,
    Component: GestureRelationsSection,
    fillsCanvas: true,
  },
  "gesture-fling": {
    title: "Fling, manual, hover, force touch",
    group: GROUP.modules,
    Component: GestureFlingSection,
    fillsCanvas: true,
  },
  dnd: {
    title: "Drag and drop",
    group: GROUP.modules,
    Component: DndSection,
  },
  svg: { title: "Svg", group: GROUP.modules, Component: SvgSection },
  // The last four are the ecosystem un-aliased: three published npm tarballs
  // installed for real, one screen per library — and, for the drag-and-drop
  // one, one screen per idea.
  "upstream-drop-zones": {
    title: "Upstream drop zones",
    group: GROUP.modules,
    Component: UpstreamDropZonesSection,
    fillsCanvas: true,
  },
  "upstream-sortables": {
    title: "Upstream sortables",
    group: GROUP.modules,
    Component: UpstreamSortablesSection,
    fillsCanvas: true,
  },
  "upstream-drawer": {
    title: "Upstream drawer",
    group: GROUP.modules,
    Component: UpstreamDrawerSection,
    fillsCanvas: true,
  },
  "upstream-bottom-sheet": {
    title: "Upstream bottom sheet",
    group: GROUP.modules,
    Component: UpstreamBottomSheetSection,
    fillsCanvas: true,
  },
}

// The headless regression script opens the desired section without clicks:
// GALLERY_SECTION=<id> node dist/bundle.js
const envSection = process.env.GALLERY_SECTION
const INITIAL_SECTION: SectionId = SECTION_IDS.includes(envSection as SectionId)
  ? (envSection as SectionId)
  : SECTION_IDS[0]

const styles = StyleSheet.create({
  // The section canvas paints the themed window color — the ScrollView
  // needs an owning View for it, the scroll surface itself does not take
  // a background.
  canvas: {
    flex: 1,
    backgroundColor: palette.window,
  },
  content: {
    flex: 1,
  },
  // ScrollView defaults its content to alignItems: flex-start — restore
  // stretch so sections fill the width of the content area.
  contentContainer: {
    alignItems: "stretch",
  },
})

// Every scrolling section scrolls inside its screen — scrolling is always an
// explicit ScrollView, never the window. A fresh screen per section switch
// means the visual regression screenshots always start from the top.
const sectionScreen = ({ Component, fillsCanvas }: SectionDef) => {
  const SectionScreen = () => (
    <View style={styles.canvas}>
      {fillsCanvas ? (
        <Component />
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
        >
          <Component />
        </ScrollView>
      )}
    </View>
  )
  return SectionScreen
}

const Sidebar = createSidebarNavigator()

const App = () => {
  // The HeaderBar theme toggle doubles as the Appearance demo: native
  // widgets AND the PlatformColor palette follow the scheme instantly.
  const scheme = useColorScheme()
  return (
    <NavigationContainer>
      <Sidebar.Navigator
        initialRouteName={INITIAL_SECTION}
        sidebarTitle="Gallery"
        headerButtons={[
          {
            id: "color-scheme",
            icon:
              scheme === "dark"
                ? "weather-clear-symbolic"
                : "weather-clear-night-symbolic",
            tooltip: "Toggle the color scheme",
            onPress: () =>
              Appearance.setColorScheme(scheme === "dark" ? "light" : "dark"),
          },
        ]}
      >
        {SECTION_IDS.map((id) => (
          <Sidebar.Screen
            key={id}
            name={id}
            component={sectionScreen(SECTION_DEFS[id])}
            options={{
              title: SECTION_DEFS[id].title,
              group: SECTION_DEFS[id].group,
            }}
          />
        ))}
      </Sidebar.Navigator>
    </NavigationContainer>
  )
}

// The gallery follows the system scheme via PlatformColor; dark is the
// default look. GALLERY_SCHEME=light serves the visual-regression script —
// the HeaderBar toggle switches live either way.
Appearance.setColorScheme(
  process.env.GALLERY_SCHEME === "light" ? "light" : "dark",
)

AppRegistry.registerComponent("gallery", () => App)
AppRegistry.runApplication("gallery", {
  title: "Gallery — react-native-gtkx",
  // The gesture boards absorbed from the standalone examples are meant to be
  // visible in one go rather than scrolled, and they set the floor here.
  width: 1180,
  height: 840,
  // The sidebar and section HeaderBars ARE the window chrome.
  chrome: "content",
})
