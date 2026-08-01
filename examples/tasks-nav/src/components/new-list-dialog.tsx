// "New List": a name and a color, the same dialog examples/tasks-app puts
// behind the sidebar header's +.
//
// This replaces what the example used to do — add `List 3` in the next
// palette color the instant the button was pressed, with no dialog at all.
// That was a deliberate simplification while the point being proven was
// only that `createSidebarNavigator` tolerates a screen set that changes at
// runtime. It still proves that; the list just has a name the user chose.
import { useState } from "react"
import { Adw, AdwAlertDialog } from "react-native-gtkx/adw"
import { Gtk, GtkBox, GtkEntry, GtkToggleButton } from "react-native-gtkx/gtk"
import { LIST_COLOR_PALETTE, useStore } from "../store"
import { listDot } from "../styles"

export const NewListDialog = () => {
  const { addList, showDialog } = useStore()
  const [name, setName] = useState("")
  const [color, setColor] = useState(LIST_COLOR_PALETTE[0]!)
  // The swatches are one radio GROUP, so picking one visually releases the
  // others. GtkToggleButton groups by pointing every member at the first,
  // which means the first has to exist as a real widget before the rest can
  // join it — hence a state-held ref rather than a plain `useRef`, so the
  // render that creates it schedules the render that groups the others.
  const [firstSwatch, setFirstSwatch] = useState<Gtk.ToggleButton | null>(null)

  return (
    <AdwAlertDialog
      heading="New List"
      defaultResponse="add"
      closeResponse="cancel"
      responses={[
        { id: "cancel", label: "Cancel" },
        {
          id: "add",
          label: "Add",
          appearance: Adw.ResponseAppearance.SUGGESTED,
        },
      ]}
      onResponse={(id) => {
        if (id === "add") {
          // An empty name is rejected by the store rather than here, so the
          // rule holds for every caller (see store.ts's `addList`).
          addList(name, color)
        }
        showDialog("none")
      }}
      // `extraChild`, NOT children. An AdwAlertDialog composes its own
      // layout — heading, body, response buttons — into `Adw.Dialog:child`,
      // which is what plain children bind to, so passing children REPLACES
      // that whole layout with them: the dialog came up as a bare entry and
      // six swatches, with no "New List" heading and no Cancel/Add buttons
      // at all. `extra-child` is libadwaita's own slot for exactly this,
      // and it slots between the body and the responses. Found live — a
      // headless test would have had to assert on the heading to catch it.
      extraChild={
        <GtkBox
          orientation={Gtk.Orientation.VERTICAL}
          spacing={16}
          marginTop={8}
        >
          <GtkEntry
            placeholderText="List name"
            // Enter in the field is the same as pressing Add — the dialog's
            // `defaultResponse`.
            activatesDefault
            onChanged={(self) => setName(self.text)}
          />
          <GtkBox
            spacing={6}
            halign={Gtk.Align.CENTER}
          >
            {LIST_COLOR_PALETTE.map((swatch, index) => (
              <GtkToggleButton
                key={swatch}
                ref={index === 0 ? setFirstSwatch : undefined}
                group={index === 0 ? undefined : firstSwatch}
                active={color === swatch}
                cssClasses={["flat"]}
                accessibleLabel={`Color ${swatch}`}
                onClicked={() => setColor(swatch)}
              >
                <GtkBox
                  widthRequest={22}
                  heightRequest={22}
                  cssClasses={[listDot(swatch)]}
                  accessibleRole={Gtk.AccessibleRole.PRESENTATION}
                />
              </GtkToggleButton>
            ))}
          </GtkBox>
        </GtkBox>
      }
    />
  )
}
