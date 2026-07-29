// Component gallery — 100% of the react-native-gtkx v1 surface and the basis
// for visual regression: every screen is self-documenting, section screenshots
// are compared against golden images. Imports come from "react-native" only.
import { useState } from "react"
import {
  Appearance,
  AppRegistry,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { AnimatedSection } from "./sections/animated"
import { ApisSection } from "./sections/apis"
import { ButtonsSection } from "./sections/buttons"
import { SECTION_IDS, type SectionId } from "./sections/index"
import { InputsSection } from "./sections/inputs"
import { LayoutSection } from "./sections/layout"
import { ListsSection } from "./sections/lists"
import { MediaSection } from "./sections/media"
import { ModalSection } from "./sections/modal"
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
  animated: { title: "Animated", Component: AnimatedSection },
  modal: { title: "Modal", Component: ModalSection },
  apis: { title: "APIs", Component: ApisSection },
}

// The SECTION_IDS order drives the sidebar and the visual regression script.
const SECTIONS = SECTION_IDS.map((key) => ({ key, ...SECTION_DEFS[key] }))

// The headless regression script opens the desired section without clicks:
// GALLERY_SECTION=<id> node dist/bundle.js
const envSection = process.env.GALLERY_SECTION
const INITIAL_SECTION: SectionId = SECTION_IDS.includes(envSection as SectionId)
  ? (envSection as SectionId)
  : SECTION_IDS[0]

const styles = StyleSheet.create({
  app: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: palette.window,
  },
  sidebar: {
    width: 190,
    backgroundColor: palette.sidebar,
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 2,
  },
  brand: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingBottom: 2,
  },
  brandSub: {
    color: palette.textFaint,
    fontSize: 11,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  navItem: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  navItemHovered: {
    backgroundColor: palette.card,
  },
  navItemActive: {
    backgroundColor: palette.accent,
  },
  navLabel: {
    color: palette.textDim,
    fontSize: 13,
  },
  navLabelActive: {
    color: palette.text,
    fontWeight: "700",
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

const NavItem = ({
  title,
  active,
  onPress,
}: {
  title: string
  active: boolean
  onPress: () => void
}) => (
  <Pressable
    style={({ hovered, pressed }) => [
      styles.navItem,
      (hovered || pressed) && !active && styles.navItemHovered,
      active && styles.navItemActive,
    ]}
    onPress={onPress}
  >
    <Text style={[styles.navLabel, active && styles.navLabelActive]}>
      {title}
    </Text>
  </Pressable>
)

const App = () => {
  const [activeKey, setActiveKey] = useState<SectionId>(INITIAL_SECTION)
  const active = SECTIONS.find((s) => s.key === activeKey) ?? SECTIONS[0]
  const ActiveSection = active.Component

  return (
    <View style={styles.app}>
      <View style={styles.sidebar}>
        <Text style={styles.brand}>Gallery</Text>
        <Text style={styles.brandSub}>react-native-gtkx v1</Text>
        {SECTIONS.map((section) => (
          <NavItem
            key={section.key}
            title={section.title}
            active={section.key === activeKey}
            onPress={() => setActiveKey(section.key)}
          />
        ))}
      </View>
      {/* key resets scrolling when switching sections — visual regression
          screenshots always start from the top of the screen. */}
      <ScrollView
        key={active.key}
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        <ActiveSection />
      </ScrollView>
    </View>
  )
}

// The gallery is drawn in a dark palette — switch the app's GTK theme to dark
// so native widgets (Entry, Switch) match it.
Appearance.setColorScheme("dark")

AppRegistry.registerComponent("gallery", () => App)
AppRegistry.runApplication("gallery", {
  title: "Gallery — react-native-gtkx",
  width: 1000,
  height: 700,
})
