// Smoke coverage for the "not a widget, but a real JSX building block"
// re-exports added in gtkx/bridge/index.ts: GSimpleAction/GMenu (Gio),
// AdwBreakpoint (Adw), GtkTextBuffer/GtkAdjustment/GtkShortcut/
// GtkShortcutController/GtkDragSource/GtkDropTarget (Gtk). Each of these
// was in the widget-surface generator's "notAWidget" bucket and therefore
// unreachable through react-native-gtkx/gtk or /adw before this file's
// counterpart change — the goal here is "imports, mounts, the prop it
// carries actually does something", not full behavioral coverage (drag
// reorder and shortcut controllers get their real workout in
// examples/tasks-app).
import { render, screen, userEvent, waitFor } from "@gtkx/testing"
import { createRef } from "react"
import { expect, it } from "vitest"
import {
  AdwBreakpointBin,
  AdwToggleGroup,
} from "../../../src/adw/widgets.generated"
import {
  Adw,
  AdwBreakpoint,
  AdwToggle,
  Gdk,
  GMenu,
  GObject,
  GSimpleAction,
  Gtk,
  GtkAdjustment,
  GtkApplicationWindow,
  GtkBox,
  GtkDragSource,
  GtkDropTarget,
  GtkMenuButton,
  GtkScale,
  GtkShortcut,
  GtkShortcutController,
  GtkTextBuffer,
  GtkTextView,
  rootElement,
} from "../../../src/gtkx/bridge/index"

it("activates a GSimpleAction registered through a widget's actions prop", async () => {
  const windowRef = createRef<Gtk.ApplicationWindow | null>()
  let activated = 0

  await render(
    <GtkApplicationWindow
      ref={windowRef}
      actions={
        <GSimpleAction
          name="ping"
          onActivate={() => {
            activated += 1
          }}
        />
      }
    />,
    { container: rootElement },
  )

  windowRef.current!.activateAction("win.ping", null)

  expect(activated).toBe(1)
})

it("mounts a GMenu inside a GtkMenuButton's menuModel without crashing", async () => {
  await render(
    <GtkMenuButton
      label="Menu"
      menuModel={
        <GMenu items={[{ section: [{ label: "Item", action: "win.ping" }] }]} />
      }
    />,
  )

  expect(await screen.findByText("Menu")).toBeTruthy()
})

// KNOWN LIMITATION, recorded rather than papered over (see
// docs/research/navigation-extensibility.md and
// .claude/epics/tasks-app/updates/001/progress.md for the write-up): a real
// AdwBreakpoint never fires onApply/onUnapply in this headless-sway gtk test
// harness, even though every step up to the condition check is verified
// working here — the JSX `breakpoints` prop forwards the element, the window
// presents, the bin gets a real non-zero allocation, and
// tests/gtk/components/window-root.gtk.test.tsx's own resizeViaCompositor
// helper (swaymsg) genuinely resizes it down to the "max-width" threshold
// (confirmed via widget.getWidth() before and after) — with both `sp` and
// `px` condition units, and even bypassing the JSX layer entirely for a
// direct `Adw.Breakpoint.new(condition)` + `bin.addBreakpoint()` +
// `breakpoint.connect("apply", …)`. Every one of those behaves identically:
// the condition is simply never evaluated as true. Whether this is specific
// to the @gtkx/vitest headless sway compositor (no fractional-scale/
// xdg-output protocol, or some other missing piece `Adw.BreakpointCondition`
// needs) or a genuine gtkx rc.2 gap is still open — examples/tasks-app is
// where it gets a real GNOME session to run in, and that is the actual
// authority on whether AdwBreakpoint works on this platform at all.
it("mounts an AdwBreakpoint through a bin's breakpoints prop without crashing", async () => {
  const windowRef = createRef<Gtk.ApplicationWindow | null>()
  const binRef = createRef<Adw.BreakpointBin | null>()

  await render(
    <GtkApplicationWindow
      ref={windowRef}
      defaultWidth={500}
      defaultHeight={400}
    >
      {/* AdwBreakpoint is not a regular child — it goes through the bin's
          own `breakpoints` prop, exactly like AdwApplicationWindow's. */}
      <AdwBreakpointBin
        ref={binRef}
        vexpand
        // Required by Adwaita whenever a breakpoint is attached — see
        // sidebar.tsx's own AdwBreakpointBin usage: this bin's size in the
        // test is unrelated to the value, only the "does not have a minimum
        // size" warning cares that it's set, and 1 (not 0) is what actually
        // reaches GTK through the current @gtkx property diffing.
        widthRequest={1}
        heightRequest={1}
        breakpoints={
          <AdwBreakpoint
            condition={Adw.BreakpointCondition.parse("max-width: 350px")}
            onApply={() => {}}
            onUnapply={() => {}}
          />
        }
      />
    </GtkApplicationWindow>,
    { container: rootElement },
  )

  windowRef.current!.present()
  await waitFor(() => {
    expect(binRef.current!.getWidth()).toBeGreaterThan(0)
  })
})

