// ported from the gtkx tutorial (examples/tutorial/src/components/new-list-dialog.tsx).
import { useState } from "react"
import { Adw, AdwAlertDialog } from "react-native-gtkx/adw"
import { Gtk, GtkBox, GtkEntry, GtkToggleButton } from "react-native-gtkx/gtk"
import { useStore } from "../store/index"
import { listDot } from "../styles"

const PALETTE = [
  "#3584e4",
  "#2ec27e",
  "#e66100",
  "#9141ac",
  "#e01b24",
  "#f5c211",
]

export const NewListDialog = () => {
  const addList = useStore((state) => state.addList)
  const showDialog = useStore((state) => state.showDialog)
  const [name, setName] = useState("")
  const [color, setColor] = useState("#3584e4")
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
          addList(name, color)
        }
        showDialog("none")
      }}
      // `children`, which for AdwAlertDialog specifically binds to
      // libadwaita's `extra-child` slot (shown between the body and the
      // response buttons), NOT `Adw.Dialog:child` the way it does for every
      // other Adw dialog type. gtkx 1.0 renamed the prop that carried this
      // from `extraChild` to plain `children` — the AdwAlertDialog element's
      // OWN behavior registry now claims the default slot and routes it to
      // `setExtraChild()` (node_modules/@gtkx/react/dist/adw/
      // element-behaviors.js's alertDialogExtraChild), rather than a bare
      // `Adw.Dialog:child` REPLACING the dialog's heading/body/responses the
      // way it would on any other dialog. Found live while porting this
      // dialog to examples/tasks-nav; this copy had the same defect, never
      // having been opened on screen.
    >
      <GtkBox
        orientation={Gtk.Orientation.VERTICAL}
        spacing={16}
        marginTop={8}
      >
        <GtkEntry
          placeholderText="List name"
          activatesDefault
          onChanged={(self) => setName(self.text)}
        />
        <GtkBox
          spacing={6}
          halign={Gtk.Align.CENTER}
        >
          {PALETTE.map((swatch, index) => (
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
    </AdwAlertDialog>
  )
}
