// Component gallery — 100% of the react-native-gtkx v1 surface and the basis
// for visual regression: every screen is self-documenting, section screenshots
// are compared against golden images. Components come from "react-native";
// the chrome is the package's own sidebar navigator: a native Adwaita
// NavigationSplitView with the sections in a real GtkListBox sidebar.
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
import { AnimatedSection } from "./sections/animated"
import { ApisSection } from "./sections/apis"
import { ButtonsSection } from "./sections/buttons"
import { GesturesSection } from "./sections/gestures"
import { SECTION_IDS, type SectionId } from "./sections/index"
import { InputsSection } from "./sections/inputs"
import { LayoutSection } from "./sections/layout"
import { ListsSection } from "./sections/lists"
import { MediaSection } from "./sections/media"
import { ModalSection } from "./sections/modal"
import { SvgSection } from "./sections/svg"
import { TextSection } from "./sections/text"
import { TogglesSection } from "./sections/toggles"
import { ViewsSection } from "./sections/views"
import { palette } from "./ui"

type SectionDef = {
  title: string
  Component: () => React.ReactElement
}

// A Record over SectionId guarantees that every id from SECTION_IDS (the
// visual regression contract, see sections/index.ts) has a section — and back.
const SECTION_DEFS: Record<SectionId, SectionDef> = {
  views: { title: "Views", Component: ViewsSection },
  text: { title: "Text", Component: TextSection },
  layout: { title: "Layout", Component: LayoutSection },
  inputs: { title: "Inputs", Component: InputsSection },
  buttons: { title: "Buttons", Component: ButtonsSection },
  lists: { title: "Lists", Component: ListsSection },
  toggles: { title: "Toggles", Component: TogglesSection },
  media: { title: "Media", Component: MediaSection },
  svg: { title: "Svg", Component: SvgSection },
  animated: { title: "Animated", Component: AnimatedSection },
  gestures: { title: "Gestures", Component: GesturesSection },
  modal: { title: "Modal", Component: ModalSection },
  apis: { title: "APIs", Component: ApisSection },
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

// Every section scrolls inside its screen — scrolling is always an explicit
// ScrollView, never the window. A fresh screen per section switch means the
// visual regression screenshots always start from the top.
const sectionScreen = (Component: () => React.ReactElement) => {
  const SectionScreen = () => (
    <View style={styles.canvas}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        <Component />
      </ScrollView>
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
            component={sectionScreen(SECTION_DEFS[id].Component)}
            options={{ title: SECTION_DEFS[id].title }}
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
  width: 1000,
  height: 700,
  // The sidebar and section HeaderBars ARE the window chrome.
  chrome: "content",
})
