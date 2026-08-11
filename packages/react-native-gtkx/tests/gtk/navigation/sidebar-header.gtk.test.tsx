// The SIDEBAR pane's own AdwHeaderBar — sidebarHeaderLeft/Right/Title.
//
// This header used to be a bare `<AdwHeaderBar />` with no way for an app to
// put anything in it: `sidebarTitle` (a plain string) was the only thing
// reachable. examples/tasks-nav wanted its "New List" action there — where
// GNOME, and the gtkx tutorial this app family is modelled on, puts a
// sidebar's add action — and had to settle for the CONTENT header instead,
// which already had its own "New Task" +. Two identical plus buttons in one
// window, and no way to tell them apart. These props are that gap closed,
// mirroring the content header's headerLeft/headerRight/headerTitle rather
// than inventing a second, narrower shape for the same job.
import { act, fireEvent, render, screen, waitFor } from "@gtkx/testing"
import { NavigationContainer } from "@react-navigation/native"
import { useState } from "react"
import { expect, it } from "vitest"
import { GtkButton } from "../../../src/gtk"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Text, View } from "../../../src/index"
import { createSidebarNavigator } from "../../../src/navigation/index"

const Sidebar = createSidebarNavigator()

const findListBox = (widget: GtkNs.Widget | null): GtkNs.ListBox | null => {
  if (!widget) {
    return null
  }
  if (
    typeof (widget as unknown as Partial<GtkNs.ListBox>).getRowAtIndex ===
    "function"
  ) {
    return widget as GtkNs.ListBox
  }
  for (
    let child = widget.getFirstChild();
    child;
    child = child.getNextSibling()
  ) {
    const found = findListBox(child)
    if (found) {
      return found
    }
  }
  return null
}

const FirstScreen = () => (
  <View style={{ flex: 1 }}>
    <Text>first section body</Text>
  </View>
)

const SecondScreen = () => (
  <View style={{ flex: 1 }}>
    <Text>second section body</Text>
  </View>
)

const Harness = () => {
  // Real app state behind the slot, not a static widget: the point of a
  // render prop over a declarative button list is that the content can be
  // anything AND can change, so the test drives both.
  const [lists, setLists] = useState(1)

  return (
    <NavigationContainer>
      <Sidebar.Navigator
        sidebarTitle="Lists"
        sidebarHeaderLeft={() => (
          <GtkButton
            label="New List"
            onClicked={() => setLists((count) => count + 1)}
          />
        )}
        sidebarHeaderRight={() => <GtkButton label="Sidebar menu" />}
        // Arbitrary content, not just buttons — a title widget driven by app
        // state is exactly the case a `HeaderButton[]` convenience could
        // never have expressed, which is why the primitive is a render prop.
        sidebarHeaderTitle={() => <Text>{`${lists} lists`}</Text>}
      >
        <Sidebar.Screen
          name="first"
          component={FirstScreen}
          options={{ title: "First" }}
        />
        <Sidebar.Screen
          name="second"
          component={SecondScreen}
          options={{ title: "Second" }}
        />
      </Sidebar.Navigator>
    </NavigationContainer>
  )
}

it("renders app content into the sidebar header's start, end and title slots", async () => {
  const { container } = await render(<Harness />)
  const window = container as GtkNs.Window

  // All three slots are mounted into the sidebar's own HeaderBar.
  const newList = (await screen.findByRole(Gtk.AccessibleRole.BUTTON, {
    name: "New List",
  })) as GtkNs.Button
  expect(
    screen.getByRole(Gtk.AccessibleRole.BUTTON, { name: "Sidebar menu" }),
  ).toBeTruthy()
  expect(screen.getByText("1 lists")).toBeTruthy()

  // The slot is live: clicking the app's own button re-renders the title
  // widget, so this really is the app's tree inside the navigator's chrome
  // and not a snapshot taken once at mount.
  fireEvent(newList, "clicked")
  await waitFor(() => {
    expect(screen.getByText("2 lists")).toBeTruthy()
  })

  // And it belongs to the NAVIGATOR, not to a screen: switching the focused
  // screen swaps the content body but leaves the sidebar's chrome alone.
  // That asymmetry is why these are navigator props while the content
  // header's equivalents are screen options.
  const list = findListBox(window.getChild())
  expect(list).not.toBeNull()
  await act(async () => {
    list!.selectRow(list!.getRowAtIndex(1))
  })
  await waitFor(() => {
    expect(screen.getByText("second section body")).toBeTruthy()
  })
  expect(
    screen.getByRole(Gtk.AccessibleRole.BUTTON, { name: "New List" }),
  ).toBeTruthy()
  expect(screen.getByText("2 lists")).toBeTruthy()
})
