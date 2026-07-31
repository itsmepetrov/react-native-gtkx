// Placeholder — replaced by the task list / task detail split in the next
// commits. Kept as its own component so window.tsx never has to change
// again once the real content lands.
import {
  AdwHeaderBar,
  AdwToolbarView,
  AdwWindowTitle,
} from "react-native-gtkx/adw"
import { useStore } from "../store/index"
import { selectionTitle } from "../store/selectors"

export const ContentPane = () => {
  const lists = useStore((state) => state.lists)
  const selection = useStore((state) => state.selection)

  return (
    <AdwToolbarView
      topBar={
        <AdwHeaderBar
          titleWidget={
            <AdwWindowTitle title={selectionTitle(selection, lists)} />
          }
        />
      }
    />
  )
}