it("renders a GtkTextBuffer's initial text and reports edits through onChanged", async () => {
  const viewRef = createRef<Gtk.TextView | null>()
  let lastText: string | null = null

  await render(
    <GtkTextView
      ref={viewRef}
      buffer={
        <GtkTextBuffer
          text="hello"
          onChanged={(buffer) => {
            lastText = buffer.getText(
              buffer.getStartIter(),
              buffer.getEndIter(),
              false,
            )
          }}
        />
      }
    />,
  )

  const buffer = viewRef.current!.getBuffer()
  expect(
    buffer.getText(buffer.getStartIter(), buffer.getEndIter(), false),
  ).toBe("hello")

  buffer.setText("hello world", -1)

  expect(lastText).toBe("hello world")
})

it("drives a GtkScale from a declarative GtkAdjustment", async () => {
  const scaleRef = createRef<Gtk.Scale | null>()

  await render(
    <GtkScale
      ref={scaleRef}
      adjustment={
        <GtkAdjustment
          lower={0}
          upper={100}
          value={42}
        />
      }
    />,
  )

  expect(scaleRef.current!.getAdjustment().getValue()).toBe(42)
})

it("fires a GtkShortcut's callback action through a GtkShortcutController", async () => {
  const boxRef = createRef<Gtk.Box | null>()
  let triggered = 0

  await render(
    <GtkBox
      ref={boxRef}
      canFocus
      focusable
      controllers={
        <GtkShortcutController
          shortcuts={
            <GtkShortcut
              trigger={Gtk.ShortcutTrigger.parseString("<Control>k")}
              action={Gtk.CallbackAction.new(() => {
                triggered += 1
                return true
              })}
            />
          }
        />
      }
    />,
  )

  boxRef.current!.grabFocus()
  await userEvent.keyboard(boxRef.current!, "{Control>}k{/Control}")

  expect(triggered).toBe(1)
})

it("carries a drag from a GtkDragSource to a GtkDropTarget", async () => {
  const sourceRef = createRef<Gtk.Box | null>()
  const targetRef = createRef<Gtk.Box | null>()
  let dropped: string | null = null

  await render(
    <>
      <GtkBox
        ref={sourceRef}
        widthRequest={40}
        heightRequest={40}
        controllers={
          <GtkDragSource
            actions={Gdk.DragAction.MOVE}
            onPrepare={() =>
              Gdk.ContentProvider.newForValue(
                GObject.buildValue(GObject.TYPE_STRING, (value) =>
                  value.setString("payload"),
                ),
              )
            }
          />
        }
      />
      <GtkBox
        ref={targetRef}
        widthRequest={40}
        heightRequest={40}
        controllers={
          <GtkDropTarget
            actions={Gdk.DragAction.MOVE}
            types={[GObject.TYPE_STRING]}
            onDrop={(value) => {
              dropped = value.getString()
              return true
            }}
          />
        }
      />
    </>,
  )

  await userEvent.dragAndDrop(sourceRef.current!, targetRef.current!, "payload")

  expect(dropped).toBe("payload")
})

it("switches AdwToggleGroup's active option through its AdwToggle children", async () => {
  const groupRef = createRef<Adw.ToggleGroup | null>()
  const seen: (string | null)[] = []

  await render(
    <AdwToggleGroup
      ref={groupRef}
      activeName="all"
      onNotifyActiveName={(name) => seen.push(name ?? null)}
    >
      <AdwToggle
        name="all"
        label="All"
      />
      <AdwToggle
        name="open"
        label="Open"
      />
    </AdwToggleGroup>,
  )

  groupRef.current!.setActiveName("open")

  // onNotifyActiveName also fires once for the initial value on mount —
  // only the last emission reflects the programmatic change above.
  expect(seen.at(-1)).toBe("open")
})
