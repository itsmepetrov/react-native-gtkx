// createSidebarNavigator's collapseWidth — tasks-app's second complaint,
// "no collapse at narrow widths". Verifies the native AdwBreakpoint
// mechanism (task 001) actually drives the navigator's own split view, and
// the follow-on UX fix: re-clicking an already-selected row after the
// native back button hid content must show it again, which needs
// row-activated (fires on every click) rather than row-selected (fires
// only on a selection CHANGE) — found while writing this test.
import * as Adw from "@gtkx/gi/adw"
import { fireEvent, render, screen, waitFor } from "@gtkx/testing"
import { NavigationContainer } from "@react-navigation/native"
import { expect, it } from "vitest"
import { type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Text, View } from "../../../src/index"
import { createSidebarNavigator } from "../../../src/navigation/index"

const Sidebar = createSidebarNavigator()

const findListBox = (widget: GtkNs.Widget | null): GtkNs.ListBox | null => {
  if (!widget) {
    return null
  }
  if (typeof (widget as Partial<GtkNs.ListBox>).getRowAtIndex === "function") {
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

const findSplitView = (
  widget: GtkNs.Widget | null,
): InstanceType<typeof Adw.NavigationSplitView> | null => {
  if (!widget) {
    return null
  }
  if (widget instanceof Adw.NavigationSplitView) {
    return widget
  }
  for (
    let child = widget.getFirstChild();
    child;
    child = child.getNextSibling()
  ) {
    const found = findSplitView(child)
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

const Harness = () => (
  <NavigationContainer>
    <Sidebar.Navigator
      sidebarTitle="Collapsible"
      collapseWidth={500}
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

it("collapses natively below collapseWidth and expands back above it", async () => {
  const { container } = await render(<Harness />)
  const window = container as GtkNs.Window

  await waitFor(() => {
    expect(screen.getByText("first section body")).toBeTruthy()
  })
  const splitView = findSplitView(window.getChild())
  expect(splitView).not.toBeNull()

  expect(splitView!.getCollapsed()).toBe(false)

  // Map-time resize below the 500sp threshold (same technique as
  // tests/gtk/apis/dimensions.test.tsx and tests/gtk/adw/breakpoint.gtk.test.tsx).
  window.setVisible(false)
  window.setDefaultSize(400, 400)
  window.present()
  await waitFor(() => {
    expect(splitView!.getCollapsed()).toBe(true)
  })

  window.setVisible(false)
  window.setDefaultSize(800, 600)
  window.present()
  await waitFor(() => {
    expect(splitView!.getCollapsed()).toBe(false)
  })
})

it("shows content on row activation while collapsed, including re-activating the already-selected row", async () => {
  const { container } = await render(<Harness />)
  const window = container as GtkNs.Window

  await waitFor(() => {
    expect(screen.getByText("first section body")).toBeTruthy()
  })
  const splitView = findSplitView(window.getChild())
  const list = findListBox(window.getChild())
  expect(splitView).not.toBeNull()
  expect(list).not.toBeNull()

  window.setVisible(false)
  window.setDefaultSize(400, 400)
  window.present()
  await waitFor(() => {
    expect(splitView!.getCollapsed()).toBe(true)
  })

  // Selecting a DIFFERENT row while collapsed: row-selected dispatches the
  // navigation change, row-activated reveals content.
  const secondRow = list!.getRowAtIndex(1)!
  // "row-activated" is a GtkListBox signal (the box, not the row, is the
  // emitter — GTK's row-selected/row-activated convention alike) — found
  // empirically: firing "activated" on the row itself did nothing.
  await fireEvent(list!, "row-activated", secondRow)
  await waitFor(() => {
    expect(splitView!.getShowContent()).toBe(true)
  })

  // Simulate the native back button (collapsed content's automatic back
  // affordance): it sets showContent back to false with no react-navigation
  // involvement at all.
  splitView!.setShowContent(false)
  expect(splitView!.getShowContent()).toBe(false)

  // Re-activating the SAME, already-selected row must show content again.
  // row-selected would NOT refire here (no selection change) — this is
  // exactly why row-activated (fires on every click) is needed in addition.
  // "row-activated" is a GtkListBox signal (the box, not the row, is the
  // emitter — GTK's row-selected/row-activated convention alike) — found
  // empirically: firing "activated" on the row itself did nothing.
  await fireEvent(list!, "row-activated", secondRow)
  await waitFor(() => {
    expect(splitView!.getShowContent()).toBe(true)
  })
})
