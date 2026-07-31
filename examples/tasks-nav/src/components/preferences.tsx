// Preferences: the two settings this app actually has. Reminders and their
// lead time are examples/tasks-app's demo, not this one's (see README).
import schema from "#data/dev.rngtkx.tasksnav.gschema.xml"
import {
  AdwPreferencesDialog,
  AdwPreferencesGroup,
  AdwPreferencesPage,
} from "react-native-gtkx/adw"
import { useSetting } from "react-native-gtkx/gtk"
import { useSortOrder } from "../hooks/use-sort-order"
import type { SortOrder } from "../types"
import { DropDownRow } from "./dropdown-row"

type Scheme = "default" | "light" | "dark"

const isScheme = (value: string): value is Scheme =>
  value === "default" || value === "light" || value === "dark"

const isSort = (value: string): value is SortOrder =>
  value === "manual" ||
  value === "due-date" ||
  value === "title" ||
  value === "created"

export const Preferences = ({ onClose }: { onClose: () => void }) => {
  const [scheme, setScheme] = useSetting(schema, "color-scheme")
  const [sortOrder, setSortOrder] = useSortOrder()

  return (
    <AdwPreferencesDialog
      onClosed={onClose}
      title="Preferences"
    >
      <AdwPreferencesPage
        title="General"
        iconName="preferences-system-symbolic"
      >
        <AdwPreferencesGroup title="Appearance">
          <DropDownRow
            title="Theme"
            items={[
              { id: "default", value: "Follow system" },
              { id: "light", value: "Light" },
              { id: "dark", value: "Dark" },
            ]}
            selectedId={scheme}
            onSelectionChanged={(id) => {
              if (isScheme(id)) {
                setScheme(id)
              }
            }}
          />
        </AdwPreferencesGroup>
        <AdwPreferencesGroup title="Tasks">
          <DropDownRow
            title="Sort order"
            subtitle="Rows can only be dragged into a new order under Manual"
            items={[
              { id: "manual", value: "Manual" },
              { id: "due-date", value: "Due date" },
              { id: "title", value: "Title" },
              { id: "created", value: "Date created" },
            ]}
            selectedId={sortOrder}
            onSelectionChanged={(id) => {
              if (isSort(id)) {
                setSortOrder(id)
              }
            }}
          />
        </AdwPreferencesGroup>
      </AdwPreferencesPage>
    </AdwPreferencesDialog>
  )
}
