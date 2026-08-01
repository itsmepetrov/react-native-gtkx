// A small id/value binding over AdwComboRow. The ready-made version of this
// (`<ComboRow items=… />`) lives in `@gtkx/components/adw`, a package this
// repository does not depend on;
// AdwComboRow itself is a plain react-native-gtkx/adw export, so only the
// list bookkeeping had to be written. Same one-off as
// examples/tasks-app's own dropdown-row.tsx.
import { useMemo } from "react"
import { AdwComboRow } from "react-native-gtkx/adw"
import { Gtk } from "react-native-gtkx/gtk"

export type DropDownItem<Id extends string> = { id: Id; value: string }

export const DropDownRow = <Id extends string>({
  title,
  subtitle,
  items,
  selectedId,
  onSelectionChanged,
}: {
  title: string
  subtitle?: string
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
      subtitle={subtitle}
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
