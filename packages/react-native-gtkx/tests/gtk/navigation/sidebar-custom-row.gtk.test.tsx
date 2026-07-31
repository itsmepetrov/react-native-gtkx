// `sidebarRow` — the app draws its own sidebar row.
//
// title/icon/color/count compose an AdwActionRow, which carries Adwaita's
// own row metrics; an app wanting a different shape or density (a compact
// row of a height it picks, say) had nothing to reach for, and every app
// paid for the richest case. What must NOT change with a custom row is
// BEHAVIOUR: the navigator still owns selection and routing, so a custom
// row cannot drift out of sync with navigation state. That is what this
// pins down — the appearance is the app's problem by design.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { NavigationContainer } from "@react-navigation/native"
import { expect, it } from "vitest"
import { type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Text, View } from "../../../src/index"
import { createSidebarNavigator } from "../../../src/navigation/index"

const Sidebar = createSidebarNavigator()

// The GtkListBox that owns a given widget: the navigator keeps the row, so
// this is how the test checks the row still belongs to the real list.
const findListBoxAbove = (
  widget: GtkNs.Widget | null,
): GtkNs.ListBox | null => {
  for (let node = widget; node; node = node.getParent()) {
    if (typeof (node as Partial<GtkNs.ListBox>).getRowAtIndex === "function") {
      return node as GtkNs.ListBox
    }
  }
  return null
}

it("renders a custom row and still routes selection through it", async () => {
  render(
    <NavigationContainer>
      <Sidebar.Navigator>
        <Sidebar.Screen
          name="First"
          options={{
            sidebarRow: () => (
              <View style={{ height: 24 }}>
                <Text>custom-first</Text>
              </View>
            ),
          }}
        >
          {() => <Text>first-body</Text>}
        </Sidebar.Screen>
        <Sidebar.Screen
          name="Second"
          options={{
            sidebarRow: () => (
              <View style={{ height: 24 }}>
                <Text>custom-second</Text>
              </View>
            ),
          }}
        >
          {() => <Text>second-body</Text>}
        </Sidebar.Screen>
      </Sidebar.Navigator>
    </NavigationContainer>,
  )

  // The app's own content is what the row shows — no composed title.
  await waitFor(() => {
    expect(screen.getByText("custom-first")).toBeTruthy()
  })
  expect(screen.getByText("custom-second")).toBeTruthy()
  expect(screen.getByText("first-body")).toBeTruthy()

  // …and selecting it still routes: the whole point of keeping the
  // GtkListBoxRow ours.
  // Walk UP from the row's own content to the list that owns it, rather
  // than down from a render root — the custom row gives this test a widget
  // it knows by name, which the composed-row tests do not have.
  const list = findListBoxAbove(
    screen.getByText("custom-second") as unknown as GtkNs.Widget,
  )
  expect(list).not.toBeNull()
  // selectRow fires GTK's row-selected signal synchronously, which
  // dispatches into react-navigation state outside any React event
  // handler — same act() need as the other sidebar tests in this suite.
  await act(async () => {
    list!.selectRow(list!.getRowAtIndex(1))
  })
  await waitFor(() => {
    expect(screen.getByText("second-body")).toBeTruthy()
  })
  expect(list!.getSelectedRow()?.getIndex()).toBe(1)
})
