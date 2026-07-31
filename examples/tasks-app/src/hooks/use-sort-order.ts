// Sort order backed by the GSettings enum key — ported from the gtkx
// tutorial (examples/tutorial/src/hooks/use-sort-order.ts). useSetting
// comes from react-native-gtkx/gtk (see docs/platform-layer.md#gsettings);
// the schema import resolves through the gtkx:settings vite plugin, which
// ships inside @gtkx/cli and is active for free on the gtkx dev/build
// toolchain this example uses.
import schema from "#data/dev.rngtkx.tasks.gschema.xml"
import { useSetting } from "react-native-gtkx/gtk"
import { SortValue, type SortOrder } from "../types"

export const useSortOrder = (): [SortOrder, (order: SortOrder) => void] => {
  const [value, setValue] = useSetting(schema, "sort-order")
  return [SortValue[value] as SortOrder, (order) => setValue(SortValue[order])]
}
