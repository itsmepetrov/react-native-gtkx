// createSidebarNavigator's collapseWidth — tasks-app's second complaint,
// "no collapse at narrow widths". Verifies the native AdwBreakpoint
// mechanism (task 001) actually drives the navigator's own split view, and
// the follow-on UX fix: re-clicking an already-selected row after the
// native back button hid content must show it again, which needs
// row-activated (fires on every click) rather than row-selected (fires
// only on a selection CHANGE) — found while writing this test.
//
// The collapsed-pane two-way sync (below): a plain programmatic
// navigate() — no row click involved at all — must reveal content just
// like a click does; the split view's own back affordance must be
// observable as `sidebarShown`, without moving react-navigation state; and
// the pane/selection must survive an expand/re-collapse round trip
// unchanged, by the widget's own design. See
// docs/research/navigation-extensibility.md for the evidence these were
// gathered from and src/navigation/sidebar.tsx's file header for the
// protocol.
import * as Adw from "@gtkx/gi/adw"
import { fireEvent, render, screen, waitFor } from "@gtkx/testing"
import {
  CommonActions,
  createNavigationContainerRef,
  NavigationContainer,
  type ParamListBase,
} from "@react-navigation/native"
import { useEffect } from "react"
import { expect, it } from "vitest"
import { Gtk } from "../../../src/gtk"
import { type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Text, View } from "../../../src/index"
import {
  createSidebarNavigator,
  type SidebarScreenProps,
} from "../../../src/navigation/index"

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

