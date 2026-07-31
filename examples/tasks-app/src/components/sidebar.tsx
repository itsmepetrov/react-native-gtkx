// The sidebar pane: smart views (All Tasks/Today/Important), user lists,
// then Trash — ported from the gtkx tutorial
// (examples/tutorial/src/components/sidebar.tsx). Built directly on
// react-native-gtkx/gtk and /adw: a GtkListBox with the "navigation-sidebar"
// Adwaita style class, rows as AdwActionRow (native list-row chrome — icon
// or a colored dot as prefix, a count badge as suffix — RN has no
// equivalent primitive for this), selection kept in sync with the store in
// both directions, the same way the upstream tutorial's own useEffect does.
import { useEffect, useRef } from "react"
import { AdwActionRow } from "react-native-gtkx/adw"
import {
  Gtk,
  GtkBox,
  GtkImage,
  GtkLabel,
  GtkListBox,
  GtkScrolledWindow,
  type Gtk as GtkNs,
} from "react-native-gtkx/gtk"
import { useStore } from "../store/index"
import {
  selectionKey,
  sidebarCounts,
  type SidebarCounts,
} from "../store/selectors"
import { listDot } from "../styles"
import type { Selection, TaskList } from "../types"

type Entry = {
  selection: Selection
  title: string
  icon?: string
  color?: string
  count: number
}

const buildEntries = (lists: TaskList[], counts: SidebarCounts): Entry[] => [
  {
    selection: { kind: "smart", view: "all" },
    title: "All Tasks",
    icon: "view-list-symbolic",
    count: counts.all,
  },
  {
    selection: { kind: "smart", view: "today" },
    title: "Today",
    icon: "x-office-calendar-symbolic",
    count: counts.today,
  },
  {
    selection: { kind: "smart", view: "important" },
    title: "Important",
    icon: "starred-symbolic",
    count: counts.important,
  },
  ...lists.map((list): Entry => ({
    selection: { kind: "list", listId: list.id },
    title: list.name,
    color: list.color,
    count: counts.lists[list.id] ?? 0,
  })),
  {
    selection: { kind: "smart", view: "trash" },
    title: "Trash",
    icon: "user-trash-symbolic",
    count: counts.trash,
  },
]

export const Sidebar = () => {
  const tasks = useStore((state) => state.tasks)
  const lists = useStore((state) => state.lists)
  const selection = useStore((state) => state.selection)
  const select = useStore((state) => state.select)

  const entries = buildEntries(lists, sidebarCounts(tasks, lists))
  const activeIndex = entries.findIndex(
    (entry) => selectionKey(entry.selection) === selectionKey(selection),
  )
  const listRef = useRef<GtkNs.ListBox | null>(null)

  useEffect(() => {
    const box = listRef.current
    if (!box || activeIndex < 0) {
      return
    }
    const row = box.getRowAtIndex(activeIndex)
    if (row) {
      box.selectRow(row)
    }
  }, [activeIndex])

  return (
    <GtkScrolledWindow vexpand>
      <GtkListBox
        ref={listRef}
        cssClasses={["navigation-sidebar"]}
        onRowSelected={(row) => {
          if (!row) {
            return
          }
          const entry = entries[row.getIndex()]
          if (
            entry &&
            selectionKey(entry.selection) !== selectionKey(selection)
          ) {
            select(entry.selection)
          }
        }}
      >
        {entries.map((entry) => (
          <AdwActionRow
            key={selectionKey(entry.selection)}
            title={entry.title}
            prefix={
              entry.color ? (
                <GtkBox
                  valign={Gtk.Align.CENTER}
                  cssClasses={[listDot(entry.color)]}
                  accessibleRole={Gtk.AccessibleRole.PRESENTATION}
                />
              ) : (
                <GtkImage iconName={entry.icon} />
              )
            }
            suffix={
              entry.count > 0 ? (
                <GtkLabel
                  valign={Gtk.Align.CENTER}
                  cssClasses={["dimmed", "numeric"]}
                >
                  {String(entry.count)}
                </GtkLabel>
              ) : undefined
            }
          />
        ))}
      </GtkListBox>
    </GtkScrolledWindow>
  )
}
