// Walks EVERY generated widget export and mounts it inside a <View> — the
// whole promise of react-native-gtkx/gtk and /adw is that a wrapped widget
// joins RN layout, and without this test that promise would be 350 untested
// claims rather than one. Widgets that cannot mount without props this test
// does not know how to provide are named in SKIP, with a reason each,
// instead of silently narrowing the walk.
import { render } from "@gtkx/testing"
import { type ComponentType } from "react"
import { describe, expect, it } from "vitest"
import { ADW_WRAPPED_WIDGET_NAMES } from "../../../src/adw/widgets.generated"
import * as AdwWidgets from "../../../src/adw/widgets.generated"
import { GTK_WRAPPED_WIDGET_NAMES } from "../../../src/gtk/widgets.generated"
import * as GtkWidgets from "../../../src/gtk/widgets.generated"
import { Root, View } from "../../../src/index"

// Verified empirically (see .claude/epics/widget-surface/updates/ for the
// run log): these throw or hang when mounted with zero configuration. Each
// is a widget that needs a model, a controller, or another widget as a
// construct-time collaborator — a documented gap, not a silent one.
const SKIP: Record<string, string> = {
  AdwLayoutSlot:
    'requires a construct-time "id" matching a slot an AdwMultiLayoutView\'s layout defines — without one, Adwaita raises a fatal g_error (aborts the process, not a catchable JS exception)',
}

type Case = { name: string; Component: ComponentType<{ style?: unknown }> }

const gtkCases: Case[] = GTK_WRAPPED_WIDGET_NAMES.map((name) => ({
  name,
  Component: (GtkWidgets as unknown as Record<string, Case["Component"]>)[
    name
  ]!,
}))
const adwCases: Case[] = ADW_WRAPPED_WIDGET_NAMES.map((name) => ({
  name,
  Component: (AdwWidgets as unknown as Record<string, Case["Component"]>)[
    name
  ]!,
}))

const runnable = [...gtkCases, ...adwCases].filter((c) => !(c.name in SKIP))

describe("generated widget surface mounts inside RN layout", () => {
  it.each(runnable)("$name mounts inside a <View>", async ({ Component }) => {
    await render(
      <Root
        width={200}
        height={200}
      >
        <View style={{ padding: 8 }}>
          <Component style={{ width: 48, height: 48 }} />
        </View>
      </Root>,
    )
  })
})

describe("widget-surface skip list stays honest", () => {
  it("only names exports that actually exist", () => {
    const allNames = new Set([
      ...GTK_WRAPPED_WIDGET_NAMES,
      ...ADW_WRAPPED_WIDGET_NAMES,
    ])
    for (const name of Object.keys(SKIP)) {
      expect(allNames.has(name)).toBe(true)
    }
  })
})