const findBreakpointBin = (
  widget: GtkNs.Widget | null,
): InstanceType<typeof Adw.BreakpointBin> | null => {
  if (!widget) {
    return null
  }
  if (widget instanceof Adw.BreakpointBin) {
    return widget
  }
  for (
    let child = widget.getFirstChild();
    child;
    child = child.getNextSibling()
  ) {
    const found = findBreakpointBin(child)
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

// Rows carrying an icon/color/count render as AdwActionRow rather than the
// plain GtkListBoxRow the Harness above gets — which is where the reported
// "the focused section cannot be opened" bug lived, so the tests for it use
// this shape (examples/tasks-nav's shape) rather than the bare one.
const RichHarness = ({
  minWidth,
  customRow,
}: {
  minWidth?: number
  customRow?: boolean
}) => (
  <NavigationContainer>
    <Sidebar.Navigator
      sidebarTitle="Collapsible"
      collapseWidth={500}
      minWidth={minWidth}
    >
      <Sidebar.Screen
        name="first"
        component={FirstScreen}
        options={{
          title: "First",
          icon: "view-list-symbolic",
          count: 3,
          ...(customRow
            ? { sidebarRow: () => <Text>custom first row</Text> }
            : {}),
        }}
      />
      <Sidebar.Screen
        name="second"
        component={SecondScreen}
        options={{ title: "Second", icon: "starred-symbolic", count: 1 }}
      />
      <Sidebar.Screen
        name="third"
        component={SecondScreen}
        options={{ title: "Third" }}
      />
    </Sidebar.Navigator>
  </NavigationContainer>
)

it("keeps every sidebar row activatable, whatever it is rendered as", async () => {
  // The precondition the collapsed reveal rides on, and the one this
  // navigator silently lost: GtkListBox emits row-activated ONLY for rows
  // where gtk_list_box_row_get_activatable() is true, and AdwActionRow —
  // what a row with an icon/color/count renders as — defaults it to FALSE.
  // A plain GtkListBoxRow defaults it to true, which is why examples/gallery
  // (title-only rows) never showed the bug and examples/tasks-nav did.
  const { container } = await render(<RichHarness customRow />)
  const window = container as GtkNs.Window
  await waitFor(() => {
    expect(screen.getByText("first section body")).toBeTruthy()
  })
  const list = findListBox(window.getChild())!
  // 0: a custom sidebarRow (plain GtkListBoxRow wrapper), 1: AdwActionRow
  // (icon + count), 2: the compact title-only GtkListBoxRow.
  for (const index of [0, 1, 2]) {
    expect(list.getRowAtIndex(index)!.getActivatable()).toBe(true)
  }
})

it("opens the already-focused section while collapsed, through GTK's own row activation", async () => {
  // The reported bug, at the level a real click actually works at: rather
  // than emitting row-activated on the list (which bypasses the very check
  // that was failing), this goes through GtkListBoxRow::activate — the
  // signal whose default handler calls gtk_list_box_select_and_activate(),
  // the same internal path GtkListBox's click gesture takes, including the
  // activatable gate. On a cold start at a collapsed width the FOCUSED row
  // is the one already selected, so nothing else can reveal content for it:
  // the state.index effect cannot fire (state does not change) and
  // row-selected does not refire without a selection change.
  const { container } = await render(<RichHarness />)
  const window = container as GtkNs.Window
  await waitFor(() => {
    expect(screen.getByText("first section body")).toBeTruthy()
  })
  const splitView = findSplitView(window.getChild())!
  const list = findListBox(window.getChild())!

  window.setVisible(false)
  window.setDefaultSize(400, 400)
  window.present()
  await waitFor(() => {
    expect(splitView.getCollapsed()).toBe(true)
  })
  // A fresh collapse shows the sidebar, deliberately (see
  // docs/research/navigation-extensibility.md) — the focused row is
  // selected but its content is not on screen.
  expect(splitView.getShowContent()).toBe(false)
  const focusedRow = list.getRowAtIndex(0)!
  expect(list.getSelectedRow()).toBe(focusedRow)

  await fireEvent(focusedRow, "activate")
  await waitFor(() => {
    expect(splitView.getShowContent()).toBe(true)
  })
  // Still the same route: this reveals a pane, it does not navigate.
  expect(list.getSelectedRow()).toBe(focusedRow)
  expect(screen.getByText("first section body")).toBeTruthy()
})

it("gives the breakpoint bin a minimum size, so the window cannot shrink past the pane", async () => {
  // Adwaita cannot measure a breakpoint bin (its content changes with the
  // breakpoints): it reports a minimum of zero and warns. Left at zero the
  // window can be dragged narrower than the content pane can draw, and
  // Adwaita over-allocates and CLIPS it — seen as the task list running off
  // the right edge in examples/tasks-nav, and logged as
  // "AdwNavigationSplitView exceeds AdwBreakpointBin width".
  const { container } = await render(<RichHarness />)
  const window = container as GtkNs.Window
  await waitFor(() => {
    expect(screen.getByText("first section body")).toBeTruthy()
  })
  const bin = findBreakpointBin(window.getChild())
  expect(bin).not.toBeNull()
  expect(bin!.widthRequest).toBe(360)
  expect(bin!.heightRequest).toBe(294)
  // The size request IS the bin's minimum — its own measure() contributes
  // nothing, so this is the whole floor, not one input to it.
  const [minWidth] = bin!.measure(
    Gtk.Orientation.HORIZONTAL,
    -1,
  ) as unknown as [number, number]
  expect(minWidth).toBe(360)
})

it("lets an app raise the minimum to what its own chrome needs", async () => {
  // examples/tasks-nav does exactly this: its collapsed content HeaderBar
  // asks for 469px (a segmented control as headerTitle cannot ellipsize the
  // way a title label does), so 360 would still clip it.
  const { container } = await render(<RichHarness minWidth={480} />)
  const window = container as GtkNs.Window
  await waitFor(() => {
    expect(screen.getByText("first section body")).toBeTruthy()
  })
  const bin = findBreakpointBin(window.getChild())!
  const [minWidth] = bin.measure(Gtk.Orientation.HORIZONTAL, -1) as unknown as [
    number,
    number,
  ]
  expect(minWidth).toBe(480)
})

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

it("reveals content for a programmatic navigate() too, not just a row click", async () => {
  // Found empirically while gathering evidence for this fix: the
  // state.index effect re-selected the ROW for a programmatic navigate(),
  // but never told the split view to show it — a real, reproducible way to
  // land exactly on the reported bug (state changes, pane keeps showing
  // the sidebar) without any row click in the loop at all.
  const navigationRef = createNavigationContainerRef()
  const { container } = await render(
    <NavigationContainer ref={navigationRef}>
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
    </NavigationContainer>,
  )
  const window = container as GtkNs.Window
  await waitFor(() => {
    expect(screen.getByText("first section body")).toBeTruthy()
  })
  const splitView = findSplitView(window.getChild())
  expect(splitView).not.toBeNull()

  window.setVisible(false)
  window.setDefaultSize(400, 400)
  window.present()
  await waitFor(() => {
    expect(splitView!.getCollapsed()).toBe(true)
  })
  expect(splitView!.getShowContent()).toBe(false)

  navigationRef.current?.dispatch(CommonActions.navigate("second"))
  await waitFor(() => {
    expect(screen.getByText("second section body")).toBeTruthy()
  })
  await waitFor(() => {
    expect(splitView!.getShowContent()).toBe(true)
  })
})

it("emits sidebarShown for the native back affordance, without moving react-navigation state", async () => {
  const events: string[] = []
  // The listener lives on "second", not "first": the event is emitted with
  // `target` set to the CURRENTLY ACTIVE route (see sidebar.tsx's
  // handleShowContentChanged), and this test selects "second" before
  // triggering the native back affordance — a listener on the wrong screen
  // would never see it, which is itself worth guarding against (a stray
  // `target` bug would fail this test by timeout, not silently pass).
  const SecondScreenWithListener = ({
    navigation,
  }: SidebarScreenProps<ParamListBase, "second">) => {
    useEffect(
      () =>
        navigation.addListener("sidebarShown", () => {
          events.push("second:sidebarShown")
        }),
      [navigation],
    )
    return (
      <View style={{ flex: 1 }}>
        <Text>second section body</Text>
      </View>
    )
  }

  const { container } = await render(
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
          component={SecondScreenWithListener}
          options={{ title: "Second" }}
        />
      </Sidebar.Navigator>
    </NavigationContainer>,
  )
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

  // Reveal content first (a row click) — a legitimate forward write, which
  // must NOT itself be reported as a "back" event. `selectRow` is the real
  // GTK selection call (the same one the state.index effect makes), so it
  // both dispatches jumpTo through onRowSelected AND — unlike a bare
  // row-activated fireEvent — actually moves the widget's own selection,
  // which the assertion below on getSelectedRow() depends on.
  const secondRow = list!.getRowAtIndex(1)!
  list!.selectRow(secondRow)
  await fireEvent(list!, "row-activated", secondRow)
  await waitFor(() => {
    expect(splitView!.getShowContent()).toBe(true)
  })
  expect(events).toEqual([])

  // The native back affordance: exactly what the Adwaita back button,
  // Escape or the back gesture do to the widget — no navigation.dispatch,
  // no row interaction, nothing react-navigation-shaped at all.
  splitView!.setShowContent(false)
  await waitFor(() => {
    expect(events).toEqual(["second:sidebarShown"])
  })
  // The whole point of this event: TabRouter's state never moved. The
  // second route is still focused (its row is still selected) — only the
  // PANE changed, so there is nothing for react-navigation to desync.
  expect(list!.getSelectedRow()?.getIndex()).toBe(secondRow.getIndex())
})

it("keeps the pane and the selection across an expand/re-collapse round trip", async () => {
  // Evidence for the "does show-content need resetting on expand" question
  // (see docs/research/navigation-extensibility.md): it does not.
  // AdwNavigationSplitView leaves showContent exactly where the last write
  // left it, uncollapsed or not — the same size-class persistence a mobile
  // master-detail app relies on (open an item, rotate to landscape and
  // back, still on that item) — so there is nothing for this navigator to
  // reset.
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
  // Nothing has navigated yet: a fresh collapse defaults to the sidebar,
  // not the content pane — confirmed empirically, not assumed.
  expect(splitView!.getShowContent()).toBe(false)

  const secondRow = list!.getRowAtIndex(1)!
  list!.selectRow(secondRow)
  await fireEvent(list!, "row-activated", secondRow)
  await waitFor(() => {
    expect(splitView!.getShowContent()).toBe(true)
  })

  window.setVisible(false)
  window.setDefaultSize(800, 600)
  window.present()
  await waitFor(() => {
    expect(splitView!.getCollapsed()).toBe(false)
  })
  expect(list!.getSelectedRow()?.getIndex()).toBe(secondRow.getIndex())

  window.setVisible(false)
  window.setDefaultSize(400, 400)
  window.present()
  await waitFor(() => {
    expect(splitView!.getCollapsed()).toBe(true)
  })
  // Re-collapsing goes straight back to content, matching the widget's own
  // "last used view" persistence — no reset, by design.
  expect(splitView!.getShowContent()).toBe(true)
  expect(list!.getSelectedRow()?.getIndex()).toBe(secondRow.getIndex())
})
