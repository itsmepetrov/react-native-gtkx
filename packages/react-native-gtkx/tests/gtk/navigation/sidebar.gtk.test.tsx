// createSidebarNavigator: a native GtkListBox sidebar selects between
// parallel screens (TabRouter). Both sync directions are covered: selecting
// a row natively switches the screen, and programmatic navigation moves the
// native selection.
import { render, screen, waitFor } from "@gtkx/testing"
import { useEffect } from "react"
import { expect, it } from "vitest"
import type { Gtk } from "../../../src/gtkx/bridge/index"
import { Text, View } from "../../../src/index"
import {
  createSidebarNavigator,
  NavigationContainer,
  useNavigationContainerRef,
} from "../../../src/navigation/index"

const Sidebar = createSidebarNavigator()

const findListBox = (widget: Gtk.Widget | null): Gtk.ListBox | null => {
  if (!widget) {
    return null
  }
  if (typeof (widget as Partial<Gtk.ListBox>).getRowAtIndex === "function") {
    return widget as Gtk.ListBox
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

const Harness = ({
  onRef,
}: {
  onRef: (ref: ReturnType<typeof useNavigationContainerRef>) => void
}) => {
  const navRef = useNavigationContainerRef()
  useEffect(() => {
    onRef(navRef)
  }, [navRef, onRef])
  return (
    <NavigationContainer ref={navRef}>
      <Sidebar.Navigator sidebarTitle="Test sections">
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

it("native row selection and programmatic navigation stay in sync", async () => {
  let navRef!: ReturnType<typeof useNavigationContainerRef>
  const { container } = await render(
    <Harness
      onRef={(ref) => {
        navRef = ref
      }}
    />,
  )
  const window = container as Gtk.Window

  // Initial: the first screen is focused, its row is selected, the sidebar
  // rows carry the option titles.
  await waitFor(() => {
    expect(screen.getByText("first section body")).toBeTruthy()
  })
  const list = findListBox(window.getChild())
  expect(list).not.toBeNull()
  await waitFor(() => {
    expect(list!.getSelectedRow()?.getIndex()).toBe(0)
  })
  // The option title appears in the sidebar row AND in the content
  // HeaderBar of the focused screen.
  expect(screen.getAllByText("First").length).toBeGreaterThan(0)
  expect(screen.getAllByText("Second").length).toBeGreaterThan(0)

  // Native selection (what a sidebar click does) → the screen switches and
  // the previous one unmounts.
  list!.selectRow(list!.getRowAtIndex(1))
  await waitFor(() => {
    expect(screen.getByText("second section body")).toBeTruthy()
    expect(screen.queryByText("first section body")).toBeNull()
  })

  // Programmatic navigation → the native selection follows.
  navRef.navigate("first" as never)
  await waitFor(() => {
    expect(screen.getByText("first section body")).toBeTruthy()
    expect(list!.getSelectedRow()?.getIndex()).toBe(0)
  })
})
