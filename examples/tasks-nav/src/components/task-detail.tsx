// The open task's editor — a conditional render inside the SAME screen as
// the list, never a push (see screens/content-screen.tsx for why that is
// the whole point of this example).
import {
  AdwActionRow,
  AdwClamp,
  AdwEntryRow,
  AdwSwitchRow,
} from "react-native-gtkx/adw"
import {
  GLib,
  Gtk,
  GtkBox,
  GtkButton,
  GtkCalendar,
  GtkListBox,
  GtkMenuButton,
  GtkPopover,
  GtkScrolledWindow,
} from "react-native-gtkx/gtk"
import { formatDue } from "../format"
import { useStore } from "../store"
import type { Task, TaskList } from "../types"

export const TaskDetail = ({ task, list }: { task: Task; list?: TaskList }) => {
  const { setTitle, setDue, toggleDone, toggleImportant } = useStore()
  const dueDate = task.due
    ? GLib.DateTime.newFromIso8601(task.due, null)
    : undefined

  return (
    <GtkScrolledWindow vexpand>
      <AdwClamp
        maximumSize={640}
        marginTop={24}
        marginBottom={24}
        marginStart={12}
        marginEnd={12}
      >
        <GtkListBox
          selectionMode={Gtk.SelectionMode.NONE}
          cssClasses={["boxed-list"]}
        >
          <AdwEntryRow
            title="Title"
            text={task.title}
            onNotifyText={(value) => setTitle(task.id, value ?? "")}
          />
          <AdwSwitchRow
            title="Done"
            active={task.done}
            onNotifyActive={() => toggleDone(task.id)}
          />
          <AdwSwitchRow
            title="Important"
            active={task.important}
            onNotifyActive={() => toggleImportant(task.id)}
          />
          <AdwActionRow
            title="Due"
            suffix={
              <GtkBox
                spacing={6}
                valign={Gtk.Align.CENTER}
              >
                {task.due ? (
                  <GtkButton
                    iconName="edit-clear-symbolic"
                    cssClasses={["flat", "circular"]}
                    accessibleLabel="Clear due date"
                    onClicked={() => setDue(task.id, null)}
                  />
                ) : null}
                <GtkMenuButton
                  label={formatDue(task.due) ?? "Set date"}
                  popover={
                    <GtkPopover>
                      <GtkCalendar
                        date={dueDate}
                        onDaySelected={(self) => {
                          // GtkCalendar has no time component; 18:00 is the
                          // same end-of-day convention the seed data uses,
                          // so "Today at 6:00 PM" reads consistently
                          // whichever way a due date got set.
                          const date = self.getDate()
                          const picked = new Date(
                            date.getYear(),
                            date.getMonth() - 1,
                            date.getDayOfMonth(),
                            18,
                            0,
                            0,
                          )
                          setDue(task.id, picked.toISOString())
                        }}
                      />
                    </GtkPopover>
                  }
                />
              </GtkBox>
            }
          />
          <AdwActionRow
            title="List"
            subtitle={list?.name ?? "—"}
          />
        </GtkListBox>
      </AdwClamp>
    </GtkScrolledWindow>
  )
}
