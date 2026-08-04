// Walks EVERY generated widget export and mounts it inside a <View> — the
// whole promise of react-native-gtkx/gtk and /adw is that a wrapped widget
// joins RN layout, and without this test that promise would be 350 untested
// claims rather than one. Widgets that cannot mount without props this test
// does not know how to provide are named in SKIP, with a reason each,
// instead of silently narrowing the walk.
//
// TWO GTK LOG LINES THIS WALK PROVOKES ARE UPSTREAM DEFECTS, NOT OURS.
// Both were chased once, in the VM, by printing a marker around every mount
// so each line could be attributed to the widget that causes it — do not
// chase them again, and do not read them as a defect of the layout code:
//
// - `AdwWrapBox 0x… (wrap-box) reported min height -12, but sizes must be
//   >= 0` — provoked by AdwShortcutsDialog, not by AdwWrapBox (which mounts
//   silently). An EMPTY shortcuts dialog has an internal wrap box whose line
//   count is zero, and libadwaita's "sum of the lines minus one line-spacing"
//   arithmetic returns -12 for it. Repro with no react-native-gtkx code at
//   all: `const w = new Adw.Window(); w.present(); new Adw.ShortcutsDialog()
//   .present(w)` warns during present(), before anything is measured; the
//   same dialog with one AdwShortcutsSection does not. Nothing of ours can
//   even observe the value: gtk_widget_measure() clamps a negative minimum
//   to 0 before returning it (checked with a JS layout manager that reports
//   -12 — the caller gets [0, 0]).
// - `gtk_widget_get_parent` + `gtk_widget_add_css_class: assertion
//   'GTK_IS_WIDGET (widget)' failed` — provoked by AdwButtonContent, 1.2 s
//   earlier in the log than the drag-icon line it looks like it belongs to.
//   AdwButtonContent is a helper for a button's child; rooted without a
//   button ancestor, libadwaita walks the parent chain past its top and
//   dereferences NULL. Repro with no react-native-gtkx code: a Gtk.Window
//   holding a Gtk.Box holding an Adw.ButtonContent, presented. In its
//   documented position it is silent, through our surface too:
//   <GtkButton><AdwButtonContent/></GtkButton> inside a <View> logs nothing.
import { render } from "@gtkx/testing"
import { type ComponentType } from "react"
import { describe, expect, it } from "vitest"
import { Adw } from "../../../src/adw"
import { ADW_WRAPPED_WIDGET_NAMES } from "../../../src/adw/widgets.generated"
import * as AdwWidgets from "../../../src/adw/widgets.generated"
import { GTK_WRAPPED_WIDGET_NAMES } from "../../../src/gtk/widgets.generated"
import * as GtkWidgets from "../../../src/gtk/widgets.generated"
import { Gtk } from "../../../src/gtkx/bridge/index"
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

// The walk above can only mount what the classifier decided to wrap, so a
// widget that must never be wrapped is invisible to it — this asserts the
// classifier's own toplevel rule instead, against the live GObject
// prototype chains rather than against the manifest it wrote itself.
describe("no toplevel is wrapped into RN layout", () => {
  it("wraps nothing that implements GtkRoot", () => {
    // A GtkRoot owns its surface and is presented by GTK, never parented.
    // Wrapping one puts it inside a GtkBox, and GTK refuses to lay it out:
    // "Unable to present a to the layout manager unknown auxiliary child
    // surface widget type GtkDragIcon" — GtkDragIcon being the one GtkRoot
    // that derives Gtk.Widget directly, which the earlier "derives
    // Gtk.Window" rule could not see.
    //
    // GObject interfaces are ordinary constructors in the @gtkx/gi binding
    // and take part in `instanceof`; the .d.ts exposes GtkRoot as a type
    // only, hence the namespace lookup.
    type Class = { prototype: object }
    const namespace = (ns: object): Record<string, Class | undefined> =>
      ns as unknown as Record<string, Class | undefined>
    const GtkRoot = namespace(Gtk).Root as unknown as abstract new () => object

    const roots: string[] = []
    const check = (names: readonly string[], prefix: string, ns: object) => {
      for (const name of names) {
        // A name that no longer resolves is the generator's problem, not
        // this test's — it exits with FATAL on exactly that.
        const cls = namespace(ns)[name.slice(prefix.length)]
        if (cls && cls.prototype instanceof GtkRoot) {
          roots.push(name)
        }
      }
    }
    check(GTK_WRAPPED_WIDGET_NAMES, "Gtk", Gtk)
    check(ADW_WRAPPED_WIDGET_NAMES, "Adw", Adw)
    expect(roots).toEqual([])
  })
})

describe("widget-surface skip list stays honest", () => {
  it("only names exports that actually exist", () => {
    const allNames = new Set([
      ...GTK_WRAPPED_WIDGET_NAMES,
      ...ADW_WRAPPED_WIDGET_NAMES,
    ])
    for (const name of Object.keys(SKIP)) {
      // Object.keys widens to string; the set is keyed by the generated
      // literal union, so narrow before asking.
      expect(
        allNames.has(name as (typeof GTK_WRAPPED_WIDGET_NAMES)[number]),
      ).toBe(true)
    }
  })
})
