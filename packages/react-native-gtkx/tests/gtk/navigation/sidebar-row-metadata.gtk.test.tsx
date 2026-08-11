// SidebarNavigationOptions.icon/color/count — the exact gap tasks-app's
// README named: "SidebarNavigationOptions is { title } only — no per-row
// icon, colored dot or count". Three screens, one of each, verify the
// AdwActionRow prefix/suffix rendering for real.
import { render, screen, waitFor } from "@gtkx/testing"
import { NavigationContainer } from "@react-navigation/native"
import { expect, it } from "vitest"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Text, View } from "../../../src/index"
import { createSidebarNavigator } from "../../../src/navigation/index"

// AdwActionRow itself ALSO has a (deprecated, libhandy-era) `iconName`
// property distinct from the `prefix` widget this navigator sets — a bare
// "does it have getIconName()" duck-type check matches the ROW, not the
// GtkImage inside it. instanceof against the real Gtk.Image class is the
// only reliable way to tell them apart (found empirically: the row itself
// matched first and reported iconName: null before this fix).

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

const findFirstImage = (widget: GtkNs.Widget | null): GtkNs.Image | null => {
  if (!widget) {
    return null
  }
  if (widget instanceof Gtk.Image) {
    return widget
  }
  for (
    let child = widget.getFirstChild();
    child;
    child = child.getNextSibling()
  ) {
    const found = findFirstImage(child)
    if (found) {
      return found
    }
  }
  return null
}

// The color-dot prefix is a plain GtkBox, distinguished from AdwActionRow's
// OWN internal boxes only by the accessibleRole this navigator explicitly
// sets on it (PRESENTATION) — the generated CSS class name is an
// implementation detail (a content hash), not something a test should know.
const findPresentationBox = (widget: GtkNs.Widget | null): GtkNs.Box | null => {
  if (!widget) {
    return null
  }
  if (
    widget instanceof Gtk.Box &&
    widget.getAccessibleRole() === Gtk.AccessibleRole.PRESENTATION
  ) {
    return widget
  }
  for (
    let child = widget.getFirstChild();
    child;
    child = child.getNextSibling()
  ) {
    const found = findPresentationBox(child)
    if (found) {
      return found
    }
  }
  return null
}

const Screen = () => (
  <View style={{ flex: 1 }}>
    <Text>screen body</Text>
  </View>
)

it("renders icon, colored-dot and count on sidebar rows", async () => {
  const { container } = await render(
    <NavigationContainer>
      <Sidebar.Navigator sidebarTitle="Rows">
        <Sidebar.Screen
          name="withIcon"
          component={Screen}
          options={{ title: "With Icon", icon: "view-list-symbolic" }}
        />
        <Sidebar.Screen
          name="withColor"
          component={Screen}
          options={{ title: "With Color", color: "#e01b24" }}
        />
        <Sidebar.Screen
          name="withCount"
          component={Screen}
          options={{ title: "With Count", count: 7 }}
        />
        <Sidebar.Screen
          name="withZeroCount"
          component={Screen}
          options={{ title: "With Zero Count", count: 0 }}
        />
      </Sidebar.Navigator>
    </NavigationContainer>,
  )
  const window = container as GtkNs.Window
  const list = findListBox(window.getChild())
  expect(list).not.toBeNull()

  await waitFor(() => {
    expect(screen.getAllByText("With Icon").length).toBeGreaterThan(0)
  })

  // icon row: an image prefix carrying the requested icon name, and no
  // colored-dot presentation box.
  const iconRow = list!.getRowAtIndex(0)
  expect(iconRow).not.toBeNull()
  const image = findFirstImage(iconRow)
  expect(image).not.toBeNull()
  expect(image!.getIconName()).toBe("view-list-symbolic")
  expect(findPresentationBox(iconRow)).toBeNull()

  // count row: the badge label shows the count...
  expect(screen.getByText("7")).toBeTruthy()
  // ...but a row with count: 0 shows no "0" badge at all.
  expect(screen.queryByText("0")).toBeNull()

  // colored row: a presentation-role box prefix (the color dot) — icon and
  // color are mutually exclusive, so this row's own iconName is never set.
  const colorRow = list!.getRowAtIndex(1)
  expect(colorRow).not.toBeNull()
  expect(findPresentationBox(colorRow)).not.toBeNull()

  // Every row is a real AdwActionRow (accessible as a list item, titled).
  const rows = await screen.findAllByRole(Gtk.AccessibleRole.LIST_ITEM)
  expect(rows.length).toBe(4)
})
