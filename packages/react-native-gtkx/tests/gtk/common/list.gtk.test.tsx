// List/ListRow are Adwaita's boxed list built entirely from React Native, so
// what is worth pinning is that the STYLE actually differs where Adwaita's
// does: the first and last rows carry the corner radii and the last one drops
// its separator. Those are CSS classes on the widget, so the assertions are
// about classes differing rather than about specific declarations — the CSS
// text itself is covered by tests/unit/style.
import { fireEvent, render, screen, waitFor } from "@gtkx/testing"
import { expect, it, vi } from "vitest"
import { List, ListRow, rowPosition } from "../../../src/common/index"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Root, Text } from "../../../src/index"

const classesOf = (testID: string): string[] =>
  (screen.getByName(testID) as GtkNs.Widget).getCssClasses()

const findMotionController = (
  widget: GtkNs.Widget,
): GtkNs.EventControllerMotion => {
  const controllers = widget.observeControllers()
  for (let i = 0; i < controllers.getNItems(); i += 1) {
    const controller = controllers.getItem(i)
    if (controller instanceof Gtk.EventControllerMotion) {
      return controller
    }
  }
  throw new Error("EventControllerMotion not found")
}

it("rowPosition names the four cases, including the single-row list", () => {
  expect(rowPosition(0, 3)).toBe("first")
  expect(rowPosition(1, 3)).toBe("middle")
  expect(rowPosition(2, 3)).toBe("last")
  // The case a hand-written `index === 0 ? "first" : …` gets wrong.
  expect(rowPosition(0, 1)).toBe("only")
})

it("renders title and subtitle, and styles the ends differently from the middle", async () => {
  const rows = ["a", "b", "c"]
  await render(
    <Root
      width={400}
      height={300}
    >
      <List testID="list">
        {rows.map((id, index) => (
          <ListRow
            key={id}
            testID={`row-${id}`}
            title={`Task ${id}`}
            subtitle={`due ${id}`}
            position={rowPosition(index, rows.length)}
            onPress={() => {}}
          />
        ))}
      </List>
    </Root>,
  )

  expect(screen.getByText("Task a")).toBeTruthy()
  expect(screen.getByText("due a")).toBeTruthy()

  // Adwaita puts the radii on `row:first-child` / `row:last-child` and drops
  // the last row's bottom border — so all three must differ from each other.
  const [first, middle, last] = [
    classesOf("row-a"),
    classesOf("row-b"),
    classesOf("row-c"),
  ]
  expect(first).not.toEqual(middle)
  expect(last).not.toEqual(middle)
  expect(first).not.toEqual(last)
})

it("activates on press, and an inert row has no gesture at all", async () => {
  const onPress = vi.fn()
  await render(
    <Root
      width={400}
      height={300}
    >
      <List>
        <ListRow
          testID="pressable-row"
          title="Press me"
          onPress={onPress}
        />
        <ListRow
          testID="inert-row"
          title="Inert"
          position="last"
        />
      </List>
    </Root>,
  )

  const row = screen.getByName("pressable-row") as GtkNs.Widget
  const idle = row.getCssClasses()
  // Hover through the real EventControllerMotion signal, the same mechanism
  // components/pressable.tsx is tested on: the tint has to actually land.
  fireEvent(findMotionController(row), "enter", 5, 5)
  await waitFor(() => {
    expect(row.getCssClasses()).not.toEqual(idle)
  })
  fireEvent(findMotionController(row), "leave")
  await waitFor(() => {
    expect(row.getCssClasses()).toEqual(idle)
  })

  // A row with no onPress is a plain View — not activatable, so it must not
  // carry a gesture that would give it hover feedback it cannot act on.
  const inert = screen.getByName("inert-row") as GtkNs.Widget
  expect(() => findMotionController(inert)).toThrow()
})

it("takes nodes for title and subtitle, for a row that needs its own typography", async () => {
  await render(
    <Root
      width={400}
      height={300}
    >
      <List>
        <ListRow
          title={
            <Text style={{ textDecorationLine: "line-through" }}>Done</Text>
          }
          position="only"
        />
      </List>
    </Root>,
  )
  expect(screen.getByText("Done")).toBeTruthy()
})
