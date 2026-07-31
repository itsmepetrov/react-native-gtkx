// Sort order lives in GSettings rather than in the app's own store: it is a
// PREFERENCE (it should survive a restart, and it is what the Preferences
// dialog edits), not part of the document the app is editing. The schema
// import resolves through the gtkx:settings vite plugin that ships inside
// @gtkx/cli, active for free on the gtkx dev/build toolchain this example
// already uses; `useSetting` comes from react-native-gtkx/gtk (see
// docs/platform-layer.md#gsettings).
import schema from "#data/dev.rngtkx.tasksnav.gschema.xml"
import { useSetting } from "react-native-gtkx/gtk"
import { SortValue, type SortOrder } from "../types"

/** The enum key is an integer on the GSettings side and a nick everywhere
 *  in the app — SortValue is the two-way map between them. */
export const useSortOrder = (): [SortOrder, (order: SortOrder) => void] => {
  const [value, setValue] = useSetting(schema, "sort-order")
  return [SortValue[value] as SortOrder, (order) => setValue(SortValue[order])]
}
