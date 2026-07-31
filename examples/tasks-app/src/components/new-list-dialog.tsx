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
