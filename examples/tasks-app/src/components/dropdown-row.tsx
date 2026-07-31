// WORKAROUND: the gtkx tutorial's Preferences screen uses
// `@gtkx/components`'s generic `<DropDown component={AdwComboRow} items=…
// selectedId=… onSelectionChanged=… />` — another package this repository
// does not depend on (see src/toast.tsx for the same situation with
// `@gtkx/components/adw`). AdwComboRow itself is a real, already-reachable
// react-native-gtkx/adw export; what's missing is only the small id/value
// list bookkeeping the upstream helper did generically. A one-off local
// version, scoped to this screen's two dropdowns, is simpler than
// reimplementing the general helper.
import { useMemo } from "react"
import { AdwComboRow } from "react-native-gtkx/adw"
import { Gtk } from "react-native-gtkx/gtk"

export type DropDownItem<Id extends string> = { id: Id; value: string }

export const DropDownRow = <Id extends string>({
  title,
  items,
  selectedId,
  onSelectionChanged,
}: {
  title: string
  items: DropDownItem<Id>[]
  selectedId: Id
  onSelectionChanged: (id: Id) => void
}) => {
  const model = useMemo(
    () => Gtk.StringList.new(items.map((item) => item.value)),
    // items are a fixed literal list per call site — only rebuild if the
    // set of choices itself ever changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.length],
  )
  const selected = items.findIndex((item) => item.id === selectedId)

  return (
    <AdwComboRow
      title={title}
      model={model}
      selected={selected < 0 ? 0 : selected}
      onNotifySelected={(index) => {
        const item = items[index ?? 0]
        if (item) {
          onSelectionChanged(item.id)
        }
      }}
    />
  )
}
