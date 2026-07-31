// SidebarNavigationOptions.headerLeft/headerRight/headerTitle — tasks-app's
// third complaint: "one content header shared by the whole navigator...
// a real app's header changes shape with the selection". The PRD allowed
// finding this a structural gap; it isn't — react-navigation already
// merges screenOptions with a screen's own options and re-resolves them on
// navigation.setOptions(). This test proves the header ACTUALLY changes
// shape when a screen calls setOptions from an effect keyed on its own
// internal state, matching how tasks-app's own content-pane swaps between
// a filter toggle group and a back/star/trash header — no stack involved.
import { fireEvent, render, screen, waitFor } from "@gtkx/testing"
import { NavigationContainer, useNavigation } from "@react-navigation/native"
import { useEffect, useState } from "react"
import { expect, it } from "vitest"
import { Gtk, GtkButton } from "../../../src/gtk"
import { Text, View } from "../../../src/index"
import {
  createSidebarNavigator,
  type SidebarNavigationOptions,
} from "../../../src/navigation/index"

const Sidebar = createSidebarNavigator()

// One screen, two header shapes: "list" mode (a plain title, a "New"
// headerRight button) and "detail" mode (a headerLeft back button, a
// headerTitle showing the "item" name) — toggled by LOCAL state, exactly
// the "conditional render inside one screen" tasks-app's README described.
const ToggleScreen = () => {
  const navigation = useNavigation()
  const [detailOpen, setDetailOpen] = useState(false)

  useEffect(() => {
    // navigation.setOptions MERGES into the previously resolved options
    // rather than replacing them — found empirically: omitting headerRight
    // in the "detail" branch left the stale "New" button in the header,
    // merged in from the "list" branch's earlier call. Every key this
    // effect ever sets must be given an explicit value (undefined counts
    // as a real overwrite; an absent key does not) in BOTH branches.
    const options: SidebarNavigationOptions = detailOpen
      ? {
          headerLeft: () => (
            <GtkButton
              label="Back"
              onClicked={() => setDetailOpen(false)}
            />
          ),
          headerRight: undefined,
          headerTitle: () => <Text>Item detail</Text>,
        }
      : {
          headerLeft: undefined,
          headerRight: () => (
            <GtkButton
              label="New"
              onClicked={() => setDetailOpen(true)}
            />
          ),
          headerTitle: undefined,
        }
    navigation.setOptions(options)
  }, [detailOpen, navigation])

  return (
    <View style={{ flex: 1 }}>
      <Text>{detailOpen ? "detail body" : "list body"}</Text>
    </View>
  )
}

it("the content header changes shape when the active screen's own state changes", async () => {
  await render(
    <NavigationContainer>
      <Sidebar.Navigator sidebarTitle="Dynamic header">
        <Sidebar.Screen
          name="toggle"
          component={ToggleScreen}
          options={{ title: "Toggle" }}
        />
      </Sidebar.Navigator>
    </NavigationContainer>,
  )

  // List mode: the "New" headerRight button is there, no "Back" yet.
  const newButton = await screen.findByRole(Gtk.AccessibleRole.BUTTON, {
    name: "New",
  })
  expect(screen.getByText("list body")).toBeTruthy()
  expect(
    screen.queryByRole(Gtk.AccessibleRole.BUTTON, { name: "Back" }),
  ).toBeNull()
  expect(screen.queryByText("Item detail")).toBeNull()

  // Flip the screen's OWN internal state — not a route change, not a push.
  fireEvent(newButton, "clicked")

  // Detail mode: the header is now a totally different shape — a back
  // button and a custom title widget — proving options set via
  // navigation.setOptions() from inside the screen actually take effect
  // on THIS navigator's content HeaderBar, live.
  await waitFor(() => {
    expect(screen.getByText("detail body")).toBeTruthy()
    expect(screen.getByText("Item detail")).toBeTruthy()
    expect(
      screen.queryByRole(Gtk.AccessibleRole.BUTTON, { name: "New" }),
    ).toBeNull()
  })
  const backButton = await screen.findByRole(Gtk.AccessibleRole.BUTTON, {
    name: "Back",
  })

  fireEvent(backButton, "clicked")
  await waitFor(() => {
    expect(screen.getByText("list body")).toBeTruthy()
    expect(screen.queryByText("Item detail")).toBeNull()
    expect(
      screen.queryByRole(Gtk.AccessibleRole.BUTTON, { name: "Back" }),
    ).toBeNull()
  })
})
