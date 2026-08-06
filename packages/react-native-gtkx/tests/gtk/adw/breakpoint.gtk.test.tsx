// Adw.Breakpoint + Adw.BreakpointBin — the native size-threshold mechanism
// createSidebarNavigator's collapseWidth is built on (see
// docs/architecture/layout-and-styling.md, "Two ways to react to size").
// This file proves the
// primitive works BEFORE any navigator code depends on it:
//
// - Adw.Breakpoint is not a Gtk.Widget (verified, not assumed from the GIR
//   docs alone — see the classify.mjs comment in src/gtkx/bridge/index.ts),
//   so it stays a raw, hand-exported element rather than a wrapped widget.
// - Breakpoint.addSetter needs a real boxed GObject.Value, not a bare JS
//   boolean — found empirically (a bare `true` fails a G_IS_VALUE assertion
//   on the native side).
// - The setter flips the target property through GObject directly, inside
//   GTK's own allocation pass, with no React commit for the flip itself.
import * as Adw from "@gtkx/gi/adw"
import * as GObject from "@gtkx/gi/gobject"
import { render, waitFor } from "@gtkx/testing"
import { expect, it } from "vitest"
import {
  AdwBreakpoint,
  AdwBreakpointBin,
  AdwNavigationPage,
  AdwNavigationSplitView,
} from "../../../src/adw/index"
import { SlotContent } from "../../../src/common"
import type { Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Text, View } from "../../../src/index"

const boxedBoolean = (value: boolean): InstanceType<typeof GObject.Value> => {
  const boxed = new GObject.Value()
  boxed.init(GObject.typeFromName("gboolean"))
  boxed.setBoolean(value)
  return boxed
}

it("Adw.Breakpoint flips a target widget property natively, both directions", async () => {
  let splitView: InstanceType<typeof Adw.NavigationSplitView> | null = null
  let breakpoint: InstanceType<typeof Adw.Breakpoint> | null = null

  const { container } = await render(
    <AdwBreakpointBin
      // Required by Adwaita whenever a breakpoint is attached — see
      // sidebar.tsx's own AdwBreakpointBin usage: this bin's size in the
      // test is unrelated to the value, only the "does not have a minimum
      // size" warning cares that it's set, and 1 (not 0) is what actually
      // reaches GTK through the current @gtkx property diffing.
      widthRequest={1}
      heightRequest={1}
      breakpoints={
        <AdwBreakpoint
          ref={(instance) => {
            breakpoint = instance
          }}
          condition={Adw.BreakpointCondition.newLength(
            Adw.BreakpointConditionLengthType.MAX_WIDTH,
            500,
            Adw.LengthUnit.SP,
          )}
        />
      }
    >
      <AdwNavigationSplitView
        ref={(instance) => {
          splitView = instance
        }}
        sidebar={
          <AdwNavigationPage title="Sidebar">
            <SlotContent>
              <View style={{ flex: 1 }}>
                <Text>sidebar body</Text>
              </View>
            </SlotContent>
          </AdwNavigationPage>
        }
      >
        <AdwNavigationPage title="Content">
          <SlotContent>
            <View style={{ flex: 1 }}>
              <Text>content body</Text>
            </View>
          </SlotContent>
        </AdwNavigationPage>
      </AdwNavigationSplitView>
    </AdwBreakpointBin>,
  )
  const window = container as GtkNs.Window

  await waitFor(() => {
    expect(splitView).not.toBeNull()
    expect(breakpoint).not.toBeNull()
  })

  // Registered once, targeting the split view INSIDE the bin — never the
  // bin itself (Adwaita's own restriction, see the file header comment).
  breakpoint!.addSetter(splitView!, "collapsed", boxedBoolean(true))

  expect(splitView!.getCollapsed()).toBe(false)

  // Map-time resize below the threshold — no compositor IPC needed, same
  // technique as tests/gtk/apis/dimensions.test.tsx.
  window.setVisible(false)
  window.setDefaultSize(400, 400)
  window.present()
  await waitFor(() => {
    expect(splitView!.getCollapsed()).toBe(true)
  })

  // …and back above it: the setter restores the ORIGINAL value it saw at
  // registration time (false), not merely "not true".
  window.setVisible(false)
  window.setDefaultSize(800, 600)
  window.present()
  await waitFor(() => {
    expect(splitView!.getCollapsed()).toBe(false)
  })
})
