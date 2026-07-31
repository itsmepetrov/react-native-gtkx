// `contentLayout: "widget"` — a sidebar screen whose body is a GTK widget
// tree rather than a React Native one (examples/tasks-nav is built this
// way: an AdwClamp around a `.boxed-list` GtkListBox).
//
// The regression this pins down: under the default React Native layout the
// screen's widgets are mounted inside a Yoga root, where each one becomes a
// LEAF measured for its own natural size — so a container renders its first
// child and silently drops the rest, and the pane comes up almost empty
// with no error anywhere. Caught only by looking at a screenshot, which is
// exactly why it needs a test.
import { render, screen, waitFor } from "@gtkx/testing"
import { NavigationContainer } from "@react-navigation/native"
import { expect, it } from "vitest"
import { AdwActionRow } from "../../../src/adw"
import { Gtk, GtkListBox } from "../../../src/gtk"
import { Text, View } from "../../../src/index"
import { createSidebarNavigator } from "../../../src/navigation/index"

const Sidebar = createSidebarNavigator()

const WidgetBody = () => (
  <GtkListBox
    selectionMode={Gtk.SelectionMode.NONE}
    cssClasses={["boxed-list"]}
  >
    <AdwActionRow title="first" />
    <AdwActionRow title="second" />
    <AdwActionRow title="third" />
  </GtkListBox>
)

const ReactNativeBody = () => (
  <View>
    <Text>rn-first</Text>
    <Text>rn-second</Text>
  </View>
)

it("keeps every widget child of a contentLayout: widget screen", async () => {
  render(
    <NavigationContainer>
      <Sidebar.Navigator screenOptions={{ contentLayout: "widget" }}>
        <Sidebar.Screen
          name="Widgets"
          component={WidgetBody}
        />
      </Sidebar.Navigator>
    </NavigationContainer>,
  )

  // All three, not just the first: the whole point of the option.
  await waitFor(() => {
    expect(screen.getByText("first")).toBeTruthy()
  })
  expect(screen.getByText("second")).toBeTruthy()
  expect(screen.getByText("third")).toBeTruthy()
})

it("still lays out React Native bodies by default", async () => {
  render(
    <NavigationContainer>
      <Sidebar.Navigator>
        <Sidebar.Screen
          name="ReactNative"
          component={ReactNativeBody}
        />
      </Sidebar.Navigator>
    </NavigationContainer>,
  )

  await waitFor(() => {
    expect(screen.getByText("rn-first")).toBeTruthy()
  })
  expect(screen.getByText("rn-second")).toBeTruthy()
})
